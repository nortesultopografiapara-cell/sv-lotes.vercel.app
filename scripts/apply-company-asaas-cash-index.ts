/**
 * Aplica o índice único de cash_movements Asaas somente se Preview ≠ Production.
 * Não imprime secrets. Uso:
 *   npx tsx scripts/apply-company-asaas-cash-index.ts
 *
 * Carrega .env.vercel.preview.live / .env.vercel.production.live se existirem,
 * ou variáveis de ambiente já definidas.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { execSync } from 'child_process';

function loadEnvFile(path: string, into: Record<string, string>) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
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
    into[key] = val;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function pullEnv(environment: 'preview' | 'production', outFile: string) {
  execSync(`npx vercel env pull ${outFile} --environment=${environment} --yes`, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const DDL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_company_asaas_movement_unique
  ON public.cash_movements (company_id, (metadata->>'financial_account_id'), (metadata->>'asaas_movement_id'))
  WHERE (metadata->>'asaas_movement_id') IS NOT NULL
    AND (metadata->>'asaas_movement_id') <> ''
    AND (metadata->>'financial_account_id') IS NOT NULL
    AND (metadata->>'financial_account_id') <> '';

COMMENT ON INDEX public.idx_cash_movements_company_asaas_movement_unique IS
  'Evita duplicidade na sincronização do extrato Asaas por empresa/conta financeira.';
`;

async function main() {
  const previewFile = '.env.vercel.preview.live';
  const productionFile = '.env.vercel.production.live';

  if (process.env.SKIP_VERCEL_PULL !== 'true') {
    console.log('Pulling Vercel envs (values not printed)...');
    pullEnv('preview', previewFile);
    pullEnv('production', productionFile);
  }

  const preview: Record<string, string> = {};
  const production: Record<string, string> = {};
  loadEnvFile(previewFile, preview);
  loadEnvFile(productionFile, production);

  const previewUrl = (preview.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const previewKey = (preview.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const prodUrl = (production.NEXT_PUBLIC_SUPABASE_URL || '').trim();

  const previewHost = hostOf(previewUrl);
  const prodHost = hostOf(prodUrl);

  console.log('=== Migration safety check ===');
  console.log('preview host:', previewHost || '(missing)');
  console.log('production host:', prodHost || '(missing)');
  console.log('same database:', previewHost && prodHost ? previewHost === prodHost : 'unknown');
  console.log('preview service role present:', Boolean(previewKey));

  if (!previewHost || !previewKey) {
    console.error('ABORT: Preview Supabase URL/service role unavailable (Vercel pull may return empty encrypted values).');
    console.error('Apply manually in Supabase SQL Editor of the PREVIEW project:');
    console.log(DDL);
    process.exit(2);
  }

  if (previewHost && prodHost && previewHost === prodHost) {
    console.error('ABORT: Preview and Production point to the SAME Supabase project.');
    console.error('Applying this DDL would alter production schema.');
    console.error('Refusing per policy: no production changes without explicit authorization.');
    console.error('SQL ready for when a dedicated homolog DB exists or you authorize:');
    console.log(DDL);
    process.exit(3);
  }

  if (process.env.ALLOW_SHARED_SUPABASE_DDL === 'true') {
    console.log('ALLOW_SHARED_SUPABASE_DDL=true — proceeding despite shared host.');
  } else if (!prodHost) {
    console.error('ABORT: Could not confirm production host differs. Refusing to apply.');
    process.exit(4);
  }

  const sb = createClient(previewUrl, previewKey, { auth: { persistSession: false } });

  // Duplicate preflight via REST (best-effort)
  const { data: rows, error } = await sb
    .from('cash_movements')
    .select('id, company_id, metadata')
    .not('metadata->>asaas_movement_id', 'is', null)
    .limit(5000);

  if (error) {
    console.error('Preflight failed:', error.message);
    process.exit(5);
  }

  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const row of rows || []) {
    const md = (row.metadata || {}) as Record<string, unknown>;
    const mid = String(md.asaas_movement_id || '').trim();
    const fa = String(md.financial_account_id || '').trim();
    if (!mid || !fa) continue;
    const k = `${row.company_id}|${fa}|${mid}`;
    if (seen.has(k)) dupes.push(k);
    else seen.set(k, String(row.id));
  }
  console.log('preflight unique keys:', seen.size, 'duplicates:', dupes.length);
  if (dupes.length) {
    console.error('ABORT: duplicates would block unique index');
    process.exit(6);
  }

  const rpc = await sb.rpc('exec_sql', { query: DDL });
  if (rpc.error) {
    console.error('exec_sql unavailable:', rpc.error.message);
    console.error('DDL must be applied in Supabase SQL Editor (preview project only).');
    console.log(DDL);
    process.exit(7);
  }

  console.log('SUCCESS: index created via exec_sql on preview host', previewHost);
  console.log('No row data mutated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
