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
  const { count: blocksWithProject } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .not('project_id', 'is', null);
  const { count: blocksNullProject } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .is('project_id', null);

  const matchers = [
    { label: 'S.V TOPOGRAFIA', re: /topografia/i },
    { label: 'MENESES', re: /meneses/i },
    { label: 'Ivanilde', re: /ivanilde|moura/i },
    { label: 'Empresa Demonstração', re: /demonstra/i },
  ];

  const sampleCompanies = (companies || []).filter((c) =>
    matchers.some((m) => m.re.test(String(c.name || ''))),
  );

  const sample = [];
  for (const c of sampleCompanies) {
    const companyProjects = (projects || []).filter(
      (p) =>
        String(p.tenant_id || '') === c.id ||
        String(p.company_id || '') === c.id,
    );
    const projectIds = companyProjects.map((p) => p.id).filter(Boolean);

    const { count: byTenant, error: errTenant } = await sb
      .from('blocks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', c.id);

    let byProject = 0;
    let errProject: string | null = null;
    if (projectIds.length > 0) {
      const res = await sb
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .in('project_id', projectIds.slice(0, 80));
      byProject = res.count ?? 0;
      errProject = res.error?.message || null;
    }

    const { count: byTenantNullDeleted, error: errDel } = await sb
      .from('blocks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', c.id)
      .is('deleted_at', null);

    sample.push({
      name: c.name,
      companyId: c.id,
      lotsUsedViaLib: lotCounts[c.id] || 0,
      maxLots: c.max_lots,
      display: `${lotCounts[c.id] || 0} / ${c.max_lots ?? '∞'}`,
      projectCount: companyProjects.length,
      projectIdsSample: projectIds.slice(0, 3),
      countByTenantExact: byTenant ?? 0,
      countByTenantErr: errTenant?.message || null,
      countByProjectExact: byProject,
      countByProjectErr: errProject,
      countByTenantAndDeletedNull: byTenantNullDeleted ?? 0,
      countByTenantDeletedErr: errDel?.message || null,
    });
  }

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
    blocksWithProjectId: blocksWithProject ?? 0,
    blocksNullProjectId: blocksNullProject ?? 0,
    projectsTotal: (projects || []).length,
    projectsWithTenantOrCompany: (projects || []).filter(
      (p) => p.tenant_id || p.company_id,
    ).length,
    sampleCorrect: sample,
    sampleLegacyViaBlockTenant: sample.map((s) => ({
      name: s.name,
      legacyLotsUsed: legacyCounts[s.companyId] || 0,
    })),
  });
}
