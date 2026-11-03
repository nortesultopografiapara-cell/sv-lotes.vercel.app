/**
 * Aplica sales.lf_contract_snapshot_json SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-sales-lf-contract-snapshot.ts
 *
 * Não aplica em Production. Sem backfill. Não altera vendas existentes.
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

const MIGRATION = '20261027120000_sales_lf_contract_snapshot_json.sql';
const TABLE = 'sales';
const COLUMN = 'lf_contract_snapshot_json';

function loadMergedEnv(): Record<string, string> {
  const files = ['.env.develop.apply', '.env.local', '.env.vercel.preview.live'];
  const merged: Record<string, string> = {};
  const root = path.join(__dirname, '..', '..');
  for (const file of files) {
    const abs = path.join(root, file);
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

async function main() {
  const target = assertDevelopWriteAllowed();
  assertNotContractOperationsMigration(MIGRATION);
  const sqlPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (
    /\bDROP COLUMN\b/i.test(sql) ||
    /\bDELETE FROM\b/i.test(sql) ||
    /\bTRUNCATE\b/i.test(sql) ||
    /\bDROP TABLE\b/i.test(sql) ||
    /\bUPDATE\s+public\./i.test(sql)
  ) {
    throw new Error('ABORT: SQL não é aditivo / contém backfill.');
  }
  if (!sql.includes(COLUMN) || !sql.includes('sales')) {
    throw new Error('ABORT: SQL fora do escopo snapshot LF por venda.');
  }

  console.log(
    JSON.stringify(
      {
        step: 'preflight',
        branch: target.branch,
        ref: target.ref,
        expected: DEVELOP_PROJECT_REF,
        productionForbidden: PRODUCTION_PROJECT_REF,
        migration: MIGRATION,
        additive: true,
        backfill: false,
      },
      null,
      2,
    ),
  );

  const env = loadMergedEnv();
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const require = createRequire(__filename);

  async function verifyViaRest(): Promise<{
    columnPresent: boolean;
    error?: string;
  }> {
    if (!loaded.url || !loaded.service || /SENSITIVE/i.test(loaded.service)) {
      return { columnPresent: false, error: 'NO_SERVICE_ROLE' };
    }
    const { createClient } = require('@supabase/supabase-js') as {
      createClient: (
        url: string,
        key: string,
      ) => {
        from: (t: string) => {
          select: (c: string) => {
            limit: (n: number) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
    const sb = createClient(loaded.url, loaded.service);
    const probe = await sb.from(TABLE).select(COLUMN).limit(1);
    if (!probe.error) return { columnPresent: true };
    return { columnPresent: false, error: probe.error.message };
  }

  if (!dbUrl) {
    const { createClient } = require('@supabase/supabase-js') as {
      createClient: (
        url: string,
        key: string,
      ) => {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const sb = createClient(loaded.url, loaded.service);
    const rpc = await sb.rpc('exec_sql', { query: sql });
    if (rpc.error) {
      console.log(
        JSON.stringify({
          ok: false,
          abort: 'EXEC_SQL_UNAVAILABLE',
          hint: 'Execute o SQL no SQL Editor DEVELOP (hoynysmynxncdlptuzub). Não aplicar em Production.',
          supabaseRef: loaded.ref,
          migration: MIGRATION,
          rpc: rpc.error.message.slice(0, 160),
        }),
      );
      process.exit(2);
    }
    const verified = await verifyViaRest();
    console.log(
      JSON.stringify(
        {
          ok: verified.columnPresent,
          appliedVia: 'exec_sql',
          appliedRef: loaded.ref,
          branch: target.branch,
          columnPresent: verified.columnPresent,
          productionTouched: false,
        },
        null,
        2,
      ),
    );
    if (!verified.columnPresent) process.exit(1);
    return;
  }

  const dbRef = databaseUrlRef(dbUrl);
  if (dbRef === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: DATABASE_URL aponta para Production.');
  }
  if (dbRef !== DEVELOP_PROJECT_REF) {
    throw new Error(
      `ABORT: DATABASE_URL ref=${dbRef || 'null'} esperado=${DEVELOP_PROJECT_REF}`,
    );
  }

  let Client: new (cfg: { connectionString: string; ssl?: object }) => {
    connect: () => Promise<void>;
    query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    end: () => Promise<void>;
  };
  try {
    ({ Client } = require('pg'));
  } catch {
    console.log(JSON.stringify({ ok: false, abort: 'PG_MODULE_MISSING', hint: 'npm i pg' }));
    process.exit(2);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const check = await client.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = '${TABLE}'
        and column_name = '${COLUMN}'
    `);
    const populated = await client.query(`
      select count(*)::int as n
      from public.sales
      where lf_contract_snapshot_json is not null
    `);
    const row = check.rows[0];
    const ok =
      String(row?.column_name) === COLUMN &&
      String(row?.is_nullable) === 'YES' &&
      Number(populated.rows[0]?.n || 0) === 0;
    console.log(
      JSON.stringify(
        {
          ok,
          appliedRef: dbRef,
          branch: target.branch,
          column: row || null,
          existingNonNullRows: populated.rows[0]?.n ?? null,
          productionTouched: false,
          backfill: false,
        },
        null,
        2,
      ),
    );
    if (!ok) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
