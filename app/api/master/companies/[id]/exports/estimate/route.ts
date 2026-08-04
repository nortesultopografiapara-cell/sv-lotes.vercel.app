import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import { estimateCompanyExport } from '@/lib/master/companyExport/estimate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: admin, error } = getCompanyExportAdmin();
  if (!admin) return NextResponse.json({ error }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const auth = await authorizeCompanyExport(admin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  const companyId = companyIdFromParams(await context.params);
  if (!companyId) return NextResponse.json({ error: 'company id obrigatório' }, { status: 400 });

  try {
    const estimate = await estimateCompanyExport(admin, companyId);
    return NextResponse.json({ ok: true, estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na estimativa';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
