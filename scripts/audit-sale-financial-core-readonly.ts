/**
 * Leitura do catálogo Develop para a migration do núcleo financeiro.
 * Não grava, não aplica migration e recusa Production.
 * npx tsx scripts/audit-sale-financial-core-readonly.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF, resolveSupabaseProjectRef } from '../lib/homolog/env';

const ENV_FILE = path.resolve(
  process.cwd(),
  '..',
  'sv-lotes-feat-recanto-brokerage-installments',
  '.env.local',
);

function sanitize(value: unknown): string {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, '[token]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .slice(0, 400);
}

function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

function databaseRef(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/^postgresql:/i, 'postgres:'));
    const host = parsed.hostname.toLowerCase();
    const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct) return direct[1];
    const pool = host.match(/^([a-z0-9]+)\.pooler\.supabase\.com$/i);
    if (pool) return pool[1];
    const user = decodeURIComponent(parsed.username || '');
    const embedded = user.match(/\.([a-z0-9]+)$/i);
    return embedded ? embedded[1] : resolveSupabaseProjectRef(`https://${host}`);
  } catch {
    return null;
  }
}

const SQL = `
select json_build_object(
  'columns', (
    select coalesce(json_agg(json_build_object(
      'table', c.table_name,
      'name', c.column_name,
      'dataType', c.data_type,
      'udt', c.udt_name,
      'nullable', c.is_nullable
    ) order by c.table_name, c.column_name), '[]'::json)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('sales', 'cash_movements', 'projects', 'blocks', 'contracts', 'finance_receipts', 'customers')
  ),
  'checks', (
    select coalesce(json_agg(json_build_object('name', con.conname, 'table', rel.relname, 'definition', pg_get_constraintdef(con.oid))), '[]'::json)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('sales', 'cash_movements', 'finance_receipts', 'contracts')
      and con.contype = 'c'
      and (
        con.conname ilike '%buyer%'
        or con.conname ilike '%status%'
        or con.conname ilike '%schedule%'
        or con.conname ilike '%signal%'
      )
  ),
  'indexes', (
    select coalesce(json_agg(json_build_object(
      'name', ic.relname,
      'table', tc.relname,
      'unique', ix.indisunique,
      'valid', ix.indisvalid,
      'definition', pg_get_indexdef(ix.indexrelid)
    ) order by ic.relname), '[]'::json)
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    join pg_class tc on tc.oid = ix.indrelid
    join pg_namespace ns on ns.oid = tc.relnamespace
    where ns.nspname = 'public'
      and (
        ic.relname in (
          'sales_create_request_key_uidx',
          'cash_movements_sale_create_receipt_uidx',
          'contracts_one_current_per_sale_uidx',
          'sales_separate_signal_request_key_uidx'
        )
        or (tc.relname in ('sales', 'cash_movements', 'contracts') and ix.indisunique)
      )
  ),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name', p.proname,
      'identity', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      'securityDefiner', p.prosecdef
    )), '[]'::json)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_sale_financial_core', 'sale_financial_core_fingerprint', 'create_separate_signal_sale_with_receipts', 'execute_authorized_manual_receipt_payment')
  ),
  'sizes', (
    select coalesce(json_agg(json_build_object(
      'table', c.relname,
      'estimate', c.reltuples::bigint,
      'bytes', pg_total_relation_size(c.oid)
    )), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('sales', 'cash_movements', 'contracts', 'blocks', 'projects', 'finance_receipts')
  ),
  'duplicates', json_build_object(
    'saleCreateGroups', (
      select count(*)::int from (
        select 1
        from public.cash_movements
        where status = 'ativo'
          and coalesce(metadata->>'provider', '') = 'SALE_CREATE'
          and coalesce(metadata->>'installment_id', '') <> ''
        group by tenant_id, company_id, metadata->>'installment_id'
        having count(*) > 1
      ) d
    ),
    'saleCreateRows', (
      select count(*)::int
      from public.cash_movements
      where coalesce(metadata->>'provider', '') = 'SALE_CREATE'
    ),
    'activeCashRows', (select count(*)::int from public.cash_movements where status = 'ativo'),
    'cashRows', (select count(*)::int from public.cash_movements),
    'currentContractGroups', (
      select count(*)::int from (
        select 1
        from public.contracts
        where is_current is true and sale_id is not null
        group by tenant_id, sale_id
        having count(*) > 1
      ) d
    ),
    'currentContracts', (
      select count(*)::int from public.contracts where is_current is true and sale_id is not null
    ),
    'salesSeparate', (select count(*)::int from public.sales where signal_schedule_mode = 'SEPARATE'),
    'salesEmbedded', (select count(*)::int from public.sales where signal_schedule_mode = 'EMBEDDED'),
    'salesModeNull', (select count(*)::int from public.sales where signal_schedule_mode is null)
  )
) as report
`;

const NEEDED: Record<string, string[]> = {
  sales: [
    'tenant_id', 'company_id', 'project_id', 'block_id', 'block_number', 'lot_number', 'lot_id',
    'customer_id', 'client_id', 'user_id', 'agreed_price', 'lot_price', 'broker_id', 'payment_type',
    'discount', 'total_value', 'down_payment', 'installments_count', 'installment_correction_type',
    'status', 'signal_contract_value', 'signal_paid_at_sale', 'signal_remaining_value',
    'signal_remaining_payment_mode', 'signal_remaining_installments', 'signal_remaining_installment_value',
    'installment_definition_mode', 'regular_installment_amount', 'has_residual_installment',
    'residual_installment_amount', 'use_balloon_installments', 'balloon_mode', 'balloon_config',
    'financial_account_id', 'contract_model', 'termination_policy_snapshot', 'termination_policy_version',
    'termination_policy_source', 'sale_spouse_name', 'sale_spouse_nationality', 'sale_spouse_marital_status',
    'sale_spouse_profession', 'sale_spouse_rg', 'sale_spouse_rg_issuer', 'sale_spouse_cpf',
    'sale_spouse_phone', 'sale_spouse_email', 'sale_spouse_address', 'signal_schedule_mode',
    'signal_installment_count', 'signal_first_due_date', 'lot_schedule_start_mode',
    'lot_schedule_first_due_date', 'hold_lot_charges_until_signal_settled', 'separate_signal_request_key',
    'buyer_person_type', 'buyer_signature_mode', 'buyer_representatives_json', 'lf_contract_snapshot_json',
    'sale_create_request_key', 'sale_create_request_fingerprint',
  ],
  cash_movements: [
    'tenant_id', 'company_id', 'project_id', 'type', 'category', 'description', 'amount',
    'customer_id', 'sale_id', 'movement_date', 'status', 'created_by', 'metadata', 'created_at',
    'finance_receipt_id',
  ],
  projects: ['id', 'tenant_id', 'company_id'],
  blocks: ['id', 'tenant_id', 'project_id', 'sale_id', 'customer_id', 'broker_id', 'status', 'contract_id', 'price'],
  contracts: ['id', 'tenant_id', 'sale_id', 'is_current', 'created_at', 'contract_number'],
  finance_receipts: [
    'tenant_id', 'company_id', 'sale_id', 'schedule_group', 'installment_number', 'amount',
    'base_amount', 'signal_addon_amount', 'paid_amount', 'paid_at', 'status', 'due_date',
  ],
  customers: ['id', 'tenant_id', 'company_id'],
};

async function api(url: string, service: string, resource: string, headers: Record<string, string> = {}) {
  const response = await fetch(url + resource, {
    headers: { apikey: service, Authorization: `Bearer ${service}`, ...headers },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text, headers: response.headers };
}

function schemaProps(spec: Record<string, unknown>, table: string): Record<string, { type?: string; format?: string }> {
  const definitions = (spec.definitions || {}) as Record<string, { properties?: Record<string, { type?: string; format?: string }> }>;
  if (definitions[table]?.properties) return definitions[table].properties || {};
  const components = spec.components as { schemas?: Record<string, { properties?: Record<string, { type?: string; format?: string }> }> } | undefined;
  return components?.schemas?.[table]?.properties || {};
}

async function countRows(url: string, service: string, resource: string): Promise<number | null> {
  const response = await api(url, service, resource + (resource.includes('?') ? '&' : '?') + 'select=id&limit=1', {
    Prefer: 'count=exact',
    Range: '0-0',
  });
  const range = response.headers.get('content-range') || '';
  const match = range.match(/\/(\d+|\*)$/);
  if (!response.ok && response.status !== 206 && response.status !== 200) return null;
  return match && match[1] !== '*' ? Number(match[1]) : null;
}

async function readThroughApi(url: string, service: string) {
  const specResponse = await api(url, service, '/rest/v1/');
  if (!specResponse.ok) {
    return { openApi: false, status: specResponse.status, message: sanitize(specResponse.text) };
  }
  const spec = JSON.parse(specResponse.text) as Record<string, unknown>;
  const paths = spec.paths as Record<string, unknown> | undefined;
  const columns: Record<string, Array<{ name: string; type: string | null; format: string | null; present: boolean }>> = {};
  for (const [table, names] of Object.entries(NEEDED)) {
    const props = schemaProps(spec, table);
    columns[table] = names.map((name) => ({
      name,
      present: Object.prototype.hasOwnProperty.call(props, name),
      type: props[name]?.type || null,
      format: props[name]?.format || null,
    }));
  }
  const saleCreate = await countRows(url, service, '/rest/v1/cash_movements?metadata->>provider=eq.SALE_CREATE');
  const activeCash = await countRows(url, service, '/rest/v1/cash_movements?status=eq.ativo');
  const cashRows = await countRows(url, service, '/rest/v1/cash_movements');
  const currentContracts = await countRows(url, service, '/rest/v1/contracts?is_current=is.true&sale_id=not.is.null');
  const duplicateContracts = await duplicateCurrentContracts(url, service);
  const saleCreateDuplicateGroups = await duplicateSaleCreate(url, service);
  const modes = {
    separate: await countRows(url, service, '/rest/v1/sales?signal_schedule_mode=eq.SEPARATE'),
    embedded: await countRows(url, service, '/rest/v1/sales?signal_schedule_mode=eq.EMBEDDED'),
    nullMode: await countRows(url, service, '/rest/v1/sales?signal_schedule_mode=is.null'),
  };
  return {
    openApi: true,
    functionsPresent: {
      createSaleFinancialCore: Boolean(paths?.['/rpc/create_sale_financial_core']),
      fingerprint: Boolean(paths?.['/rpc/sale_financial_core_fingerprint']),
      separateSignal: Boolean(paths?.['/rpc/create_separate_signal_sale_with_receipts']),
      manualPayment: Boolean(paths?.['/rpc/execute_authorized_manual_receipt_payment']),
    },
    columns,
    counts: {
      saleCreate,
      activeCash,
      cashRows,
      currentContracts,
      sales: await countRows(url, service, '/rest/v1/sales'),
      contracts: await countRows(url, service, '/rest/v1/contracts'),
      blocks: await countRows(url, service, '/rest/v1/blocks'),
      projects: await countRows(url, service, '/rest/v1/projects'),
      ...modes,
    },
    duplicates: { saleCreateGroups: saleCreateDuplicateGroups, currentContractGroups: duplicateContracts },
    indexesVisible: false,
  };
}

async function duplicateCurrentContracts(url: string, service: string): Promise<number | null> {
  const seen = new Map<string, number>();
  for (let from = 0; from < 20000; from += 1000) {
    const response = await api(
      url,
      service,
      `/rest/v1/contracts?select=tenant_id,sale_id&is_current=is.true&sale_id=not.is.null&order=sale_id.asc`,
      { Range: `${from}-${from + 999}` },
    );
    if (!response.ok && response.status !== 206) return null;
    const rows = JSON.parse(response.text) as Array<{ tenant_id?: string; sale_id?: string }>;
    for (const row of rows) {
      const key = `${row.tenant_id || ''}|${row.sale_id || ''}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    if (rows.length < 1000) break;
  }
  let groups = 0;
  for (const count of seen.values()) if (count > 1) groups += 1;
  return groups;
}

async function duplicateSaleCreate(url: string, service: string): Promise<number | null> {
  const seen = new Map<string, number>();
  for (let from = 0; from < 20000; from += 1000) {
    const response = await api(
      url,
      service,
      `/rest/v1/cash_movements?select=tenant_id,company_id,metadata&metadata->>provider=eq.SALE_CREATE&status=eq.ativo`,
      { Range: `${from}-${from + 999}` },
    );
    if (response.status === 404 || response.status === 400) return 0;
    if (!response.ok && response.status !== 206) return null;
    const rows = JSON.parse(response.text || '[]') as Array<{ tenant_id?: string; company_id?: string; metadata?: { installment_id?: string } }>;
    for (const row of rows) {
      const installment = String(row.metadata?.installment_id || '');
      if (!installment) continue;
      const key = `${row.tenant_id || ''}|${row.company_id || ''}|${installment}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    if (rows.length < 1000) break;
  }
  let groups = 0;
  for (const count of seen.values()) if (count > 1) groups += 1;
  return groups;
}

async function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  if (branch !== 'feat/recanto-signal-initial-cash') {
    throw new Error(`ABORT: branch ${branch}.`);
  }
  const env = readEnv(ENV_FILE);
  const publicRef = resolveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '');
  if (publicRef === PRODUCTION_PROJECT_REF || Object.values(env).some((value) => value.includes(PRODUCTION_PROJECT_REF))) {
    throw new Error('ABORT: o arquivo local aponta para Production.');
  }
  const databaseUrl = String(env.DATABASE_URL || env.DIRECT_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || '').trim();
  const dbRef = /^postgres(?:ql)?:\/\//i.test(databaseUrl) ? databaseRef(databaseUrl) : null;
  if (!fs.existsSync(ENV_FILE) || publicRef !== DEVELOP_PROJECT_REF) {
    console.log(JSON.stringify({
      branch,
      head,
      ref: publicRef,
      envFileFound: fs.existsSync(ENV_FILE),
      abort: 'NO_DEVELOP_SQL_CONNECTION',
      writes: 0,
    }));
    process.exit(2);
  }
  if (dbRef !== DEVELOP_PROJECT_REF) {
    const service = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    if (!service || !url.startsWith('https://')) {
      console.log(JSON.stringify({ branch, head, ref: publicRef, abort: 'NO_DEVELOP_SQL_CONNECTION', writes: 0 }));
      process.exit(2);
    }
    const report = await readThroughApi(url, service);
    console.log(JSON.stringify({
      branch,
      head,
      ref: DEVELOP_PROJECT_REF,
      productionRefUsed: false,
      writes: 0,
      access: 'postgrest-read',
      sqlCatalog: false,
      report,
    }, null, 2));
    return;
  }

  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const { Client } = require('pg') as {
    Client: new (cfg: { connectionString: string; ssl?: object }) => {
      connect: () => Promise<void>;
      query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
      end: () => Promise<void>;
    };
  };
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin read only');
    const result = await client.query(SQL);
    await client.query('rollback');
    console.log(JSON.stringify({
      branch,
      head,
      ref: DEVELOP_PROJECT_REF,
      productionRefUsed: false,
      writes: 0,
      transaction: 'read only',
      report: result.rows[0]?.report ?? null,
    }, null, 2));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(sanitize(error instanceof Error ? error.message : error));
  process.exit(1);
});
