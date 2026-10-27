import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { isPlatformAdmin } from '@/lib/rls';
import {
  getCompanyC6BankConfig,
  loadC6SecretsForServer,
} from '@/lib/banking/c6/c6ConfigRepository';
import { requestC6AccessToken } from '@/lib/banking/c6/c6AuthClient';
import {
  assertC6BoletoEvidencePublicSafe,
  collectC6HomologWordEvidence,
} from '@/lib/banking/c6/c6BoletoEvidence';
import { C6HomologAuthorizationError } from '@/lib/banking/c6/c6BoletoHomologB01';
import { requestC6HomologB02EmitAccessToken } from '@/lib/banking/c6/c6BoletoHomologB02';
import {
  C6_B07_CONFIRMATION_PHRASE,
  C6_B07_IDEMPOTENCY_REF,
  assertC6HomologB07SandboxOnly,
  buildC6HomologB07CallbackUrl,
  c6HomologB07LiveExecuteOptions,
  consultC6HomologB07Existing,
  executeC6HomologB07WithIdempotency,
  isC6HomologB07LiveAuthorized,
  prepareC6HomologB07Consult,
} from '@/lib/banking/c6/c6BoletoHomologB07';
import { C6BoletoValidationError } from '@/lib/banking/c6/c6BoletoValidation';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import {
  C6BoletoScopeError,
  assertC6BankSlipWriteScope,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import { inspectC6LoadedCertificatePublic } from '@/lib/banking/c6/c6LocalValidation';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import { loadC6HomologIdempotency } from '@/lib/banking/c6/c6BoletoIdempotency';
import {
  createSupabaseC6HomologIdempotencyAdapter,
  loadC6HomologAtomicRow,
} from '@/lib/banking/c6/c6HomologIdempotencyRepository';
import { C6HomologIdempotencyError } from '@/lib/banking/c6/c6HomologIdempotency';
import {
  C6_NOTIFICATIONS_REGISTER_METHOD,
  C6_NOTIFICATIONS_ROTEIRO_STATUS,
  C6_NOTIFICATIONS_SERVICE,
  C6_NOTIFICATIONS_OPENAPI_IN_REPO,
} from '@/lib/banking/c6/c6NotificationsOpenApi';
import {
  buildC6WebhookConsultUrl,
  buildC6WebhookRegisterUrl,
  redactC6WebhookUrl,
} from '@/lib/banking/c6/c6WebhookEndpoints';
import {
  C6_WEBHOOK_FINANCE_MUTATION,
  buildC6WebhookReceiverPath,
} from '@/lib/banking/c6/c6WebhookReceiver';
import {
  c6HomologBlockedIfSensitive,
  c6HomologHasClientLiveOverride,
  c6HomologRejectProductionRuntime,
} from '@/lib/banking/c6/c6HomologRouteSupport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/banking/c6/homolog/b07
 * Pré-voo B_07. Referência B07S261027. OAuth/mTLS.
 * Não chama POST /v1/webhooks/. Não chama GET de webhook no C6.
 */
export async function GET(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_07');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_07 restrito a administrador da plataforma.' },
      { status: 403 },
    );
  }
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Administrador sem empresa vinculada.' }, { status: 403 });
  }

  try {
    const encryption = getBankingEncryptionKeyDiagnostics();
    const liveAuthorized = isC6HomologB07LiveAuthorized();
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB07SandboxOnly('SANDBOX', config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const existingAtomic = integrationId
      ? await loadC6HomologAtomicRow(auth.admin, {
          companyId: auth.tenantId,
          integrationId,
          externalReferenceId: C6_B07_IDEMPOTENCY_REF,
        })
      : null;

    if (!encryption.encryptionKeyConfigured) {
      return NextResponse.json(
        {
          executed: false,
          vercelEnv: encryption.vercelEnv,
          encryptionKeyConfigured: false,
          liveAuthorized,
          reason: 'Secret de criptografia ausente no runtime Preview.',
        },
        { status: 503 },
      );
    }

    const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
    if (!secrets || secrets.environment !== 'SANDBOX') {
      return NextResponse.json(
        { executed: false, error: 'Credenciais C6 Sandbox ausentes. Pré-voo interrompido.' },
        { status: 403 },
      );
    }

    const certificateInspect = inspectC6LoadedCertificatePublic(
      secrets.certificatePem,
      secrets.privateKeyPem,
    );
    const mtlsOk =
      certificateInspect.pemCertificateOk &&
      certificateInspect.pemPrivateKeyOk &&
      certificateInspect.pairMatches &&
      !certificateInspect.expired &&
      !certificateInspect.notYetValid;

    const oauth = await requestC6AccessToken(
      {
        companyId: auth.tenantId,
        integrationId: secrets.integrationId,
        environment: 'SANDBOX',
        clientId: secrets.clientId,
        clientSecret: secrets.clientSecret,
        certificatePem: secrets.certificatePem,
        privateKeyPem: secrets.privateKeyPem,
      },
      { allowProduction: false, bypassCache: true },
    );
    if (!oauth.ok) {
      return NextResponse.json(
        {
          executed: false,
          vercelEnv: encryption.vercelEnv,
          encryptionKeyConfigured: true,
          decrypted: true,
          mtlsOk,
          certificateInspect,
          oauth: {
            ok: false,
            code: oauth.code,
            host: oauth.diagnostic?.remoteHost || null,
            httpStatus: oauth.httpStatus ?? null,
          },
        },
        { status: 400 },
      );
    }

    const scopes = assertC6BankSlipWriteScope(oauth.scopeRaw || oauth.scope);
    const origin = new URL(request.url).origin;
    const callbackUrl = buildC6HomologB07CallbackUrl(origin, secrets.integrationId);
    const consult = prepareC6HomologB07Consult({
      companyId: auth.tenantId,
      environment: 'SANDBOX',
      integrationId: secrets.integrationId,
    });
    const payloadOut = {
      executed: false,
      vercelEnv: encryption.vercelEnv,
      encryptionKeyConfigured: true,
      decrypted: true,
      liveAuthorized,
      mtlsOk,
      certificateInspect,
      oauth: {
        ok: true,
        host: oauth.authUrlHost,
        httpStatus: oauth.httpStatus,
        tokenType: oauth.tokenTypeRaw,
        scopes,
      },
      integration: {
        id: secrets.integrationId,
        environment: secrets.environment,
        sandbox: secrets.environment === 'SANDBOX',
      },
      receiver: {
        path: buildC6WebhookReceiverPath(secrets.integrationId),
        urlRedacted: redactC6WebhookUrl(callbackUrl),
        https: callbackUrl.startsWith('https://'),
        financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
        originAuth: 'route-token',
        c6InboundSignatureDocumented: false,
      },
      register: {
        method: C6_NOTIFICATIONS_REGISTER_METHOD,
        url: buildC6WebhookRegisterUrl('SANDBOX'),
        body: { url: redactC6WebhookUrl(callbackUrl), service: C6_NOTIFICATIONS_SERVICE },
        roteiroExpectedStatus: C6_NOTIFICATIONS_ROTEIRO_STATUS,
        openapiInRepo: C6_NOTIFICATIONS_OPENAPI_IN_REPO,
        executed: false,
        confirmationRequiredLater: C6_B07_CONFIRMATION_PHRASE,
      },
      consult: {
        method: consult.method,
        url: buildC6WebhookConsultUrl('SANDBOX'),
        executed: false,
        reason: 'GET oficial /v1/webhooks/?service=BANK_SLIP (portal /apis/webhook). Executado só no POST autorizado.',
      },
      reference: {
        external_reference_id: C6_B07_IDEMPOTENCY_REF,
        available: !existingAtomic,
        status: existingAtomic?.status || null,
      },
    };
    const blocked = c6HomologBlockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: 200 });
  } catch (err) {
    if (err instanceof C6BoletoScopeError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    console.error('[banking/c6/homolog/b07 GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha no pré-voo B_07.', executed: false }, { status: 500 });
  }
}

/**
 * POST /api/banking/c6/homolog/b07
 * Cadastra webhook no C6 somente com CADASTRAR_B07_WEBHOOK_SANDBOX + flag live.
 * Não baixa financeiro. Não executa B_06 nem B_08.
 */
export async function POST(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_07');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_07 restrito a administrador da plataforma.' },
      { status: 403 },
    );
  }
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Administrador sem empresa vinculada.' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (c6HomologHasClientLiveOverride(body)) {
      return NextResponse.json(
        { error: 'Parâmetros de emissão ao vivo não são aceitos nesta rota.' },
        { status: 403 },
      );
    }

    const requestedCompanyId = String(body.companyId || body.company_id || '').trim();
    if (requestedCompanyId && requestedCompanyId !== auth.tenantId) {
      return NextResponse.json(
        { error: 'Administrador não pertence à empresa autorizada para este B_07.' },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB07SandboxOnly('SANDBOX', config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const persistedIdempotency = integrationId
      ? (await loadC6HomologIdempotency(auth.admin, auth.tenantId, integrationId)).index
      : {};
    const existingAtomic = integrationId
      ? await loadC6HomologAtomicRow(auth.admin, {
          companyId: auth.tenantId,
          integrationId,
          externalReferenceId: C6_B07_IDEMPOTENCY_REF,
        })
      : null;

    if (!isC6HomologB07LiveAuthorized()) {
      return NextResponse.json(
        { error: 'Cadastro B_07 Sandbox não autorizado neste runtime.', executed: false },
        { status: 409 },
      );
    }

    const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
    if (!secrets || secrets.environment !== 'SANDBOX') {
      return NextResponse.json(
        { error: 'Credenciais C6 Sandbox ausentes. Cadastro interrompido.', executed: false },
        { status: 403 },
      );
    }

    const oauth = await requestC6HomologB02EmitAccessToken({
      companyId: auth.tenantId,
      integrationId: secrets.integrationId,
      environment: 'SANDBOX',
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    });
    if (!oauth.ok) {
      return NextResponse.json(
        {
          error: oauth.message,
          code: oauth.code,
          executed: false,
          oauth: {
            ok: false,
            host: oauth.diagnostic?.remoteHost || null,
            httpStatus: oauth.httpStatus ?? null,
            fromCache: false,
            tlsCompleted: oauth.diagnostic?.tlsCompleted ?? null,
            durationMs: oauth.diagnostic?.durationMs ?? null,
          },
        },
        { status: 400 },
      );
    }
    const scopes = assertC6BankSlipWriteScope(oauth.scopeRaw || oauth.scope);
    const credentials = {
      companyId: auth.tenantId,
      integrationId: secrets.integrationId,
      environment: 'SANDBOX' as const,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };
    const consult = await consultC6HomologB07Existing(credentials, oauth.accessToken);
    assertC6BoletoEvidencePublicSafe(consult.evidence);
    if (consult.interpretation.outcome !== 'absent') {
      const payloadOut = {
        blocked: true,
        executed: false,
        persistReservation: false,
        testCase: 'B_07',
        financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
        scopes,
        consult: {
          executed: true,
          outcome: consult.interpretation.outcome,
          httpStatus: consult.interpretation.httpStatus,
          service: consult.interpretation.service,
          urlRedacted: consult.interpretation.urlRedacted,
          webhookId: consult.interpretation.webhookId,
        },
        evidence: consult.evidence,
        message:
          consult.interpretation.outcome === 'present'
            ? 'Webhook BANK_SLIP já cadastrado. POST não enviado.'
            : 'GET oficial não confirmou ausência com segurança. POST não enviado.',
      };
      const blocked = c6HomologBlockedIfSensitive(payloadOut);
      if (blocked) return blocked;
      return NextResponse.json(payloadOut, { status: 409 });
    }

    const store = createSupabaseC6HomologIdempotencyAdapter(auth.admin);
    const origin = new URL(request.url).origin;
    const callbackUrl = buildC6HomologB07CallbackUrl(origin, secrets.integrationId);

    const result = await executeC6HomologB07WithIdempotency(
      {
        role: auth.role,
        confirmation: String(body.confirmation || ''),
        sessionCompanyId: auth.tenantId,
        integrationId,
        persistedIdempotency,
        existingAtomic,
        store,
        callbackUrl,
        credentials,
      },
      c6HomologB07LiveExecuteOptions(oauth.accessToken),
    );
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const wordEvidence = collectC6HomologWordEvidence(result.evidence);
    const payloadOut = {
      blocked: false,
      executed: result.evidence.executed,
      persistReservation: true,
      testCase: 'B_07',
      financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
      scopes,
      consult: {
        executed: true,
        outcome: consult.interpretation.outcome,
        httpStatus: consult.interpretation.httpStatus,
        service: consult.interpretation.service,
        urlRedacted: consult.interpretation.urlRedacted,
        webhookId: consult.interpretation.webhookId,
      },
      evidence: result.evidence,
      wordEvidence,
      persistedIdempotency: result.idempotency,
    };
    const blocked = c6HomologBlockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof C6HomologAuthorizationError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    if (err instanceof C6BoletoScopeError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    if (err instanceof C6HomologIdempotencyError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason, blocked: true, executed: false },
        { status: 409 },
      );
    }
    if (err instanceof C6BoletoValidationError) {
      return NextResponse.json({ error: err.message, fields: err.fields, executed: false }, { status: 400 });
    }
    if (err instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 409 });
    }
    console.error('[banking/c6/homolog/b07]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha ao executar B_07.', executed: false }, { status: 500 });
  }
}
