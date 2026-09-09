import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertC6ConnectionTestPublicSafe,
} from '@/lib/banking/c6/c6AuthClient';
import { assertC6ConfigResponseSafe } from '@/lib/banking/c6/c6ConfigRepository';
import { runCompanyC6ConnectionTest } from '@/lib/banking/c6/c6ConnectionTest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/banking/c6/test-connection
 * Fase 3A — autentica no C6 (mTLS + client_credentials). Sem cobrança.
 */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const url = new URL(request.url);
    const { test, config } = await runCompanyC6ConnectionTest(auth.admin, auth.tenantId, {
      financialAccountId:
        String(
          body.financialAccountId ??
            body.financial_account_id ??
            url.searchParams.get('financialAccountId') ??
            '',
        ).trim() || null,
      integrationId:
        String(
          body.integrationId ??
            body.integration_id ??
            url.searchParams.get('integrationId') ??
            '',
        ).trim() || null,
    });

    assertC6ConfigResponseSafe(config);
    assertC6ConnectionTestPublicSafe(test);

    const payload = {
      success: test.success,
      environment: test.environment,
      tokenType: test.tokenType,
      expiresIn: test.expiresIn,
      scopes: test.scopes,
      message: test.message,
      status: test.status,
      testedAt: test.testedAt,
    };

    const json = JSON.stringify(payload);
    if (
      json.includes('access_token') ||
      json.includes('accessToken') ||
      json.includes('BEGIN CERTIFICATE') ||
      json.includes('BEGIN PRIVATE KEY') ||
      json.includes('clientSecret') ||
      json.includes('client_secret')
    ) {
      console.error('[banking/c6/test-connection] resposta insegura bloqueada');
      return NextResponse.json(
        { error: 'Resposta de teste bloqueada por segurança.' },
        { status: 500 },
      );
    }

    return NextResponse.json(payload, { status: test.success ? 200 : 400 });
  } catch (err) {
    console.error(
      '[banking/c6/test-connection]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: 'Falha ao testar conexão C6.' },
      { status: 500 },
    );
  }
}
