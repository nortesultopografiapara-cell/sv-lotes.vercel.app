/**
 * Aplica somente a migration de Operação completa (idempotente via IF NOT EXISTS).
 * Não reaplica 20260904/20260905.
 *
 * npx tsx scripts/apply-master-topography-operations-complete-migration.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file: string) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

for (const f of ['.env.local', '.env.production.local', '.env']) {
  loadEnv(f);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error(
    'Aplique manualmente no SQL Editor:\n  supabase/migrations/20260906120000_master_topography_operations_complete.sql',
  );
  process.exit(1);
}

const sqlPath = path.join(
  process.cwd(),
  'supabase/migrations/20260906120000_master_topography_operations_complete.sql',
);
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const supabase = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: probe } = await supabase
    .from('master_topography_operation_team')
    .select('id')
    .limit(1);

  if (!probe) {
    console.log('master_topography_operation_team already exists — skipping apply');
    process.exit(0);
  }

  console.warn('Probe:', probe.message);
  const { error: rpcError } = await supabase.rpc('exec_sql', { query: sql });
  if (!rpcError) {
    console.log('Applied via exec_sql RPC');
    return;
  }

  console.error('exec_sql unavailable:', rpcError.message);
  console.error('Apply manually in Supabase SQL Editor:\n', sqlPath);
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
