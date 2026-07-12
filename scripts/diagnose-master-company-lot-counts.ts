/**
 * Contagem read-only de lotes por empresa (Master SaaS).
 * npx tsx scripts/diagnose-master-company-lot-counts.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fetchCompanyLotCountsExact } from '../lib/masterCompanyLotCounts';

const TARGETS = [
  { name: 'S.V TOPOGRAFIA', match: /topografia/i },
  { name: 'MENESES', match: /meneses/i },
  { name: 'Ivanilde', match: /ivanilde|moura/i },
  { name: 'Empresa Demonstração', match: /demonstra/i },
];

async function loadProductionEnv(): Promise<void> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return;
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return;
  const projectId = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
  for (const target of ['production', 'preview', 'development'] as const) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=${target}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { envs?: Array<{ key: string; value?: string }> };
    if (!data.envs?.some((e) => e.key === 'SUPABASE_SERVICE_ROLE_KEY' && e.value)) continue;
    for (const item of data.envs || []) {
      if (item.key && item.value) process.env[item.key] = item.value;
    }
    return;
  }
}

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && (!process.env[key] || !String(process.env[key]).trim())) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile('.env.local');
  await loadProductionEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(JSON.stringify({ success: false, error: 'ENV_UNAVAILABLE' }, null, 2));
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: companies, error: cErr } = await sb
    .from('companies')
    .select('id, name, max_lots');
  if (cErr) throw cErr;

  const { data: projects, error: pErr } = await sb
    .from('projects')
    .select('id, tenant_id, company_id');
  if (pErr) throw pErr;

  const lotCounts = await fetchCompanyLotCountsExact(
    sb,
    (companies || []).map((c) => String(c.id)),
    projects || [],
  );

  const sample = (companies || [])
    .filter((c) => TARGETS.some((t) => t.match.test(String(c.name || ''))))
    .map((c) => ({
      name: c.name,
      id: c.id,
      lotsUsed: lotCounts[c.id] || 0,
      maxLots: c.max_lots,
      display: `${lotCounts[c.id] || 0} / ${c.max_lots ?? '∞'}`,
    }));

  // Sanity: how many blocks have null tenant vs with project
  const { count: blocksWithTenant } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .not('tenant_id', 'is', null);
  const { count: blocksTotal } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true });

  const out = {
    success: true,
    readOnly: true,
    blocksTotal: blocksTotal ?? 0,
    blocksWithTenantId: blocksWithTenant ?? 0,
    sample,
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(process.cwd(), 'diag-master-lot-counts.json'),
    JSON.stringify(out, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
