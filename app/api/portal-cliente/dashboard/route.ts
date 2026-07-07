import { NextResponse } from 'next/server';
import { loadClientPortalDashboard } from '@/lib/portal-cliente/dashboard';
import {
  logClientPortalDashboardDiagnostic,
  logClientPortalDashboardException,
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
  logClientPortalDashboardDiagnostic({ step: 'route_start' });

  try {
    if (!isClientPortalEnabled()) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }

    const cookie = await getClientPortalSessionCookie();
    logClientPortalDashboardDiagnostic({
      step: 'session_cookie',
      sessionFound: Boolean(cookie),
    });

    if (!cookie) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Sessão não encontrada. Faça login novamente.' },
        { status: 401 },
      );
    }

    const session = readClientPortalSessionToken(cookie);
    if (!session) {
      logClientPortalDashboardDiagnostic({
        step: 'session_parse',
        sessionFound: false,
        reason: 'invalid_or_expired_or_missing_scope',
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'EXPIRED',
          message: 'Sessão expirada. Solicite um novo código de acesso.',
        },
        { status: 401 },
      );
    }

    logClientPortalDashboardDiagnostic({
      step: 'session_scope',
      sessionFound: true,
      linkType: session.scope.linkType,
      hasCompanyId: Boolean(session.scope.companyId),
      hasCustomerId: Boolean(session.scope.customerId),
      hasSaleId: Boolean(session.scope.saleId),
    });

    const { client: admin, configError } = createAdminSupabase();
    if (!admin) {
      logClientPortalDashboardDiagnostic({
        step: 'supabase_admin',
        reason: 'admin_unavailable',
        errorMessage: configError || undefined,
      });
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: configError || 'Serviço indisponível.' },
        { status: 503 },
      );
    }

    const dashboard = await loadClientPortalDashboard(admin, session.scope);
    if (!dashboard) {
      logClientPortalDashboardDiagnostic({
        step: 'route_not_found',
        reason: 'loader_returned_null',
        linkType: session.scope.linkType,
      });
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Não foi possível carregar seus dados.' },
        { status: 404 },
      );
    }

    return NextResponse.json(dashboard);
  } catch (err) {
    logClientPortalDashboardException('route_unhandled', err);
    return NextResponse.json(
      { ok: false, code: 'NOT_FOUND', message: 'Não foi possível carregar seus dados.' },
      { status: 500 },
    );
  }
}
