/**
 * Diagnóstico Preview — agregados de Valor do Empreendimento (Dashboard vs lotes).
 * Confirma truncamento PostgREST (~1000) e breakdown por empreendimento.
 * Bloqueado em production. Exige header x-diag-token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  buildEnterpriseBreakdownByProject,
  fetchAllEnterpriseLotRowsService,
  summarizeEnterpriseFetch,
  takePostgrestDefaultCap,
} from '@/lib/enterpriseValueFetch';
import { calculateEnterpriseValueSummary } from '@/lib/enterpriseValueSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-diag-dashboard-enterprise-20260723';

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

  try {
    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get('companyId');
    const companyNameHint =
      url.searchParams.get('companyName') || 'Meneses';

    let companyId = companyIdParam;
    let companyName: string | null = null;

    if (!companyId) {
      const { data: companies, error: cErr } = await sb
        .from('companies')
        .select('id, name')
        .ilike('name', `%${companyNameHint}%`)
        .limit(5);
      if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 });
      }
      if (!companies?.length) {
        return NextResponse.json(
          { error: 'company_not_found', hint: companyNameHint },
          { status: 404 },
        );
      }
      companyId = String(companies[0].id);
      companyName = String(companies[0].name || '');
    } else {
      const { data: company } = await sb
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle();
      companyName = company?.name ? String(company.name) : null;
    }

    const { data: projects, error: pErr } = await sb
      .from('projects')
      .select('id, name, company_id, tenant_id')
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const projectNameById: Record<string, string> = {};
    for (const p of projects || []) {
      projectNameById[String(p.id)] = String(p.name || '');
    }

    const lotFetch = await fetchAllEnterpriseLotRowsService(sb, {
      companyId,
    });

    // Fallback: alguns tenants usam tenant_id = company id sem company_id nos blocks.
    let rows = lotFetch.rows;
    let meta = lotFetch;
    if (rows.length === 0) {
      const byTenant = await fetchAllEnterpriseLotRowsService(sb, {
        tenantId: companyId,
      });
      rows = byTenant.rows;
      meta = byTenant;
    }

    const fullSummary = calculateEnterpriseValueSummary(rows);
    const capped = takePostgrestDefaultCap(rows, 1000);
    const cappedSummary = calculateEnterpriseValueSummary(capped);
    const byProject = buildEnterpriseBreakdownByProject(rows, projectNameById, {
      pagesFetched: meta.pagesFetched,
    });

    const consolidated = summarizeEnterpriseFetch(fullSummary, meta, {
      companyId,
      projectCount: Object.keys(projectNameById).length,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      companyName,
      projectsListed: (projects || []).map((p) => ({
        id: p.id,
        name: p.name,
      })),
      byProject,
      consolidated,
      truncatedSimulation: {
        rows: capped.length,
        globalValue: cappedSummary.totalValue,
        availableValue: cappedSummary.availableValue,
        reservedValue: cappedSummary.reservedValue,
        soldValue: cappedSummary.soldValue,
        availableLots: cappedSummary.availableCount,
        reservedLots: cappedSummary.reservedCount,
        soldLots: cappedSummary.soldCount + cappedSummary.paidCount,
        availableGapVsFull:
          fullSummary.availableValue - cappedSummary.availableValue,
        globalGapVsFull: fullSummary.totalValue - cappedSummary.totalValue,
      },
      identityCheck: {
        availablePlusReservedPlusSoldEqualsGlobal:
          Math.abs(
            fullSummary.availableValue +
              fullSummary.reservedValue +
              fullSummary.soldValue -
              fullSummary.totalValue,
          ) < 0.01,
        sumByProjectGlobal: byProject.reduce((s, r) => s + r.globalValue, 0),
        sumByProjectAvailable: byProject.reduce(
          (s, r) => s + r.availableValue,
          0,
        ),
      },
    });
  } catch (err) {
    console.error('[diagnose-dashboard-enterprise-values]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
