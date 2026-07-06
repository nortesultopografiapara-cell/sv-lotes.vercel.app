import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  assertMasterCanUpdateCompany,
  buildCompanyUpdatePayload,
  createUpdateStepTimer,
  finalizeCompanyUpdateResponse,
  logCompaniesUpdateStep,
  persistCompanyUpdateInPhases,
} from '@/lib/companiesUpdateService';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function PATCH(request: Request) {
  const timer = createUpdateStepTimer();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await request.json();
    timer.mark('parse_body');
    const { companyId, userId } = body;

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId e userId são obrigatórios.' }, { status: 400 });
    }

    const auth = await assertMasterCanUpdateCompany(supabaseAdmin, userId);
    timer.mark('authorize');
    if (!auth.ok) {
      logCompaniesUpdateStep('denied', { companyId, ms: timer.timings.authorize });
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let built;
    try {
      built = buildCompanyUpdatePayload(body);
    } catch (buildErr: unknown) {
      const message = buildErr instanceof Error ? buildErr.message : 'Payload inválido.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    timer.mark('build_payload');

    if (built.companyId !== companyId) {
      return NextResponse.json({ error: 'companyId inconsistente no payload.' }, { status: 400 });
    }

    logCompaniesUpdateStep('payload_ready', {
      companyId,
      planKey: built.planKey,
      fields: Object.keys(built.updatePayload).length,
    });

    const { data, error, removedColumns, optionalWarning } = await persistCompanyUpdateInPhases(
      supabaseAdmin,
      companyId,
      built.updatePayload,
    );
    timer.mark('persist_company');

    if (removedColumns.length > 0) {
      logCompaniesUpdateStep('schema_fallback', { companyId, removedColumns });
    }

    if (error || !data) {
      logCompaniesUpdateStep('persist_failed', {
        companyId,
        message: error?.message,
        totalMs: timer.totalMs(),
        timings: timer.timings,
      });
      return NextResponse.json(
        { error: error?.message || 'Falha ao salvar empresa no Supabase.' },
        { status: 500 },
      );
    }

    const result = await finalizeCompanyUpdateResponse(
      supabaseAdmin,
      companyId,
      data,
      built.explicitBilling,
    );
    timer.mark('finalize');

    const responseBody = {
      ...result,
      optional_warning: optionalWarning ?? null,
    };

    logCompaniesUpdateStep('success', {
      companyId,
      totalMs: timer.totalMs(),
      timings: timer.timings,
      subscriptionWarning: result.subscription_warning,
      optionalWarning,
    });

    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    logCompaniesUpdateStep('exception', { message, totalMs: timer.totalMs(), timings: timer.timings });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
