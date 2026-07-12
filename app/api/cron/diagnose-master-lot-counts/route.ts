/**
 * Diagnóstico read-only — contagem de lotes por empresa (Master SaaS).
 * Preview only; exige x-diag-token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { fetchCompanyLotCountsExact } from '@/lib/masterCompanyLotCounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-diag-master-lots-20260712';

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'blocked_in_production' }, { status: 403 });
  }
  const token = request.headers.get('x-diag-token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { client: sb, error: configError } = createServiceSupabase();
  if (!sb || configError) {
    return NextResponse.json(
      { error: configError || 'supabase_unavailable' },
      { status: 503 },
    );
  }

  const { data: companies, error: cErr } = await sb
    .from('companies')
    .select('id, name, max_lots');
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const { data: projects, error: pErr } = await sb
    .from('projects')
    .select('id, tenant_id, company_id');
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const lotCounts = await fetchCompanyLotCountsExact(sb, projects || []);

  const { count: blocksTotal } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true });
  const { count: blocksWithTenant } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .not('tenant_id', 'is', null);

  const matchers = [
    { label: 'S.V TOPOGRAFIA', re: /topografia/i },
    { label: 'MENESES', re: /meneses/i },
    { label: 'Ivanilde', re: /ivanilde|moura/i },
    { label: 'Empresa Demonstração', re: /demonstra/i },
  ];

  const sample = (companies || [])
    .filter((c) => matchers.some((m) => m.re.test(String(c.name || ''))))
    .map((c) => ({
      name: c.name,
      lotsUsed: lotCounts[c.id] || 0,
      maxLots: c.max_lots,
      display: `${lotCounts[c.id] || 0} / ${c.max_lots ?? '∞'}`,
    }));

  // Método antigo (tenant_id no block) — prova da regressão de exibição
  const legacyCounts: Record<string, number> = {};
  const { data: legacyBlocks } = await sb
    .from('blocks')
    .select('tenant_id, company_id')
    .limit(5000);
  for (const b of legacyBlocks || []) {
    const id = String(b.tenant_id || b.company_id || '').trim();
    if (!id) continue;
    legacyCounts[id] = (legacyCounts[id] || 0) + 1;
  }

  return NextResponse.json({
    success: true,
    readOnly: true,
    blocksTotal: blocksTotal ?? 0,
    blocksWithTenantId: blocksWithTenant ?? 0,
    sampleCorrect: sample,
    sampleLegacyViaBlockTenant: sample.map((s) => {
      const company = (companies || []).find((c) => c.name === s.name);
      return {
        name: s.name,
        legacyLotsUsed: company ? legacyCounts[company.id] || 0 : 0,
      };
    }),
  });
}
