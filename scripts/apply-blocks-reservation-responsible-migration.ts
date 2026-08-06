/**
 * Aplica migration reserved_by_* em blocks + reservation_logs (produção).
 * Uso: npx tsx scripts/apply-blocks-reservation-responsible-migration.ts [.env.file]
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const root = path.join(__dirname, '..');
const MIGRATION = '20260806140000_blocks_reservation_responsible.sql';

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
  loadEnv(envArg);
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === '[SENSITIVE]'
  ) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    loadEnv('.env.local');
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === '[SENSITIVE]') {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY === '[SENSITIVE]') {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    loadEnv('.env.local');
  }

  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !/^https?:\/\//i.test(url) || !key) {
    console.error(JSON.stringify({ error: 'Missing or invalid Supabase env' }));
    process.exit(1);
  }

  const sqlPath = path.join(root, 'supabase', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { error: rpcError } = await supabase.rpc('exec_sql', { query: sql });
  if (rpcError) {
    console.error(
      JSON.stringify({
        error: 'exec_sql failed',
        message: rpcError.message,
        hint: 'Aplique o SQL manualmente no SQL Editor do Supabase',
        migration: MIGRATION,
      }),
    );
    process.exit(1);
  }

  // Verifica colunas
  const { error: probeErr } = await supabase
    .from('blocks')
    .select('reserved_by_user_id, reserved_by_name')
    .limit(1);

  console.log(
    JSON.stringify({
      ok: !probeErr,
      migration: MIGRATION,
      probe: probeErr ? probeErr.message : 'columns readable',
    }),
  );
  if (probeErr) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
