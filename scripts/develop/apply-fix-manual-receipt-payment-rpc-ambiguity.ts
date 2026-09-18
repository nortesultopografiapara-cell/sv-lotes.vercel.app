/**
 * Aplica o hotfix da RPC paid_amount SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-fix-manual-receipt-payment-rpc-ambiguity.ts
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

const MIGRATION = '20261021130000_fix_manual_receipt_payment_rpc_ambiguity.sql';

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
  if (/\bDROP TABLE\b/i.test(sql) || /\bTRUNCATE\b/i.test(sql) || /\bDROP COLUMN\b/i.test(sql)) {
    throw new Error('ABORT: SQL destrutivo.');
  }
  if (!sql.includes('v_paid_amount')) {
    throw new Error('ABORT: hotfix sem v_paid_amount.');
  }
  if (sql.includes('DROP TRIGGER')) {
    throw new Error('ABORT: hotfix não pode remover o trigger.');
  }

  const env = loadMergedEnv();
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'NO_DATABASE_URL',
        hint: 'Execute o SQL no SQL Editor DEVELOP (hoynysmynxncdlptuzub). Não aplicar em Production.',
        migration: MIGRATION,
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
    throw new Error(`ABORT: DATABASE_URL ref=${dbRef || 'null'} esperado=${DEVELOP_PROJECT_REF}`);
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
    const trig = await client.query(`
      select tgname from pg_trigger
      where tgname = 'finance_receipts_block_client_paid_update'
    `);
    const fn = await client.query(`
      select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'execute_authorized_manual_receipt_payment'
    `);
    const def = String((fn.rows[0] || {}).def || '');
    const ok =
      trig.rows.length === 1 &&
      fn.rows.length === 1 &&
      def.includes('v_paid_amount') &&
      !/paid_amount\s*=\s*paid_amount/.test(def);
    console.log(
      JSON.stringify(
        {
          ok,
          appliedRef: dbRef,
          branch: target.branch,
          triggerPresent: trig.rows.length === 1,
          rpcHasVPaidAmount: def.includes('v_paid_amount'),
          rpcStillAmbiguous: /paid_amount\s*=\s*paid_amount/.test(def),
          productionTouched: false,
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
