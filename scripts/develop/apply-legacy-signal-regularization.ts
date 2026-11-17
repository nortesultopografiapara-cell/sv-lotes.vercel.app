/**
 * Aplica a regularização de sinal antigo SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-legacy-signal-regularization.ts
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

const MIGRATION = '20261117120000_legacy_signal_regularization.sql';

function loadMergedEnv(): Record<string, string> {
  const files = ['.env.develop.apply', '.env.local', '.env.vercel.preview.live'];
  const merged: Record<string, string> = {};
  const root = path.join(__dirname, '..', '..');
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!value || /SENSITIVE|REDACTED/i.test(value)) continue;
      if (!merged[key]) merged[key] = value;
    }
  }
  return merged;
}

function resolveDatabaseUrl(env: Record<string, string>): string | null {
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL']) {
    const value = String(env[key] || process.env[key] || '').trim();
    if (value && /^postgres(ql)?:\/\//i.test(value) && !/SENSITIVE|REDACTED/i.test(value)) return value;
  }
  return null;
}

function databaseUrlRef(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/^postgresql:/i, 'postgres:'));
    const host = parsed.hostname.toLowerCase();
    const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct) return direct[1];
    const pool = host.match(/^([a-z0-9]+)\.pooler\.supabase\.com$/i);
    if (pool) return pool[1];
    const user = decodeURIComponent(parsed.username || '');
    const match = user.match(/\.([a-z0-9]+)$/i) || user.match(/^postgres\.([a-z0-9]+)/i);
    return match ? match[1] : resolveSupabaseProjectRef(`https://${host}`);
  } catch {
    return null;
  }
}

async function main() {
  const target = assertDevelopWriteAllowed();
  assertNotContractOperationsMigration(MIGRATION);
  const sqlPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (/\bDROP TABLE\b/i.test(sql) || /\bTRUNCATE\b/i.test(sql) || /\bDROP COLUMN\b/i.test(sql)) {
    throw new Error('ABORT: SQL destrutivo.');
  }
  if (!sql.includes('execute_legacy_signal_regularization')) {
    throw new Error('ABORT: SQL fora da regularização de sinal.');
  }

  const env = loadMergedEnv();
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    console.log(JSON.stringify({
      ok: false,
      abort: 'NO_DATABASE_URL',
      hint: 'SQL pronto para o SQL Editor DEVELOP. Não aplicar em Production.',
      supabaseRef: loaded.ref,
    }));
    process.exit(2);
  }
  const dbRef = databaseUrlRef(dbUrl);
  if (dbRef === PRODUCTION_PROJECT_REF) throw new Error('ABORT: DATABASE_URL aponta para Production.');
  if (dbRef !== DEVELOP_PROJECT_REF) throw new Error(`ABORT: DATABASE_URL ref=${dbRef || 'null'} esperado=${DEVELOP_PROJECT_REF}`);

  const require = createRequire(__filename);
  let Client: new (cfg: { connectionString: string; ssl?: object }) => {
    connect: () => Promise<void>;
    query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    end: () => Promise<void>;
  };
  try {
    ({ Client } = require('pg'));
  } catch {
    console.log(JSON.stringify({ ok: false, abort: 'PG_MODULE_MISSING' }));
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    const fn = await client.query(`
      select proname from pg_proc
      where proname = 'execute_legacy_signal_regularization'
    `);
    console.log(JSON.stringify({
      ok: fn.rows.length === 1,
      appliedRef: dbRef,
      branch: target.branch,
      rpc: fn.rows,
      productionTouched: false,
    }, null, 2));
    if (fn.rows.length !== 1) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
