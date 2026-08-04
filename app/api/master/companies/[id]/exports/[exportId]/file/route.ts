import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import {
  CompanyExportError,
  deleteExportPackageFile,
} from '@/lib/master/companyExport/jobService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; exportId: string }> };

export async function DELETE(request: Request, context: Ctx) {
  const { client: admin, error } = getCompanyExportAdmin();
  if (!admin) return NextResponse.json({ error }, { status: 500 });

  const { searchParams } = new URL(request.url);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const auth = await authorizeCompanyExport(admin, {
    userId: body.userId ? String(body.userId) : searchParams.get('userId'),
    impersonatingTenantId: body.impersonatingTenantId
      ? String(body.impersonatingTenantId)
      : searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const companyId = companyIdFromParams(params);
  const exportId = String(params.exportId || '').trim();

  try {
    const result = await deleteExportPackageFile(admin, companyId, exportId, auth.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CompanyExportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erro ao excluir arquivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
