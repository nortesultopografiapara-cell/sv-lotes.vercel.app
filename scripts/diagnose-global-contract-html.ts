/**
 * Diagnóstico READ-ONLY — HTML global de contratos (todas as empresas).
 *
 * Uso:
 *   npx tsx scripts/diagnose-global-contract-html.ts
 *   npx tsx scripts/diagnose-global-contract-html.ts --contract 000000011/2026
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * (.env.production.local ou variáveis de ambiente).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import {
  contractHtmlLooksLikeFullBody,
  measureContractHtmlColumns,
  resolveStoredContractHtmlMeta,
} from '../lib/contractHtmlGlobal';
import { resolveSaleContractModel } from '../lib/contractModel';

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.production.local');
loadEnvFile('.env.local');

const CONTRACT_ARG = process.argv.includes('--contract')
  ? process.argv[process.argv.indexOf('--contract') + 1]
  : null;

const TENANT_SAMPLES = [
  { label: 'Menezes', tenantId: MENESES_COMPANY_ID },
  { label: 'SV Topografia', tenantId: TOPOGRAFIA_COMPANY_ID },
];

async function probeHtmlColumns(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const candidates = [
    'generated_html',
    'html_content',
    'contract_html',
    'content',
    'html',
    'updated_at',
    'needs_regenerar',
    'contract_model',
  ];
  const present: string[] = [];
  for (const col of candidates) {
    const { error } = await supabase.from('contracts').select(col).limit(1);
    if (!error) present.push(col);
  }
  return present;
}

async function loadLatestContractForTenant(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
) {
  const filters = [
    () => supabase.from('contracts').select('*').eq('tenant_id', tenantId),
    () => supabase.from('contracts').select('*').eq('company_id', tenantId),
  ];

  for (const run of filters) {
    const { data, error } = await run()
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
  }
  return null;
}

async function loadContractByNumber(
  supabase: ReturnType<typeof createClient>,
  contractNumber: string,
) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('contract_number', contractNumber)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

async function loadCompanyModel(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
) {
  const { data } = await supabase
    .from('companies')
    .select('id, name, contract_model, cpf, cnpj')
    .eq('id', tenantId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

function reportContract(
  label: string,
  contract: Record<string, unknown>,
  company: Record<string, unknown> | null,
) {
  const meta = resolveStoredContractHtmlMeta(contract);
  const lengths = measureContractHtmlColumns(contract);
  const model = company
    ? resolveSaleContractModel(company)
    : resolveSaleContractModel(null);

  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        id: contract.id,
        contract_number: contract.contract_number,
        company_id: contract.company_id,
        tenant_id: contract.tenant_id,
        sale_id: contract.sale_id,
        contract_model: model,
        company_name: company?.name ?? null,
        status: contract.status,
        version: contract.version,
        created_at: contract.created_at,
        updated_at: contract.updated_at ?? null,
        html_column_lengths: lengths,
        html_column_used: meta.column,
        html_length: meta.length,
        html_has_body: meta.html ? contractHtmlLooksLikeFullBody(meta.html) : false,
        html_preview_start: meta.previewStart,
        html_preview_end: meta.previewEnd,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para diagnóstico em produção.',
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const columns = await probeHtmlColumns(supabase);
  console.log('=== COLUNAS HTML PRESENTES EM contracts ===');
  console.log(JSON.stringify(columns, null, 2));

  if (CONTRACT_ARG) {
    const row = await loadContractByNumber(supabase, CONTRACT_ARG);
    if (!row) {
      console.error(`Contrato não encontrado: ${CONTRACT_ARG}`);
      process.exit(1);
    }
    const tenantId = String(row.tenant_id || row.company_id || '');
    const company = tenantId
      ? await loadCompanyModel(supabase, tenantId)
      : null;
    reportContract(`Contrato ${CONTRACT_ARG}`, row, company);
    return;
  }

  for (const sample of TENANT_SAMPLES) {
    const row = await loadLatestContractForTenant(supabase, sample.tenantId);
    if (!row) {
      console.warn(`\n=== ${sample.label} — nenhum contrato encontrado ===`);
      continue;
    }
    const company = await loadCompanyModel(supabase, sample.tenantId);
    reportContract(`${sample.label} (último contrato)`, row, company);
  }

  const { data: ivanildeCompany } = await supabase
    .from('companies')
    .select('id, name, contract_model, cpf')
    .or('cpf.eq.32641281104,cpf.eq.326.412.811-04')
    .limit(1)
    .maybeSingle();

  if (ivanildeCompany?.id) {
    const row = await loadLatestContractForTenant(
      supabase,
      String(ivanildeCompany.id),
    );
    if (row) {
      reportContract('Dona Ivanilde / Recanto (último contrato)', row, ivanildeCompany);
    } else {
      console.warn('\n=== Dona Ivanilde — empresa encontrada, sem contratos ===');
    }
  } else {
    console.warn('\n=== Dona Ivanilde — empresa não localizada por CPF ===');
  }

  console.log('\nDiagnóstico concluído (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
