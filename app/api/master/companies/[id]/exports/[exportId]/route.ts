import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import {
  CompanyExportError,
  advanceCompanyExportJob,
  getCompanyExportJob,
} from '@/lib/master/companyExport/jobService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  if (!companyId || !exportId) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  try {
    let job = await getCompanyExportJob(admin, companyId, exportId);
    // Preview-friendly: polling do Master avança o job sem depender só do Cron.
    if (job.status === 'PENDING' || job.status === 'PROCESSING') {
      await advanceCompanyExportJob(admin, companyId, exportId, 10);
      job = await getCompanyExportJob(admin, companyId, exportId);
    }
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof CompanyExportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Erro ao carregar exportação' }, { status: 500 });
  }
}
