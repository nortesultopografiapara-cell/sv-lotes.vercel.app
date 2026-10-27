import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertC6ConnectionTestPublicSafe,
  type C6ConnectionTestPublic,
} from '@/lib/banking/c6/c6AuthClient';
import { assertC6ConfigResponseSafe } from '@/lib/banking/c6/c6ConfigRepository';
import { runCompanyC6ConnectionTest } from '@/lib/banking/c6/c6ConnectionTest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function lookupFrom(request: Request, body: Record<string, unknown>) {
  const url = new URL(request.url);
  return {
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
  };
}

function publicPayload(test: C6ConnectionTestPublic) {
  return {
    success: test.success,
    environment: test.environment,
    tokenType: test.tokenType,
    tokenTypeSource: test.tokenTypeSource,
    expiresIn: test.expiresIn,
    expiresInSource: test.expiresInSource,
    scope: test.scope,
    scopeSource: test.scopeSource,
    scopes: test.scopes,
    message: test.message,
    status: test.status,
    testedAt: test.testedAt,
    httpStatus: test.httpStatus,
    authUrlHost: test.authUrlHost,
    method: test.method,
    path: test.path,
    grantType: test.grantType,
    oauthCredentialReturned: test.oauthCredentialReturned,
    fromCache: test.fromCache,
    evidence: test.evidence,
    inspectOnly: Boolean(test.inspectOnly),
    certificateInspect: test.certificateInspect || null,
    httpDiagnostic: test.httpDiagnostic || null,
    code: test.code,
  };
}

function blockedIfUnsafe(payload: ReturnType<typeof publicPayload>) {
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
  return null;
}

/**
 * GET /api/banking/c6/test-connection
 * Inspeção local do certificado (PEM/par/validade). Não chama o C6.
 */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const lookup = lookupFrom(request, {});
    const { test, config } = await runCompanyC6ConnectionTest(auth.admin, auth.tenantId, {
      ...lookup,
      inspectOnly: true,
    });
    assertC6ConfigResponseSafe(config);
    assertC6ConnectionTestPublicSafe(test);
    const payload = publicPayload(test);
    const blocked = blockedIfUnsafe(payload);
    if (blocked) return blocked;
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error(
      '[banking/c6/test-connection GET]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: 'Falha ao inspecionar certificado C6.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/banking/c6/test-connection
 * Fase 3A — autentica no C6 (mTLS + client_credentials). Sem cobrança.
 * inspectOnly=true inspeciona o certificado e não chama o C6.
 */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const inspectOnly = body.inspectOnly === true || body.inspect_only === true;
    const { test, config } = await runCompanyC6ConnectionTest(auth.admin, auth.tenantId, {
      ...lookupFrom(request, body),
      inspectOnly,
    });

    assertC6ConfigResponseSafe(config);
    assertC6ConnectionTestPublicSafe(test);

    const payload = publicPayload(test);
    const blocked = blockedIfUnsafe(payload);
    if (blocked) return blocked;

    const httpStatus = inspectOnly ? 200 : test.success ? 200 : 400;
    return NextResponse.json(payload, { status: httpStatus });
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
