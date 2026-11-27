import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import {
  CompanyExportError,
  cancelCompanyExportJob,
} from '@/lib/master/companyExport/jobService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; exportId: string }> };

export async function POST(request: Request, context: Ctx) {
  
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const auth = await authorizeCompanyExport(request, {
    userId: body.userId ? String(body.userId) : null,
    impersonatingTenantId: body.impersonatingTenantId
      ? String(body.impersonatingTenantId)
      : null,
  });
  if (!auth.ok) return auth.response;
const { client: admin, error } = getCompanyExportAdmin();
  if (!admin) return NextResponse.json({ error }, { status: 500 });


  const params = await context.params;
  const companyId = companyIdFromParams(params);
  const exportId = String(params.exportId || '').trim();

  try {
    const job = await cancelCompanyExportJob(admin, companyId, exportId, auth.userId);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof CompanyExportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Erro ao cancelar' }, { status: 500 });
  }
}
