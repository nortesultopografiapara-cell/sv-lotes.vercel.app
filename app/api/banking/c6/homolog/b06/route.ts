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
import { requestC6HomologReadAccessToken } from '@/lib/banking/c6/c6BoletoHomologB05';
import {
  C6_B06_AUTHORIZED_BANK_SLIP_ID,
  C6_B06_CONFIRMATION_PHRASE,
  C6_B06_FIRST_ATTEMPT_REF,
  C6_B06_IDEMPOTENCY_REF,
  C6_B06_SECOND_ATTEMPT_REF,
  assertC6HomologB06SandboxOnly,
  c6HomologB06LiveExecuteOptions,
  executeC6HomologB06WithIdempotency,
  isC6HomologB06LiveAuthorized,
} from '@/lib/banking/c6/c6BoletoHomologB06';
import { C6BoletoValidationError } from '@/lib/banking/c6/c6BoletoValidation';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import {
  C6BoletoScopeError,
  C6_BOLETO_PDF_ACCEPT,
  assertC6BankSlipReadScope,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import { inspectC6LoadedCertificatePublic } from '@/lib/banking/c6/c6LocalValidation';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import { loadC6HomologIdempotency } from '@/lib/banking/c6/c6BoletoIdempotency';
import {
  createSupabaseC6HomologIdempotencyAdapter,
  loadC6HomologAtomicRow,
} from '@/lib/banking/c6/c6HomologIdempotencyRepository';
import { C6HomologIdempotencyError } from '@/lib/banking/c6/c6HomologIdempotency';
import { buildC6BankSlipPdfUrl } from '@/lib/banking/c6/c6BoletoEndpoints';
import {
  c6HomologBlockedIfSensitive,
  c6HomologHasClientLiveOverride,
  c6HomologRejectProductionRuntime,
} from '@/lib/banking/c6/c6HomologRouteSupport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/banking/c6/homolog/b06
 * Pré-voo B_06. OAuth/mTLS/escopo. Não chama GET PDF bancário.
 */
export async function GET(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_06');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_06 restrito a administrador da plataforma.' },
      { status: 403 },
    );
  }
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Administrador sem empresa vinculada.' }, { status: 403 });
  }

  try {
    const encryption = getBankingEncryptionKeyDiagnostics();
    const liveAuthorized = isC6HomologB06LiveAuthorized();
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB06SandboxOnly('SANDBOX', config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const [firstAttempt, secondAttempt, existingAtomic] = integrationId
      ? await Promise.all([
          loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: C6_B06_FIRST_ATTEMPT_REF,
          }),
          loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: C6_B06_SECOND_ATTEMPT_REF,
          }),
          loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: C6_B06_IDEMPOTENCY_REF,
          }),
        ])
      : [null, null, null];

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

    const scopes = assertC6BankSlipReadScope(oauth.scopeRaw || oauth.scope);
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
      query: {
        method: 'GET',
        url: buildC6BankSlipPdfUrl('SANDBOX', C6_B06_AUTHORIZED_BANK_SLIP_ID),
        bankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
        source: 'B_01',
        accept: C6_BOLETO_PDF_ACCEPT,
        contentType: null,
        confirmationRequiredLater: C6_B06_CONFIRMATION_PHRASE,
      },
      previousAttempt: {
        external_reference_id: C6_B06_FIRST_ATTEMPT_REF,
        status: firstAttempt?.status || null,
        lastHttpStatus: firstAttempt?.lastHttpStatus || null,
        mutate: false,
      },
      previousAttempts: [
        {
          external_reference_id: C6_B06_FIRST_ATTEMPT_REF,
          status: firstAttempt?.status || null,
          lastHttpStatus: firstAttempt?.lastHttpStatus || null,
          mutate: false,
        },
        {
          external_reference_id: C6_B06_SECOND_ATTEMPT_REF,
          status: secondAttempt?.status || null,
          lastHttpStatus: secondAttempt?.lastHttpStatus || null,
          mutate: false,
        },
      ],
      reference: {
        external_reference_id: C6_B06_IDEMPOTENCY_REF,
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
    console.error('[banking/c6/homolog/b06 GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha no pré-voo B_06.', executed: false }, { status: 500 });
  }
}

/**
 * POST /api/banking/c6/homolog/b06
 * Executa GET PDF do B_01 se flag + SUPER_ADMIN + CONSULTAR_B06_TERCEIRA_TENTATIVA_SANDBOX.
 * Não emite.
 */
export async function POST(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_06');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_06 restrito a administrador da plataforma.' },
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
        { error: 'Administrador não pertence à empresa autorizada para este B_06.' },
        { status: 403 },
      );
    }
    const requestedId = String(body.id || body.bank_slip_id || C6_B06_AUTHORIZED_BANK_SLIP_ID).trim();
    if (requestedId !== C6_B06_AUTHORIZED_BANK_SLIP_ID) {
      return NextResponse.json(
        { error: 'B_06 gera o PDF somente do id do B_01.', executed: false },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB06SandboxOnly('SANDBOX', config.environment);
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
          externalReferenceId: C6_B06_IDEMPOTENCY_REF,
        })
      : null;

    if (!isC6HomologB06LiveAuthorized()) {
      return NextResponse.json(
        { error: 'Consulta PDF B_06 Sandbox não autorizada neste runtime.', executed: false },
        { status: 409 },
      );
    }

    const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
    if (!secrets || secrets.environment !== 'SANDBOX') {
      return NextResponse.json(
        { error: 'Credenciais C6 Sandbox ausentes. Consulta PDF interrompida.', executed: false },
        { status: 403 },
      );
    }

    const oauth = await requestC6HomologReadAccessToken({
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
    const scopes = assertC6BankSlipReadScope(oauth.scopeRaw || oauth.scope);
    const store = createSupabaseC6HomologIdempotencyAdapter(auth.admin);

    const result = await executeC6HomologB06WithIdempotency(
      {
        role: auth.role,
        confirmation: String(body.confirmation || ''),
        sessionCompanyId: auth.tenantId,
        integrationId,
        persistedIdempotency,
        existingAtomic,
        store,
        bankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
        credentials: {
          companyId: auth.tenantId,
          integrationId: secrets.integrationId,
          environment: 'SANDBOX',
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        },
      },
      c6HomologB06LiveExecuteOptions(oauth.accessToken),
    );
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const wordEvidence = collectC6HomologWordEvidence(result.evidence);
    const payloadOut = {
      blocked: false,
      executed: result.evidence.executed,
      persistReservation: true,
      testCase: 'B_06',
      scopes,
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
    console.error('[banking/c6/homolog/b06]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha ao executar B_06.', executed: false }, { status: 500 });
  }
}
