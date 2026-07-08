import { NextResponse } from 'next/server';
import { loadClientPortalDashboard } from '@/lib/portal-cliente/dashboard';
import {
  logClientPortalDashboardDiagnostic,
  logClientPortalDashboardException,
  scopeIdFingerprint,
} from '@/lib/portal-cliente/dashboardDiagnosticLog';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';
import { createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  logClientPortalDashboardDiagnostic({ step: 'route_start', httpStatus: 200 });

  try {
    if (!isClientPortalEnabled()) {
      logClientPortalDashboardDiagnostic({
        step: 'route_start',
        outcome: 'failure',
        reason: 'portal_disabled',
        httpStatus: 404,
      });
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }

    const cookie = await getClientPortalSessionCookie();
    logClientPortalDashboardDiagnostic({
      step: '1_session_loaded',
      outcome: Boolean(cookie) ? 'success' : 'failure',
      sessionFound: Boolean(cookie),
      table: 'cookie',
      filter: 'client_portal_session',
      httpStatus: cookie ? 200 : 401,
      reason: cookie ? undefined : 'cookie_missing',
    });

    if (!cookie) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Sessão não encontrada. Faça login novamente.', step: '1_session_loaded' },
        { status: 401 },
      );
    }

    const session = readClientPortalSessionToken(cookie);
    if (!session) {
      logClientPortalDashboardDiagnostic({
        step: '1_session_loaded',
        outcome: 'failure',
        sessionFound: false,
        table: 'session',
        filter: 'readClientPortalSessionToken',
        reason: 'invalid_or_expired_or_missing_scope',
        httpStatus: 401,
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'EXPIRED',
          message: 'Sessão expirada. Solicite um novo código de acesso.',
          step: '1_session_loaded',
        },
        { status: 401 },
      );
    }

    logClientPortalDashboardDiagnostic({
      step: '1_session_loaded',
      outcome: 'success',
      sessionFound: true,
      linkType: session.scope.linkType,
      customerId: scopeIdFingerprint(session.scope.customerId),
      saleId: scopeIdFingerprint(session.scope.saleId),
      contractId: scopeIdFingerprint(session.scope.contractId),
      companyId: scopeIdFingerprint(session.scope.companyId),
      hasCompanyId: Boolean(session.scope.companyId),
      hasCustomerId: Boolean(session.scope.customerId),
      hasSaleId: Boolean(session.scope.saleId),
      hasContractId: Boolean(session.scope.contractId),
      httpStatus: 200,
    });

    const { client: admin, configError } = createAdminSupabase();
    if (!admin) {
      logClientPortalDashboardDiagnostic({
        step: 'supabase_admin',
        outcome: 'failure',
        reason: 'admin_unavailable',
        errorMessage: configError || undefined,
        httpStatus: 503,
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'SERVER_ERROR',
          message: configError || 'Serviço indisponível.',
          step: 'supabase_admin',
        },
        { status: 503 },
      );
    }

    const result = await loadClientPortalDashboard(admin, session.scope);
    if (!result.ok) {
      logClientPortalDashboardDiagnostic({
        step: result.step,
        outcome: 'failure',
        table: result.table,
        filter: result.filter,
        reason: result.reason,
        httpStatus: result.httpStatus,
        errorMessage: result.message,
      });
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          message: result.message,
          step: result.step,
          table: result.table,
          filter: result.filter,
          reason: result.reason,
        },
        { status: result.httpStatus },
      );
    }

    logClientPortalDashboardDiagnostic({
      step: 'route_success',
      outcome: 'success',
      httpStatus: 200,
      linkType: session.scope.linkType,
    });

    return NextResponse.json(result.dashboard, { status: result.httpStatus });
  } catch (err) {
    logClientPortalDashboardException('route_unhandled', err);
    return NextResponse.json(
      {
        ok: false,
        code: 'SERVER_ERROR',
        message: 'Erro interno ao carregar o painel.',
        step: 'route_unhandled',
        reason: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
