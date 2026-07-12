/**
 * Contagem exact de lotes por empresa (Master SaaS).
 * Service role — o client browser sob RLS de `blocks` não enxerga lotes
 * de outros tenants, então a UI recebia sempre 0 nos cards.
 */

import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { fetchCompanyLotCountsExact } from '@/lib/masterCompanyLotCounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveLotCounts(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>['client']>,
  companyIdsInput: string[] | null,
) {
  let companyIds = (companyIdsInput || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (companyIds.length === 0) {
    const { data, error } = await admin.from('companies').select('id');
    if (error) throw new Error(error.message);
    companyIds = (data || []).map((c) => String(c.id));
  }

  const { data: projects, error: pErr } = await admin
    .from('projects')
    .select('id, tenant_id, company_id');
  if (pErr) throw new Error(pErr.message);

  const lotCounts = await fetchCompanyLotCountsExact(
    admin,
    companyIds,
    projects || [],
  );

  return { lotCounts, companyIds };
}

export async function GET(request: Request) {
  const { client: admin, error: configError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: configError || 'Service role não configurada.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await assertSuperAdmin(admin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const companyIdsParam = searchParams.get('companyIds');
  const companyIds = companyIdsParam
    ? companyIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    : null;

  try {
    const { lotCounts } = await resolveLotCounts(admin, companyIds);
    return NextResponse.json({
      success: true,
      lotCounts,
      source: 'service_role_exact',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contar lotes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: admin, error: configError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: configError || 'Service role não configurada.' },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    companyIds?: string[];
  };
  const auth = await assertSuperAdmin(admin, body.userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const { lotCounts } = await resolveLotCounts(admin, body.companyIds || null);
    return NextResponse.json({
      success: true,
      lotCounts,
      source: 'service_role_exact',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contar lotes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
