/**
 * Backfill controlado dos snapshots de encerramento — SOMENTE DEVELOP.
 *
 *   npx tsx scripts/develop/backfill-termination-policy-snapshots.ts --dry-run
 *   npx tsx scripts/develop/backfill-termination-policy-snapshots.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import {
  assertDevelopWriteAllowed,
  loadDevelopEnv,
} from './guard';
import { PRODUCTION_PROJECT_REF } from '../../lib/homolog/env';
import {
  PREVIEW_ARAGUAIA_PROJECT_NAME,
} from '../../lib/contractModel';
import {
  buildTerminationPolicySnapshot,
  resolveLegacyModelForBackfill,
} from '../../lib/contract-termination/snapshot';

type SaleRow = {
  id: string;
  contract_id?: string | null;
  project_id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  contract_model?: string | null;
  termination_policy_snapshot?: unknown;
};

function hasApplyFlag(argv: string[]) {
  return argv.includes('--apply');
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  const apply = hasApplyFlag(process.argv);
  const dryRun = !apply;
  const target = assertDevelopWriteAllowed();
  if (target.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: Production.');
  }

  const env = loadDevelopEnv();
  if (!env.service || env.service.length < 20) {
    throw new Error('ABORT: SUPABASE_SERVICE_ROLE_KEY ausente para o DEVELOP.');
  }
  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = {
    dryRun,
    ref: target.ref,
    source: target.source,
    analyzed: 0,
    alreadyHadSnapshot: 0,
    filledComplete: 0,
    filledIncomplete: 0,
    filledMissing: 0,
    contractsUpdated: 0,
    errors: [] as string[],
    problemIds: [] as string[],
    nameHintAraguaiaNotPersisted: [] as string[],
  };

  const { data: sales, error: salesErr } = await admin
    .from('sales')
    .select(
      'id, contract_id, project_id, tenant_id, company_id, contract_model, termination_policy_snapshot',
    );
  if (salesErr) {
    throw new Error(`Falha ao listar sales: ${salesErr.message}`);
  }

  const rows = (sales || []) as SaleRow[];
  report.analyzed = rows.length;

  const missing = rows.filter((row) => row.termination_policy_snapshot == null);
  report.alreadyHadSnapshot = rows.length - missing.length;

  const projectIds = [
    ...new Set(missing.map((r) => String(r.project_id || '')).filter(Boolean)),
  ];
  const companyIds = [
    ...new Set(
      missing
        .map((r) => String(r.tenant_id || r.company_id || ''))
        .filter(Boolean),
    ),
  ];
  const contractIds = [
    ...new Set(missing.map((r) => String(r.contract_id || '')).filter(Boolean)),
  ];

  const projects = new Map<string, { contract_model?: string | null; name?: string | null }>();
  const companies = new Map<string, { contract_model?: string | null }>();
  const contracts = new Map<string, { contract_model?: string | null; is_current?: boolean | null }>();

  for (const ids of chunk(projectIds, 200)) {
    const { data } = await admin
      .from('projects')
      .select('id, contract_model, name')
      .in('id', ids);
    for (const row of data || []) {
      projects.set(String((row as { id: string }).id), row as never);
    }
  }
  for (const ids of chunk(companyIds, 200)) {
    const { data } = await admin
      .from('companies')
      .select('id, contract_model')
      .in('id', ids);
    for (const row of data || []) {
      companies.set(String((row as { id: string }).id), row as never);
    }
  }
  for (const ids of chunk(contractIds, 200)) {
    const { data } = await admin
      .from('contracts')
      .select('id, sale_id, contract_model, is_current, termination_policy_snapshot')
      .in('id', ids);
    for (const row of data || []) {
      contracts.set(String((row as { id: string }).id), row as never);
    }
  }

  const updates: Array<{
    id: string;
    persist: ReturnType<typeof buildTerminationPolicySnapshot>;
  }> = [];

  for (const sale of missing) {
    try {
      const project = sale.project_id ? projects.get(String(sale.project_id)) : null;
      const companyId = String(sale.tenant_id || sale.company_id || '');
      const company = companyId ? companies.get(companyId) : null;
      const contract = sale.contract_id ? contracts.get(String(sale.contract_id)) : null;
      const model = resolveLegacyModelForBackfill({
        saleContractModel: sale.contract_model,
        contractContractModel: contract?.contract_model,
        projectContractModel: project?.contract_model,
        companyContractModel: company?.contract_model,
      });

      const projectName = String(project?.name || '')
        .trim()
        .toLowerCase();
      if (
        !model &&
        projectName === PREVIEW_ARAGUAIA_PROJECT_NAME.toLowerCase()
      ) {
        report.nameHintAraguaiaNotPersisted.push(sale.id);
      }

      const persist = buildTerminationPolicySnapshot({
        contractModel: model,
        persistSource: 'backfill_inferred',
      });
      if (persist.termination_policy_snapshot.status === 'COMPLETE') {
        report.filledComplete += 1;
      } else if (persist.termination_policy_snapshot.status === 'INCOMPLETE') {
        report.filledIncomplete += 1;
      } else {
        report.filledMissing += 1;
      }
      updates.push({ id: sale.id, persist });
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
      report.problemIds.push(sale.id);
    }
  }

  if (!dryRun) {
    for (const item of updates) {
      const { error } = await admin
        .from('sales')
        .update({
          termination_policy_snapshot: item.persist.termination_policy_snapshot,
          termination_policy_version: item.persist.termination_policy_version,
          termination_policy_source: item.persist.termination_policy_source,
        })
        .eq('id', item.id)
        .is('termination_policy_snapshot', null);
      if (error) {
        report.errors.push(`${item.id}: ${error.message}`);
        report.problemIds.push(item.id);
        continue;
      }

      const { data: currentContracts, error: contractErr } = await admin
        .from('contracts')
        .select('id, termination_policy_snapshot')
        .eq('sale_id', item.id)
        .eq('is_current', true);
      if (contractErr) {
        report.errors.push(`${item.id} contracts: ${contractErr.message}`);
        continue;
      }
      for (const contract of currentContracts || []) {
        if ((contract as { termination_policy_snapshot?: unknown }).termination_policy_snapshot) {
          continue;
        }
        const { error: copyErr } = await admin
          .from('contracts')
          .update({
            termination_policy_snapshot: item.persist.termination_policy_snapshot,
            termination_policy_version: item.persist.termination_policy_version,
            termination_policy_source: item.persist.termination_policy_source,
          })
          .eq('id', (contract as { id: string }).id)
          .is('termination_policy_snapshot', null);
        if (copyErr) {
          report.errors.push(`${item.id} contract copy: ${copyErr.message}`);
        } else {
          report.contractsUpdated += 1;
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        wouldWriteSales: dryRun ? updates.length : undefined,
        wroteSales: dryRun ? 0 : updates.length - report.problemIds.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
