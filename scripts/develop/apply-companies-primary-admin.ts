/**
 * Aplica a migration do Administrador Principal SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-companies-primary-admin.ts
 *
 * Não aplica em Production. Sem backfill.
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

const MIGRATION = '20261020120000_companies_primary_admin_user_id.sql';
const TABLE = 'companies';
const EXPECTED_COLUMNS = ['primary_admin_user_id'] as const;

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
  if (!/primary_admin_user_id/.test(sql)) {
    throw new Error('ABORT: SQL fora do escopo da Fase 0.');
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

  const extra = process.env.SV_LOTES_DEVELOP_ENV
    ? loadMergedEnvFrom(process.env.SV_LOTES_DEVELOP_ENV)
    : {};
  const env = { ...loadMergedEnv(), ...extra };
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'NO_DATABASE_URL',
        hint: 'Execute o SQL no SQL Editor DEVELOP (hoynysmynxncdlptuzub). Não aplicar em Production.',
        supabaseUrlSource: loaded.source,
        supabaseRef: loaded.ref,
      }),
    );
    process.exit(2);
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

  const require = createRequire(__filename);
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
        and column_name = 'primary_admin_user_id'
    `);
    const fk = await client.query(`
      select conname
      from pg_constraint
      where conname = 'companies_primary_admin_user_id_fkey'
        and conrelid = 'public.companies'::regclass
    `);
    const names = check.rows.map((r) => String(r.column_name));
    const missing = EXPECTED_COLUMNS.filter((n) => !names.includes(n));
    const nonNullable = check.rows.filter((r) => String(r.is_nullable) !== 'YES');
    console.log(
      JSON.stringify(
        {
          ok: missing.length === 0 && nonNullable.length === 0 && fk.rows.length === 1,
          appliedRef: dbRef,
          columns: check.rows,
          foreignKey: fk.rows,
          missing,
          nonNullable: nonNullable.map((r) => r.column_name),
          backfill: false,
        },
        null,
        2,
      ),
    );
    if (missing.length > 0 || nonNullable.length > 0 || fk.rows.length !== 1) process.exit(1);
  } finally {
    await client.end();
  }
}

function loadMergedEnvFrom(file: string): Record<string, string> {
  const merged: Record<string, string> = {};
  if (!fs.existsSync(file)) return merged;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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
    merged[key] = val;
  }
  return merged;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
