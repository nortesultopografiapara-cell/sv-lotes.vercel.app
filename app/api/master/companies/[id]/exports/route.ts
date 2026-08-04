import { NextResponse } from 'next/server';
import {
  authorizeCompanyExport,
  companyIdFromParams,
  getCompanyExportAdmin,
} from '@/lib/master/companyExport/apiAuth';
import {
  CompanyExportError,
  advanceCompanyExportJob,
  createCompanyExportJob,
  getCompanyExportJob,
  listCompanyExportJobs,
} from '@/lib/master/companyExport/jobService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const jobs = await listCompanyExportJobs(admin, companyId);
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar exportações';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  const { client: admin, error } = getCompanyExportAdmin();
  if (!admin) return NextResponse.json({ error }, { status: 500 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const auth = await authorizeCompanyExport(admin, {
    userId: body.userId ? String(body.userId) : null,
    impersonatingTenantId: body.impersonatingTenantId
      ? String(body.impersonatingTenantId)
      : null,
  });
  if (!auth.ok) return auth.response;

  const companyId = companyIdFromParams(await context.params);
  if (!companyId) return NextResponse.json({ error: 'company id obrigatório' }, { status: 400 });

  try {
    const job = await createCompanyExportJob(admin, {
      companyId,
      requestedBy: auth.userId,
      reason: String(body.reason || ''),
      notes: body.notes != null ? String(body.notes) : null,
      exportVersion: body.exportVersion != null ? String(body.exportVersion) : 'F2_COMPLETE',
      options: {
        include_generated_plans:
          body.includeGeneratedPlans === undefined
            ? true
            : Boolean(body.includeGeneratedPlans),
      },
    });

    // Kick several steps immediately (cron + Master polling continue)
    try {
      await advanceCompanyExportJob(admin, companyId, job.id, 12);
      const refreshed = await getCompanyExportJob(admin, companyId, job.id);
      return NextResponse.json({ ok: true, job: refreshed }, { status: 201 });
    } catch {
      // ignore kick failures
    }

    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (err) {
    if (err instanceof CompanyExportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erro ao criar exportação';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
