/**
 * Aplica migration de escopo/entregáveis no Supabase (produção).
 * Uso:
 *   npx tsx scripts/apply-quote-scope-migration-prod.ts
 * Carrega .env.local / .env.production.local (service role).
 * Prefere RPC exec_sql; se ausente, tenta POST /rest/v1/rpc ou reporta SQL manual.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const root = path.join(__dirname, '..');
const MIGRATION = '20260830120000_master_topography_quotes_scope_deliverables.sql';

function loadEnv(filePath: string) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!fs.existsSync(abs)) return;
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    // Vercel env pull: VALUE="..." ou VALUE='...'
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').trim();
    process.env[key] = val;
  }
}

async function main() {
  const envArg = process.argv[2] || '.env.production.local';
  // Prioriza o arquivo indicado; evita .env.prod.apply com [SENSITIVE] do vercel env pull.
  loadEnv(envArg);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === '[SENSITIVE]') {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    loadEnv('.env.local');
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === '[SENSITIVE]') {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY === '[SENSITIVE]') {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !/^https?:\/\//i.test(url) || !key) {
    const sample = Array.from(url.slice(0, 8))
      .map((c) => c.charCodeAt(0).toString(16))
      .join(' ');
    console.error(
      JSON.stringify({
        error: 'Missing or invalid Supabase env',
        url_present: Boolean(url),
        url_len: url.length,
        url_prefix_codepoints: sample,
        url_looks_http: /^https?:\/\//i.test(url),
        key_present: Boolean(key),
        env_file: envArg,
        has_next_public: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        has_supabase_url: Boolean(process.env.SUPABASE_URL),
      }),
    );
    process.exit(2);
  }

  const sqlPath = path.join(root, 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Probe: coluna já existe?
  const { error: probeErr } = await sb
    .from('master_topography_quotes')
    .select('id, technical_resources, deliverables')
    .limit(1);

  if (!probeErr) {
    console.log(JSON.stringify({ status: 'already_applied', migration: MIGRATION }));
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      status: 'columns_missing',
      probe: String(probeErr.message || probeErr).slice(0, 200),
    }),
  );

  const { error: rpcErr } = await sb.rpc('exec_sql', { query: sql });
  if (!rpcErr) {
    const { error: afterErr } = await sb
      .from('master_topography_quotes')
      .select('id, technical_resources, deliverables')
      .limit(1);
    if (!afterErr) {
      console.log(JSON.stringify({ status: 'applied_via_exec_sql', migration: MIGRATION }));
      process.exit(0);
    }
  }

  console.log(
    JSON.stringify({
      status: 'NEED_MANUAL_SQL_EDITOR',
      migration: MIGRATION,
      rpc_error: rpcErr ? String(rpcErr.message || rpcErr).slice(0, 200) : null,
      hint: 'Cole o conteúdo da migration no SQL Editor do Supabase de produção e execute.',
    }),
  );
  process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
