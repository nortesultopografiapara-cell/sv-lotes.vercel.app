/**
 * Validação SOMENTE LEITURA de sale_lot_swaps no DEVELOP.
 * Não aplica SQL. Não escreve. Recusa Production.
 * npx tsx scripts/develop/validate-sale-lot-swaps.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';
import { currentGitBranch } from './guard';

const DEVELOP_URL = `https://${DEVELOP_PROJECT_REF}.supabase.co`;
const EXPECTED_COLUMNS = [
  'id',
  'company_id',
  'tenant_id',
  'sale_id',
  'customer_id',
  'from_project_id',
  'from_block_id',
  'to_project_id',
  'to_block_id',
  'from_contract_id',
  'to_contract_id',
  'old_sale_price',
  'new_lot_price',
  'total_paid',
  'transferable_credit',
  'old_balance',
  'price_difference',
  'new_balance',
  'financial_snapshot',
  'reason',
  'reason_detail',
  'status',
  'operator_user_id',
  'executed_at',
  'idempotency_key',
  'document_number',
  'document_id',
  'document_status',
  'created_at',
  'updated_at',
] as const;

const EXPECTED_INDEXES = [
  'sale_lot_swaps_pkey',
  'sale_lot_swaps_sale_inflight_uidx',
  'sale_lot_swaps_idempotency_uidx',
  'sale_lot_swaps_document_number_uidx',
  'sale_lot_swaps_company_sale_idx',
  'sale_lot_swaps_from_block_idx',
  'sale_lot_swaps_to_block_idx',
] as const;

function loadMaybeKey(): { kind: string; key: string | null; source: string } {
  const root = path.join(__dirname, '..', '..');
  const applyPath = path.join(root, '.env.develop.apply');
  if (fs.existsSync(applyPath)) {
    const raw = fs.readFileSync(applyPath, 'utf8').trim();
    if (raw.startsWith('eyJ') && !raw.includes('=')) {
      return { kind: 'jwt-blob', key: raw, source: '.env.develop.apply' };
    }
    const env: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val || /SENSITIVE|REDACTED/i.test(val)) continue;
      env[t.slice(0, eq).trim()] = val;
    }
    const urlRef = resolveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || DEVELOP_URL);
    if (urlRef === PRODUCTION_PROJECT_REF || urlRef === RETIRED_DEVELOP_PROJECT_REF) {
      throw new Error(`ABORT: .env.develop.apply aponta para ref=${urlRef}`);
    }
    const service = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
    if (service) return { kind: 'env-file', key: service, source: '.env.develop.apply' };
  }
  return { kind: 'missing', key: null, source: 'none' };
}

const VALIDATE_SQL = `
select json_build_object(
  'tableExists', to_regclass('public.sale_lot_swaps') is not null,
  'contractOpsExists', to_regclass('public.sale_contract_operations') is not null,
  'rls', (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sale_lot_swaps'
  ),
  'rowCount', (select count(*)::int from public.sale_lot_swaps),
  'columns', (
    select json_agg(json_build_object(
      'column_name', column_name,
      'data_type', data_type,
      'udt_name', udt_name,
      'is_nullable', is_nullable,
      'column_default', column_default
    ) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_lot_swaps'
  ),
  'indexes', (
    select json_agg(json_build_object('indexname', indexname, 'indexdef', indexdef) order by indexname)
    from pg_indexes
    where schemaname = 'public' and tablename = 'sale_lot_swaps'
  ),
  'policies', (
    select json_agg(json_build_object('policyname', policyname, 'cmd', cmd) order by policyname)
    from pg_policies
    where schemaname = 'public' and tablename = 'sale_lot_swaps'
  ),
  'grants', (
    select json_agg(json_build_object('grantee', grantee, 'privilege_type', privilege_type) order by grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'sale_lot_swaps'
  ),
  'fks', (
    select json_agg(json_build_object(
      'conname', con.conname,
      'contype', con.contype,
      'def', pg_get_constraintdef(con.oid)
    ) order by con.conname)
    from pg_constraint con
    where con.conrelid = 'public.sale_lot_swaps'::regclass
  )
) as report;
`;

async function main() {
  const branch = currentGitBranch();
  if (branch === 'main') {
    throw new Error('ABORT: branch main — validação de escrita DEVELOP não corre em main.');
  }

  const cred = loadMaybeKey();
  if (!cred.key) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'NO_DEVELOP_KEY',
        branch,
        expectedRef: DEVELOP_PROJECT_REF,
        hint: 'Validação live precisa de JWT/service role do projeto hoynysmynxncdlptuzub (somente leitura).',
      }),
    );
    process.exit(2);
  }

  const sb = createClient(DEVELOP_URL, cred.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rpc = await sb.rpc('exec_sql', { query: VALIDATE_SQL });
  if (rpc.error) {
    const colSelect = EXPECTED_COLUMNS.join(', ');
    const probe = await sb.from('sale_lot_swaps').select(colSelect, { count: 'exact', head: true });
    const ops = await sb.from('sale_contract_operations').select('id', { count: 'exact', head: true });
    const openapiRes = await fetch(`${DEVELOP_URL}/rest/v1/`, {
      headers: {
        apikey: cred.key,
        Authorization: `Bearer ${cred.key}`,
        Accept: 'application/openapi+json',
      },
    });
    let openapiCols: string[] = [];
    let openapiHasTable = false;
    if (openapiRes.ok) {
      const spec = (await openapiRes.json()) as {
        definitions?: Record<string, { properties?: Record<string, unknown> }>;
      };
      const def = spec.definitions?.sale_lot_swaps;
      openapiHasTable = Boolean(def);
      openapiCols = Object.keys(def?.properties || {});
    }
    const missingOpenapi = EXPECTED_COLUMNS.filter((c) => !openapiCols.includes(c));
    const opsMissing =
      Boolean(ops.error) &&
      /sale_contract_operations|schema cache|PGRST205|does not exist/i.test(
        String(ops.error.message || ops.error.code || ''),
      );
    const restOk =
      !probe.error &&
      Number(probe.count) === 0 &&
      (openapiCols.length === 0 || missingOpenapi.length === 0);
    console.log(
      JSON.stringify(
        {
          ok: restOk,
          mode: 'rest-fallback',
          execSqlUnavailable: rpc.error.message.slice(0, 120),
          tableExists: !probe.error,
          rowCount: probe.count,
          columnSelectError: probe.error ? String(probe.error.message).slice(0, 240) : null,
          openapiHasTable,
          openapiColumnCount: openapiCols.length,
          missingOpenapiCols: missingOpenapi,
          contractOpsExists: ops.error ? false : true,
          contractOpsError: ops.error ? String(ops.error.message).slice(0, 180) : null,
          contractOpsCount: ops.error ? null : ops.count,
          contractOpsCreatedByThisMigration: false,
          openapiColumns: openapiCols,
          rlsLiveUnverified: true,
          indexesLiveUnverified: true,
          grantsLiveUnverified: true,
          note: 'exec_sql ausente no DEVELOP; colunas conferidas via REST/OpenAPI. RLS/índices exigem information_schema.',
          keySource: cred.source,
          keyKind: cred.kind,
          target: DEVELOP_PROJECT_REF,
          mutation: false,
        },
        null,
        2,
      ),
    );
    process.exit(restOk ? 0 : 1);
  }

  const report = (rpc.data as { report?: unknown }[] | { report?: unknown } | null) as
    | { report?: Record<string, unknown> }
    | Array<{ report?: Record<string, unknown> }>
    | null;
  const row = Array.isArray(report) ? report[0]?.report : report?.report || report;
  const data = (row || {}) as {
    tableExists?: boolean;
    contractOpsExists?: boolean;
    rls?: boolean;
    rowCount?: number;
    columns?: Array<{ column_name: string; data_type: string; is_nullable: string }>;
    indexes?: Array<{ indexname: string; indexdef: string }>;
    policies?: Array<{ policyname: string }>;
    grants?: Array<{ grantee: string; privilege_type: string }>;
    fks?: Array<{ conname: string; contype: string; def: string }>;
  };

  const colNames = (data.columns || []).map((c) => c.column_name);
  const missingCols = EXPECTED_COLUMNS.filter((c) => !colNames.includes(c));
  const indexNames = (data.indexes || []).map((i) => i.indexname);
  const missingIdx = EXPECTED_INDEXES.filter((i) => !indexNames.includes(i));
  const idempotency = (data.indexes || []).some(
    (i) =>
      i.indexname === 'sale_lot_swaps_idempotency_uidx' &&
      /UNIQUE/i.test(i.indexdef) &&
      i.indexdef.includes('company_id') &&
      i.indexdef.includes('idempotency_key'),
  );
  const policyOk = (data.policies || []).some((p) => p.policyname === 'sale_lot_swaps_tenant_all');
  const authGrants = (data.grants || []).filter((g) => g.grantee === 'authenticated');
  const authHasDelete = authGrants.some((g) => g.privilege_type === 'DELETE');
  const authHasSelect = authGrants.some((g) => g.privilege_type === 'SELECT');

  const ok =
    data.tableExists === true &&
    data.contractOpsExists !== true &&
    data.rls === true &&
    Number(data.rowCount) === 0 &&
    missingCols.length === 0 &&
    missingIdx.length === 0 &&
    idempotency &&
    policyOk &&
    authHasSelect &&
    !authHasDelete;

  console.log(
    JSON.stringify(
      {
        ok,
        branch,
        targetRef: DEVELOP_PROJECT_REF,
        productionForbidden: PRODUCTION_PROJECT_REF,
        tableExists: data.tableExists,
        rls: data.rls,
        rowCount: data.rowCount,
        missingCols,
        missingIdx,
        idempotencyUnique: idempotency,
        policy: (data.policies || []).map((p) => p.policyname),
        authenticatedGrants: authGrants.map((g) => g.privilege_type),
        fkCount: (data.fks || []).length,
        fks: (data.fks || []).map((f) => ({ name: f.conname, type: f.contype })),
        contractOpsExists: data.contractOpsExists,
        columns: data.columns,
        indexes: (data.indexes || []).map((i) => i.indexname),
        keySource: cred.source,
        mutation: false,
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
