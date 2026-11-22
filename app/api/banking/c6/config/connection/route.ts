import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6CompanyOperationEnabled } from '@/lib/banking/c6/c6CompanyAccess';
import { runC6ConnectionTest } from '@/lib/banking/c6/c6ConnectionTest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Teste de conexão da empresa da sessão. Sem concessão, o C6 não é chamado. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  if (!isC6CompanyOperationEnabled(auth.tenantId, 'connection')) {
    return NextResponse.json(
      { error: 'Teste de conexão C6 ainda não autorizado para esta empresa.' },
      { status: 403 },
    );
  }

  const result = await runC6ConnectionTest(auth.admin, auth.tenantId);
  return NextResponse.json(
    {
      ok: result.ok,
      executed: result.executed,
      environment: result.environment,
      httpStatus: result.httpStatus,
      scopeReturned: result.scopeReturned,
      error: result.ok ? undefined : result.message,
    },
    { status: result.ok ? 200 : result.executed ? 502 : 403 },
  );
}
