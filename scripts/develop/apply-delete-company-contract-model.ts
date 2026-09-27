/**
 * Aplica a RPC de exclusão segura de modelos SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-delete-company-contract-model.ts
 *
 * Não aplica em Production. Não apaga modelos; só cria/substitui a função.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  assertDevelopWriteAllowed,
  assertNotContractOperationsMigration,
  loadDevelopEnv,
} from './guard';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';

const MIGRATION = '20261028122000_delete_company_contract_model.sql';
const RPC = 'delete_company_contract_model';

function loadMergedEnv(): Record<string, string> {
  const extra = process.env.SV_LOTES_DEVELOP_ENV;
  const files = [
    extra,
    '.env.develop.apply',
    '.env.local',
    '.env.vercel.preview.live',
  ].filter((f): f is string => Boolean(f));
  const merged: Record<string, string> = {};
  const root = path.join(__dirname, '..', '..');
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val || /SENSITIVE|REDACTED/i.test(val)) continue;
      if (!merged[key]) merged[key] = val;
    }
  }
  return merged;
}

function resolveDatabaseUrl(env: Record<string, string>): string | null {
  const keys = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL'];
  for (const key of keys) {
    const v = String(env[key] || process.env[key] || '').trim();
    if (v && /^postgres(ql)?:\/\//i.test(v) && !/SENSITIVE|REDACTED/i.test(v)) {
      return v;
    }
  }
  return null;
}

function databaseUrlRef(url: string): string | null {
  try {
    const u = new URL(url.replace(/^postgresql:/i, 'postgres:'));
    const host = u.hostname.toLowerCase();
    const db = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (db) return db[1];
    const pool = host.match(/^([a-z0-9]+)\.pooler\.supabase\.com$/i);
    if (pool) return pool[1];
    const user = decodeURIComponent(u.username || '');
    const mm =
      user.match(/\.([a-z0-9]+)$/i) || user.match(/^postgres\.([a-z0-9]+)/i);
    return mm ? mm[1] : resolveSupabaseProjectRef(`https://${host}`);
  } catch {
    return null;
  }
}

function assertAdditiveDeleteRpc(sql: string) {
  if (/\bDROP TABLE\b/i.test(sql) || /\bTRUNCATE\b/i.test(sql) || /\bDROP COLUMN\b/i.test(sql)) {
    throw new Error('ABORT: SQL destrutivo.');
  }
  if (/\bUPDATE\s+public\.(contracts|sales|companies|projects)\b/i.test(sql)) {
    throw new Error('ABORT: SQL atualizaria tabelas históricas.');
  }
  if (/\bDELETE FROM public\.(sales|contracts|companies|projects)\b/i.test(sql)) {
    throw new Error('ABORT: SQL apagaria tabelas históricas.');
  }
  if (!sql.includes(`CREATE OR REPLACE FUNCTION public.${RPC}`)) {
    throw new Error('ABORT: SQL sem a RPC de exclusão.');
  }
  if (!sql.includes('SECURITY DEFINER')) {
    throw new Error('ABORT: RPC precisa ser SECURITY DEFINER.');
  }
}

type Sb = {
  from: (t: string) => {
    select: (
      c: string,
      opts?: { count?: 'exact'; head?: boolean },
    ) => Promise<{
      count: number | null;
      error: { message: string } | null;
    }>;
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
};

function createServiceClient(url: string, service: string): Sb {
  const require = createRequire(__filename);
  const { createClient } = require('@supabase/supabase-js') as {
    createClient: (url: string, key: string) => Sb;
  };
  return createClient(url, service);
}

async function probeCounts(sb: Sb) {
  const [models, versions, contracts, sales] = await Promise.all([
    sb.from('company_contract_models').select('id', { count: 'exact', head: true }),
    sb.from('company_contract_model_versions').select('id', { count: 'exact', head: true }),
    sb.from('contracts').select('id', { count: 'exact', head: true }),
    sb.from('sales').select('id', { count: 'exact', head: true }),
  ]);
  return {
    models: models.count,
    versions: versions.count,
    contracts: contracts.count,
    sales: sales.count,
    errors: [models.error, versions.error, contracts.error, sales.error]
      .filter(Boolean)
      .map((e) => e!.message.slice(0, 120)),
  };
}

async function verifyRpc(sb: Sb) {
  const probe = await sb.rpc(RPC, {
    p_model_id: '00000000-0000-0000-0000-000000000000',
  });
  const msg = String(probe.error?.message || '');
  if (/could not find the function|schema cache|PGRST202/i.test(msg) || probe.error?.code === 'PGRST202') {
    return { present: false, message: msg.slice(0, 160) };
  }
  return { present: true, message: msg.slice(0, 160) || 'ok' };
}

async function applyViaPg(dbUrl: string, sql: string) {
  const require = createRequire(__filename);
  const { Client } = require('pg') as {
    Client: new (cfg: { connectionString: string; ssl?: object }) => {
      connect: () => Promise<void>;
      query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
      end: () => Promise<void>;
    };
  };
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const before = await client.query(`
      select
        (select count(*)::int from public.company_contract_models) as models,
        (select count(*)::int from public.company_contract_model_versions) as versions,
        (select count(*)::int from public.contracts) as contracts,
        (select count(*)::int from public.sales) as sales
    `);
    await client.query(sql);
    const after = await client.query(`
      select
        (select count(*)::int from public.company_contract_models) as models,
        (select count(*)::int from public.company_contract_model_versions) as versions,
        (select count(*)::int from public.contracts) as contracts,
        (select count(*)::int from public.sales) as sales,
        exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = '${RPC}'
        ) as rpc_present
    `);
    return { before: before.rows[0], after: after.rows[0] };
  } finally {
    await client.end();
  }
}

async function main() {
  const target = assertDevelopWriteAllowed();
  assertNotContractOperationsMigration(MIGRATION);
  if (target.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: host alvo é Production.');
  }
  if (target.ref !== DEVELOP_PROJECT_REF) {
    throw new Error(`ABORT: ref ${target.ref} não é DEVELOP.`);
  }

  const sqlPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assertAdditiveDeleteRpc(sql);

  console.log(
    JSON.stringify(
      {
        step: 'preflight',
        branch: target.branch,
        ref: target.ref,
        expected: DEVELOP_PROJECT_REF,
        productionForbidden: PRODUCTION_PROJECT_REF,
        migration: MIGRATION,
        deletesExistingModels: false,
        productionTouched: false,
      },
      null,
      2,
    ),
  );

  const env = loadMergedEnv();
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);

  if (dbUrl) {
    const dbRef = databaseUrlRef(dbUrl);
    if (dbRef === PRODUCTION_PROJECT_REF) {
      throw new Error('ABORT: DATABASE_URL aponta para Production.');
    }
    if (dbRef !== DEVELOP_PROJECT_REF) {
      throw new Error(`ABORT: DATABASE_URL ref=${dbRef || 'null'}`);
    }
    const result = await applyViaPg(dbUrl, sql);
    const unchanged =
      Number(result.before.models) === Number(result.after.models) &&
      Number(result.before.versions) === Number(result.after.versions) &&
      Number(result.before.contracts) === Number(result.after.contracts) &&
      Number(result.before.sales) === Number(result.after.sales);
    console.log(
      JSON.stringify(
        {
          ok: unchanged && Boolean(result.after.rpc_present),
          appliedRef: dbRef,
          method: 'pg',
          countsUnchanged: unchanged,
          rpcPresent: Boolean(result.after.rpc_present),
          before: result.before,
          after: result.after,
          productionTouched: false,
        },
        null,
        2,
      ),
    );
    if (!unchanged || !result.after.rpc_present) process.exit(1);
    return;
  }

  if (!loaded.service) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'NO_DATABASE_URL',
        hint: 'Cole DATABASE_URL do DEVELOP hoynysmynxncdlptuzub ou execute o SQL no SQL Editor DEVELOP. Não aplicar em Production.',
        supabaseRef: loaded.ref,
        migration: MIGRATION,
      }),
    );
    process.exit(2);
  }

  const sb = createServiceClient(loaded.url, loaded.service);
  const before = await probeCounts(sb);
  const rpc = await sb.rpc('exec_sql', { query: sql });
  if (rpc.error) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'EXEC_SQL_UNAVAILABLE',
        hint: 'Execute o SQL no SQL Editor DEVELOP (hoynysmynxncdlptuzub). Não aplicar em Production.',
        supabaseRef: loaded.ref,
        migration: MIGRATION,
        rpc: rpc.error.message.slice(0, 200),
      }),
    );
    process.exit(2);
  }
  const after = await probeCounts(sb);
  const verified = await verifyRpc(sb);
  const unchanged =
    before.models === after.models &&
    before.versions === after.versions &&
    before.contracts === after.contracts &&
    before.sales === after.sales;
  console.log(
    JSON.stringify(
      {
        ok: unchanged && verified.present,
        appliedRef: loaded.ref,
        method: 'exec_sql',
        countsUnchanged: unchanged,
        rpcPresent: verified.present,
        before,
        after,
        rpcProbe: verified.message,
        productionTouched: false,
      },
      null,
      2,
    ),
  );
  if (!unchanged || !verified.present) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
