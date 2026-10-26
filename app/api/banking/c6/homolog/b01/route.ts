import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { isPlatformAdmin } from '@/lib/rls';
import { getCompanyC6BankConfig } from '@/lib/banking/c6/c6ConfigRepository';
import { assertC6BoletoEvidencePublicSafe } from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6_B01_CONFIRMATION_PHRASE,
  C6HomologAuthorizationError,
  assertC6HomologB01SandboxOnly,
  captureC6HomologB01Blocked,
} from '@/lib/banking/c6/c6BoletoHomologB01';
import { C6BoletoValidationError } from '@/lib/banking/c6/c6BoletoValidation';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import { loadC6HomologIdempotency } from '@/lib/banking/c6/c6BoletoIdempotency';
import type { C6BoletoCreateInput } from '@/lib/banking/c6/c6BoletoTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasClientLiveOverride(body: Record<string, unknown>): boolean {
  return Boolean(
    body.allowSandboxLive ||
      body.allowSimulatedHttp ||
      body.accessToken ||
      body.fetchFn ||
      body.credentials,
  );
}

/**
 * POST /api/banking/c6/homolog/b01
 * Prepara B_01 (Sandbox). Sempre 409. Nunca emite. Fora de vendas/Central.
 */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_01 restrito a administrador da plataforma.' },
      { status: 403 },
    );
  }
  if (!auth.tenantId) {
    return NextResponse.json(
      { error: 'Administrador sem empresa vinculada.' },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (hasClientLiveOverride(body)) {
      return NextResponse.json(
        { error: 'Parâmetros de emissão ao vivo não são aceitos nesta rota.' },
        { status: 403 },
      );
    }

    const requestedCompanyId = String(body.companyId || body.company_id || '').trim();
    if (requestedCompanyId && requestedCompanyId !== auth.tenantId) {
      return NextResponse.json(
        { error: 'Administrador não pertence à empresa autorizada para este B_01.' },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB01SandboxOnly('SANDBOX', String(body.environment || 'SANDBOX'), config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const persistedIdempotency = integrationId
      ? (await loadC6HomologIdempotency(auth.admin, auth.tenantId, integrationId)).index
      : {};

    const payload = {
      companyId: auth.tenantId,
      environment: 'SANDBOX' as const,
      external_reference_id: String(body.external_reference_id || ''),
      amount: Number(body.amount),
      due_date: String(body.due_date || ''),
      payer: body.payer,
    } as C6BoletoCreateInput;

    const { evidence } = captureC6HomologB01Blocked({
      role: auth.role,
      confirmation: String(body.confirmation || ''),
      sessionCompanyId: auth.tenantId,
      integrationId,
      persistedIdempotency,
      credentials: {
        companyId: auth.tenantId,
        integrationId,
        environment: 'SANDBOX',
        clientId: 'blocked',
        clientSecret: 'blocked',
        certificatePem: 'blocked',
        privateKeyPem: 'blocked',
      },
      payload,
    });

    assertC6BoletoEvidencePublicSafe(evidence);
    const json = JSON.stringify(evidence);
    if (
      json.includes('access_token') ||
      json.includes('BEGIN CERTIFICATE') ||
      json.includes('BEGIN PRIVATE KEY') ||
      json.includes('client_secret') ||
      json.includes('clientSecret')
    ) {
      return NextResponse.json({ error: 'Resposta bloqueada por segurança.' }, { status: 500 });
    }

    return NextResponse.json(
      {
        blocked: true,
        executed: false,
        testCase: 'B_01',
        confirmationRequired: C6_B01_CONFIRMATION_PHRASE,
        evidence,
      },
      { status: 409 },
    );
  } catch (err) {
    if (err instanceof C6HomologAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof C6BoletoValidationError) {
      return NextResponse.json({ error: err.message, fields: err.fields }, { status: 400 });
    }
    if (err instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[banking/c6/homolog/b01]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha ao preparar B_01.' }, { status: 500 });
  }
}
