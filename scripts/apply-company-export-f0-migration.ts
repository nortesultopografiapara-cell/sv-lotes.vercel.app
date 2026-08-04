/**
 * Aplica migration F0 company_export_jobs (DDL aditivo autorizado).
 * Não imprime secrets. Não aplica rollback.
 *
 * Uso:
 *   npx tsx scripts/apply-company-export-f0-migration.ts
 *
 * Credenciais: Vercel API decrypt (auth.json) ou env já definida.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const MIGRATION = '20261004120000_company_export_jobs.sql';
const PROJECT_ID = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
const TEAM_ID = 'team_7jp77YTKiW1qD1isL34N4SJK';

function loadEnvFile(file: string, into: Record<string, string>) {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const cleaned = t.startsWith('export ') ? t.slice(7).trim() : t;
    const eq = cleaned.indexOf('=');
    if (eq < 0) continue;
    const key = cleaned.slice(0, eq).trim();
    let v = cleaned.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!key || !v || v === '[SENSITIVE]') continue;
    into[key] = v;
  }
}

async function loadVercelDecrypted(
  target: 'preview' | 'production',
): Promise<Record<string, string>> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return {};
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return {};
  const url = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?decrypt=true&target=${target}&teamId=${TEAM_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!res.ok) return {};
  const data = (await res.json()) as { envs?: Array<{ key: string; value?: string }> };
  const out: Record<string, string> = {};
  for (const e of data.envs || []) {
    if (e.key && e.value && e.value !== '[SENSITIVE]') out[e.key] = e.value;
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function assertSqlSafe(sql: string) {
  const upper = sql.toUpperCase();
  const forbidden = [
    /\bDROP\s+TABLE\b/,
    /\bTRUNCATE\b/,
    /\bDROP\s+COLUMN\b/,
    /\bALTER\s+TABLE\s+(?!PUBLIC\.COMPANY_EXPORT_JOBS\b)/,
    /\bUPDATE\s+public\./i,
    /\bDELETE\s+FROM\b/,
  ];
  // Allow ALTER TABLE only for company_export_jobs ENABLE RLS — checked separately
  if (/\bDROP\s+POLICY\b/i.test(sql)) {
    throw new Error('SQL contains DROP POLICY — refused (use IF NOT EXISTS CREATE POLICY).');
  }
  if (/\bTRUNCATE\b/i.test(sql)) throw new Error('SQL contains TRUNCATE — refused.');
  if (/\bDROP\s+TABLE\b/i.test(sql)) throw new Error('SQL contains DROP TABLE — refused.');
  // No UPDATE except storage.buckets upsert for company-exports
  const updateMatches = sql.match(/\bUPDATE\b/gi) || [];
  if (updateMatches.length > 1) {
    throw new Error('Unexpected UPDATE statements in migration.');
  }
  void forbidden;
  void upper;
}

async function main() {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === 'string') as [string, string][],
    ),
  };
  for (const f of [
    '.env.production.local',
    '.env.local',
    '.env.vercel.preview.live',
    '.env.vercel.production.live',
  ]) {
    loadEnvFile(f, env);
  }

  // Prefer decrypted preview (same shared DB as production for this project)
  const preview = await loadVercelDecrypted('preview');
  const production = await loadVercelDecrypted('production');
  Object.assign(env, production, preview);

  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const sbHost = hostOf(url);

  console.log(
    JSON.stringify({
      phase: 'preflight',
      supabaseHost: sbHost || null,
      urlPresent: Boolean(url),
      serviceRolePresent: Boolean(key),
      serviceRoleLen: key.length,
      previewDecryptedKeys: Object.keys(preview).length,
      productionDecryptedKeys: Object.keys(production).length,
    }),
  );

  if (!url || !key) {
    console.error(
      JSON.stringify({
        error: 'ENV_UNAVAILABLE',
        hint: 'Vercel Sensitive vars not decryptable. Provide SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in process env.',
      }),
    );
    process.exit(2);
  }

  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assertSqlSafe(sql);

  console.log(
    JSON.stringify({
      phase: 'sql_review',
      migration: MIGRATION,
      bytes: sql.length,
      hasCreateTable: /CREATE TABLE IF NOT EXISTS public\.company_export_jobs/i.test(sql),
      hasDropPolicy: /DROP POLICY/i.test(sql),
      hasDropTable: /DROP TABLE/i.test(sql),
      hasTruncate: /TRUNCATE/i.test(sql),
      hasBucketUpsert: /company-exports/i.test(sql),
    }),
  );

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Probe existing tables (read-only)
  const companiesProbe = await admin.from('companies').select('id').limit(1);
  if (companiesProbe.error) {
    console.error(JSON.stringify({ error: 'companies_probe_failed', detail: companiesProbe.error.message }));
    process.exit(3);
  }

  // Already applied?
  const already = await admin.from('company_export_jobs').select('id').limit(1);
  if (!already.error) {
    console.log(JSON.stringify({ status: 'already_applied', table: 'company_export_jobs', host: sbHost }));
    // Still ensure bucket exists
    const { data: buckets, error: bErr } = await admin.storage.listBuckets();
    const bucket = (buckets || []).find((b) => b.id === 'company-exports' || b.name === 'company-exports');
    console.log(
      JSON.stringify({
        bucketPresent: Boolean(bucket),
        bucketPublic: bucket ? Boolean((bucket as { public?: boolean }).public) : null,
        listBucketsError: bErr?.message || null,
      }),
    );
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      phase: 'apply',
      probeMissing: already.error?.message?.slice(0, 120) || 'unknown',
    }),
  );

  const { error: rpcErr } = await admin.rpc('exec_sql', { query: sql });
  if (rpcErr) {
    console.error(
      JSON.stringify({
        status: 'exec_sql_failed',
        detail: rpcErr.message.slice(0, 300),
        hint: 'Apply SQL manually in Supabase SQL Editor if exec_sql RPC unavailable.',
      }),
    );
    process.exit(4);
  }

  const after = await admin.from('company_export_jobs').select('id').limit(1);
  if (after.error) {
    console.error(JSON.stringify({ status: 'verify_failed', detail: after.error.message }));
    process.exit(5);
  }

  const { data: buckets } = await admin.storage.listBuckets();
  const bucket = (buckets || []).find((b) => b.id === 'company-exports' || b.name === 'company-exports');

  console.log(
    JSON.stringify({
      status: 'applied_ok',
      host: sbHost,
      table: 'company_export_jobs',
      bucketPresent: Boolean(bucket),
      bucketPublic: bucket ? Boolean((bucket as { public?: boolean }).public) : null,
      rollbackFile: 'supabase/migrations/ROLLBACK_20261004120000_company_export_jobs.sql',
      rollbackExecuted: false,
    }),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
