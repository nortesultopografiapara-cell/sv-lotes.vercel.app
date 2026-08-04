import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import {
  CompanyExportError,
  createExportDownloadUrl,
} from '@/lib/master/companyExport/jobService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; exportId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: admin, error } = getCompanyExportAdmin();
  if (!admin) return NextResponse.json({ error }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const auth = await authorizeCompanyExport(admin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const companyId = companyIdFromParams(params);
  const exportId = String(params.exportId || '').trim();

  try {
    const result = await createExportDownloadUrl(admin, companyId, exportId, auth.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CompanyExportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Erro no download' }, { status: 500 });
  }
}
