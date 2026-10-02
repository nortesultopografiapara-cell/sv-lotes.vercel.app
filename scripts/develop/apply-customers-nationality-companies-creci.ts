/**
 * Aplica customers.nationality e companies.creci SOMENTE no DEVELOP.
 * npx tsx scripts/develop/apply-customers-nationality-companies-creci.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';

const MIGRATION = '20261029120000_customers_nationality_companies_creci.sql';

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
  const sqlPath = path.join(__dirname, '..', '..', 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (/\bDROP COLUMN\b/i.test(sql) || /\bDELETE FROM\b/i.test(sql) || /\bTRUNCATE\b/i.test(sql)) {
    throw new Error('ABORT: SQL não é aditivo.');
  }

  const env = loadMergedEnv();
  const loaded = loadDevelopEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const require = createRequire(__filename);

  async function verifyViaRest() {
    if (!loaded.url || !loaded.service || /SENSITIVE/i.test(loaded.service)) {
      return { customers: false, companies: false, error: 'NO_SERVICE_ROLE' };
    }
    const { createClient } = require('@supabase/supabase-js') as {
      createClient: (url: string, key: string) => any;
    };
    const sb = createClient(loaded.url, loaded.service);
    const customers = await sb.from('customers').select('nationality').limit(1);
    const companies = await sb.from('companies').select('creci').limit(1);
    return {
      customers: !customers.error,
      companies: !companies.error,
      error: customers.error?.message || companies.error?.message || null,
    };
  }

  const before = await verifyViaRest();
  if (before.customers && before.companies) {
    console.log(JSON.stringify({ ok: true, alreadyApplied: true, ref: target.ref, migration: MIGRATION }, null, 2));
    return;
  }

  if (!dbUrl) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          abort: 'NO_DATABASE_URL',
          hint: 'Execute o SQL no SQL Editor DEVELOP (hoynysmynxncdlptuzub). Não aplicar em Production.',
          migration: MIGRATION,
          probe: before,
        },
        null,
        2,
      ),
    );
    return;
  }

  const ref = databaseUrlRef(dbUrl);
  if (ref === PRODUCTION_PROJECT_REF) throw new Error('ABORT: DATABASE_URL aponta Production.');
  if (ref && ref !== DEVELOP_PROJECT_REF) throw new Error(`ABORT: DATABASE_URL ref ${ref}`);

  const { Client } = require('pg') as { Client: new (cfg: { connectionString: string }) => any };
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }

  const after = await verifyViaRest();
  console.log(
    JSON.stringify(
      { ok: after.customers && after.companies, ref: target.ref, migration: MIGRATION, after },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
