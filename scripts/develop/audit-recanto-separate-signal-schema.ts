/**
 * Auditoria SOMENTE LEITURA do sinal separado no Supabase Develop.
 * Não aplica migration, não grava e recusa Production.
 * npx tsx scripts/develop/audit-recanto-separate-signal-schema.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';
import { RECANTO_SEPARATE_SIGNAL_ENABLED } from '../../lib/recantoSeparateSignalForm';
import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
  classifySeparateSignalSchemaProbe,
  type SeparateSignalSchemaCatalog,
} from '../../lib/recantoSeparateSignalPersistence';

const EXPECTED_BRANCH = 'feat/recanto-brokerage-installments';
const MIGRATION_VERSION = '20261105143000';

const AUDIT_SQL = `
select json_build_object(
  'columns', coalesce((
    select json_agg(json_build_object(
      'table', c.table_name,
      'name', c.column_name,
      'dataType', c.data_type,
      'nullable', c.is_nullable = 'YES',
      'hasDefault', c.column_default is not null
    ) order by c.table_name, c.column_name)
    from information_schema.columns c
    where c.table_schema = 'public'
      and (
        (c.table_name = 'sales' and c.column_name in (
          'signal_schedule_mode',
          'signal_installment_count',
          'signal_first_due_date',
          'lot_schedule_start_mode',
          'lot_schedule_first_due_date',
          'hold_lot_charges_until_signal_settled',
          'separate_signal_request_key'
        ))
        or (c.table_name = 'finance_receipts' and c.column_name = 'schedule_group')
      )
  ), '[]'::json),
  'constraints', coalesce((
    select json_agg(json_build_object(
      'name', con.conname,
      'definition', pg_get_constraintdef(con.oid)
    ) order by con.conname)
    from pg_constraint con
    where con.conrelid in ('public.sales'::regclass, 'public.finance_receipts'::regclass)
      and con.conname in (
        'sales_signal_schedule_mode_check',
        'sales_lot_schedule_start_mode_check',
        'sales_separate_signal_without_embedded_mode_check',
        'finance_receipts_schedule_group_check',
        'finance_receipts_separate_lot_without_signal_addon_check',
        'finance_receipts_separate_signal_without_addon_check'
      )
  ), '[]'::json),
  'indexes', coalesce((
    select json_agg(json_build_object(
      'name', ic.relname,
      'unique', ix.indisunique,
      'valid', ix.indisvalid,
      'definition', pg_get_indexdef(ix.indexrelid),
      'predicate', pg_get_expr(ix.indpred, ix.indrelid)
    ) order by ic.relname)
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    join pg_class tc on tc.oid = ix.indrelid
    join pg_namespace ns on ns.oid = tc.relnamespace
    where ns.nspname = 'public'
      and ic.relname in (
        'finance_receipts_sale_group_installment_uidx',
        'sales_separate_signal_request_key_uidx'
      )
  ), '[]'::json),
  'receiptUniqueIndexes', coalesce((
    select json_agg(json_build_object(
      'name', ic.relname,
      'unique', ix.indisunique,
      'valid', ix.indisvalid,
      'definition', pg_get_indexdef(ix.indexrelid),
      'predicate', pg_get_expr(ix.indpred, ix.indrelid)
    ) order by ic.relname)
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    join pg_class tc on tc.oid = ix.indrelid
    join pg_namespace ns on ns.oid = tc.relnamespace
    where ns.nspname = 'public'
      and tc.relname = 'finance_receipts'
      and ix.indisunique
  ), '[]'::json),
  'rls', coalesce((
    select json_agg(json_build_object(
      'table', c.relname,
      'enabled', c.relrowsecurity,
      'forced', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('sales', 'finance_receipts')
  ), '[]'::json),
  'policies', coalesce((
    select json_agg(json_build_object(
      'table', p.tablename,
      'name', p.policyname,
      'command', p.cmd,
      'usesTenant', position('tenant_id' in lower(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))) > 0,
      'usesCompany', position('company_id' in lower(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))) > 0
    ) order by p.tablename, p.policyname)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename in ('sales', 'finance_receipts')
  ), '[]'::json),
  'legacy', json_build_object(
    'sales', (select count(*)::int from public.sales),
    'salesModeNull', (select count(*)::int from public.sales where signal_schedule_mode is null),
    'salesEmbedded', (select count(*)::int from public.sales where signal_schedule_mode = 'EMBEDDED'),
    'salesSeparate', (select count(*)::int from public.sales where signal_schedule_mode = 'SEPARATE'),
    'salesOtherMode', (select count(*)::int from public.sales where signal_schedule_mode is not null and signal_schedule_mode not in ('EMBEDDED', 'SEPARATE')),
    'receipts', (select count(*)::int from public.finance_receipts),
    'receiptsGroupNull', (select count(*)::int from public.finance_receipts where schedule_group is null),
    'receiptsSignal', (select count(*)::int from public.finance_receipts where schedule_group = 'SIGNAL'),
    'receiptsLot', (select count(*)::int from public.finance_receipts where schedule_group = 'LOT'),
    'receiptsOtherGroup', (select count(*)::int from public.finance_receipts where schedule_group is not null and schedule_group not in ('SIGNAL', 'LOT'))
  )
) as report
`;

const HISTORY_SQL = `
select
  to_regclass('supabase_migrations.schema_migrations') is not null as table_exists,
  case
    when to_regclass('supabase_migrations.schema_migrations') is null then false
    else exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '${MIGRATION_VERSION}'
    )
  end as version_recorded
`;

function sanitize(value: unknown): string {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, '[token]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .slice(0, 300);
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
    const embedded = user.match(/\.([a-z0-9]+)$/i) || user.match(/^postgres\.([a-z0-9]+)/i);
    return embedded ? embedded[1] : resolveSupabaseProjectRef(`https://${host}`);
  } catch {
    return null;
  }
}

function readEnvFile(file: string): { env: Record<string, string>; jwtBlob: boolean } {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return { env, jwtBlob: false };
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.trim().startsWith('eyJ') && !raw.includes('=')) return { env, jwtBlob: true };
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value || /SENSITIVE|REDACTED/i.test(value)) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!env[key]) env[key] = value;
  }
  return { env, jwtBlob: false };
}

function loadDatabaseUrl(): { url: string; ref: string } {
  const requested = String(process.env.SV_LOTES_DEVELOP_ENV || '').split('|').map((item) => item.trim()).filter(Boolean);
  const root = path.join(__dirname, '..', '..');
  const files = [...requested, path.join(root, '.env.develop.apply')];
  const summary: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const loaded = readEnvFile(file);
    const publicRef = resolveSupabaseProjectRef(loaded.env.NEXT_PUBLIC_SUPABASE_URL || loaded.env.SUPABASE_URL || '');
    const databaseUrl = String(
      loaded.env.DATABASE_URL
      || loaded.env.DIRECT_URL
      || loaded.env.SUPABASE_DB_URL
      || loaded.env.POSTGRES_URL
      || loaded.env.POSTGRES_PRISMA_URL
      || '',
    ).trim();
    const dbRef = /^postgres(?:ql)?:\/\//i.test(databaseUrl) ? databaseRef(databaseUrl) : null;
    const values = Object.values(loaded.env);
    summary.push({
      file: path.basename(file),
      exists: fs.existsSync(file),
      jwtBlob: loaded.jwtBlob,
      publicRef,
      dbRef,
      hasServiceRole: Boolean(loaded.env.SUPABASE_SERVICE_ROLE_KEY),
      containsDevelopRef: values.some((value) => value.includes(DEVELOP_PROJECT_REF)),
      containsProductionRef: values.some((value) => value.includes(PRODUCTION_PROJECT_REF)),
      containsRetiredRef: values.some((value) => value.includes(RETIRED_DEVELOP_PROJECT_REF)),
    });
    if (publicRef === PRODUCTION_PROJECT_REF || dbRef === PRODUCTION_PROJECT_REF) continue;
    if (dbRef !== DEVELOP_PROJECT_REF) continue;
    if (publicRef && publicRef !== DEVELOP_PROJECT_REF) continue;
    return { url: databaseUrl, ref: dbRef };
  }
  const processValues = Object.values(process.env).filter((value): value is string => Boolean(value));
  const processDatabaseUrl = String(
    process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || '',
  ).trim();
  const processDbRef = /^postgres(?:ql)?:\/\//i.test(processDatabaseUrl) ? databaseRef(processDatabaseUrl) : null;
  const processPublicRef = resolveSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '');
  summary.push({
    file: 'process.env',
    exists: true,
    jwtBlob: false,
    publicRef: processPublicRef,
    dbRef: processDbRef,
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    containsDevelopRef: processValues.some((value) => value.includes(DEVELOP_PROJECT_REF)),
    containsProductionRef: processValues.some((value) => value.includes(PRODUCTION_PROJECT_REF)),
    containsRetiredRef: processValues.some((value) => value.includes(RETIRED_DEVELOP_PROJECT_REF)),
  });
  if (processDbRef === DEVELOP_PROJECT_REF && (!processPublicRef || processPublicRef === DEVELOP_PROJECT_REF)) {
    return { url: processDatabaseUrl, ref: processDbRef };
  }
  console.log(JSON.stringify({ abort: 'NO_DEVELOP_DATABASE_URL', files: summary }));
  throw new Error('ABORT: conexão de leitura do Develop não encontrada.');
}

function asCatalog(report: Record<string, unknown>): SeparateSignalSchemaCatalog {
  return {
    columns: Array.isArray(report.columns) ? report.columns : [],
    constraints: Array.isArray(report.constraints) ? report.constraints : [],
    indexes: Array.isArray(report.indexes) ? report.indexes : [],
    receiptUniqueIndexes: Array.isArray(report.receiptUniqueIndexes) ? report.receiptUniqueIndexes : [],
  };
}

async function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  if (branch !== EXPECTED_BRANCH) throw new Error(`ABORT: branch ${branch}.`);
  if (RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED || RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED || RECANTO_SEPARATE_SIGNAL_ENABLED) {
    throw new Error('ABORT: uma flag da modalidade está ligada.');
  }

  const target = loadDatabaseUrl();
  const require = createRequire(__filename);
  const { Client } = require('pg') as {
    Client: new (cfg: { connectionString: string; ssl?: object }) => {
      connect: () => Promise<void>;
      query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
      end: () => Promise<void>;
    };
  };
  const client = new Client({ connectionString: target.url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin read only');
    try {
      const audited = await client.query(AUDIT_SQL);
    let history: { readable: boolean; tableExists: boolean | null; versionRecorded: boolean | null; safeMessage?: string };
    try {
      const recorded = await client.query(HISTORY_SQL);
      const row = recorded.rows[0] ?? {};
      history = {
        readable: true,
        tableExists: row.table_exists === true,
        versionRecorded: row.version_recorded === true,
      };
    } catch (error) {
      history = {
        readable: false,
        tableExists: null,
        versionRecorded: null,
        safeMessage: sanitize(error instanceof Error ? error.message : error),
      };
    }
    await client.query('rollback');

    const report = (audited.rows[0]?.report ?? {}) as Record<string, unknown>;
    const probe = classifySeparateSignalSchemaProbe({ catalog: asCatalog(report) });
    const rls = Array.isArray(report.rls) ? report.rls as Array<{ table?: string; enabled?: boolean }> : [];
    const policies = Array.isArray(report.policies)
      ? report.policies as Array<{ table?: string; name?: string; usesTenant?: boolean; usesCompany?: boolean }>
      : [];
    const salesRls = rls.find((item) => item.table === 'sales')?.enabled === true;
    const receiptRls = rls.find((item) => item.table === 'finance_receipts')?.enabled === true;
    const salesPolicy = policies.some((item) => item.table === 'sales' && item.name === 'tenant_isolation_sales' && item.usesTenant);
    const receiptPolicy = policies.some((item) => item.table === 'finance_receipts' && item.name === 'tenant_isolation_finance_receipts' && item.usesTenant);
    const output = {
      ref: target.ref,
      productionRefUsed: false,
      writes: 0,
      flags: {
        schemaApplied: RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
        persistEnabled: RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
        formEnabled: RECANTO_SEPARATE_SIGNAL_ENABLED,
      },
      probe,
      columns: report.columns,
      constraints: report.constraints,
      indexes: report.indexes,
      receiptUniqueIndexes: report.receiptUniqueIndexes,
      rls,
      policies,
      legacy: report.legacy,
      migrationHistory: history,
      rlsPreserved: salesRls && receiptRls && salesPolicy && receiptPolicy,
    };
    console.log(JSON.stringify(output, null, 2));
      if (probe.status !== 'MIGRATED' || !output.rlsPreserved) process.exitCode = 1;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      if (/column\s+"?(signal_schedule_mode|schedule_group)"?\s+does not exist/i.test(message)) {
        console.log(JSON.stringify({
          ref: target.ref,
          productionRefUsed: false,
          writes: 0,
          probe: { status: 'NOT_MIGRATED' },
          flags: {
            schemaApplied: RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
            persistEnabled: RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
            formEnabled: RECANTO_SEPARATE_SIGNAL_ENABLED,
          },
        }, null, 2));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.includes('audit-recanto-separate-signal-schema')) {
  main().catch((error) => {
    console.error(sanitize(error instanceof Error ? error.message : error));
    process.exit(1);
  });
}
