/**
 * Aplica somente a migration de clientes + client_id (produção/homolog).
 * Não reaplica migrations anteriores.
 *
 * npx tsx scripts/apply-master-topography-clients-migration.ts
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
  process.exit(1);
}

const sqlPath = path.join(
  process.cwd(),
  'supabase/migrations/20260905120000_master_topography_clients_and_operation_client_id.sql',
);
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const supabase = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer exec_sql RPC if available; otherwise try statement chunks via rest isn't possible.
  const { error: rpcError } = await supabase.rpc('exec_sql', { query: sql });
  if (!rpcError) {
    console.log('Applied via exec_sql RPC');
    return;
  }

  console.warn('exec_sql unavailable:', rpcError.message);
  console.warn('Attempting table existence check / DDL via individual posts…');

  // Fallback: create via raw SQL endpoint if Database has pg_net — most projects won't.
  // Verify whether table already exists (manual apply may have happened).
  const { error: probe } = await supabase.from('master_topography_clients').select('id').limit(1);
  if (!probe) {
    console.log('master_topography_clients already exists — skipping apply');
    const { error: colProbe } = await supabase
      .from('master_topography_operations')
      .select('client_id')
      .limit(1);
    if (!colProbe) {
      console.log('operations.client_id already present');
      process.exit(0);
    }
    console.error('clients ok but client_id missing — apply SQL manually in Supabase SQL Editor');
    process.exit(2);
  }

  console.error(
    'Apply manually in Supabase SQL Editor:\n',
    sqlPath,
    '\nProbe error:',
    probe.message,
  );
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
