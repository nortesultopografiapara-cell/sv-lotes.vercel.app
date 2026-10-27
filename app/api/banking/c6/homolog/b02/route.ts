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
import {
  C6_B01_FORBIDDEN_REF,
  C6_B02_AUTHORIZED_REF,
  C6_B02_CONFIRMATION_PHRASE,
  assertC6HomologB02SandboxOnly,
  buildC6HomologB02AuthorizedPayload,
  c6HomologB02LiveExecuteOptions,
  executeC6HomologB02WithIdempotency,
  isC6HomologB02LiveAuthorized,
  requestC6HomologB02EmitAccessToken,
} from '@/lib/banking/c6/c6BoletoHomologB02';
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

function assertNotProductionRuntime(): NextResponse | null {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') {
    return NextResponse.json(
      { error: 'B_02 de homologação usa somente Preview/Develop. Production está bloqueada.', executed: false },
      { status: 403 },
    );
  }
  return null;
}

function blockedIfSensitive(payload: unknown) {
  const json = JSON.stringify(payload);
  if (
    json.includes('access_token') ||
    json.includes('BEGIN CERTIFICATE') ||
    json.includes('BEGIN PRIVATE KEY') ||
    json.includes('client_secret') ||
    json.includes('clientSecret')
  ) {
    return NextResponse.json({ error: 'Resposta bloqueada por segurança.' }, { status: 500 });
  }
  return null;
}

/**
 * GET /api/banking/c6/homolog/b02
 * Pré-voo B_02. Não reserva. Não emite.
 */
export async function GET(request: Request) {
  const production = assertNotProductionRuntime();
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_02 restrito a administrador da plataforma.' },
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
    const url = new URL(request.url);
    const ref = String(url.searchParams.get('external_reference_id') || C6_B02_AUTHORIZED_REF).trim();
    if (ref === C6_B01_FORBIDDEN_REF) {
      return NextResponse.json(
        { error: 'B_02 não pode consultar nem reutilizar a referência B_01.', executed: false },
        { status: 403 },
      );
    }
    const encryption = getBankingEncryptionKeyDiagnostics();
    const liveAuthorized = isC6HomologB02LiveAuthorized();
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB02SandboxOnly('SANDBOX', 'SANDBOX', config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const existingAtomic =
      integrationId && ref
        ? await loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: ref,
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
      reference: {
        external_reference_id: ref,
        available: !existingAtomic,
        status: existingAtomic?.status || null,
        forbiddenB01: false,
      },
    };
    const blocked = blockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: 200 });
  } catch (err) {
    if (err instanceof C6BoletoScopeError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    console.error('[banking/c6/homolog/b02 GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha no pré-voo B_02.', executed: false }, { status: 500 });
  }
}

/**
 * POST /api/banking/c6/homolog/b02
 * Um POST Sandbox com juros/multa, se flag + SUPER_ADMIN + EMITIR_B02_SANDBOX.
 */
export async function POST(request: Request) {
  const production = assertNotProductionRuntime();
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_02 restrito a administrador da plataforma.' },
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
        { error: 'Administrador não pertence à empresa autorizada para este B_02.' },
        { status: 403 },
      );
    }
    const requestedRef = String(body.external_reference_id || C6_B02_AUTHORIZED_REF).trim();
    if (requestedRef === C6_B01_FORBIDDEN_REF || requestedRef !== C6_B02_AUTHORIZED_REF) {
      return NextResponse.json(
        { error: 'B_02 não reutiliza B_01 e só admite a referência B02S261027.', executed: false },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB02SandboxOnly('SANDBOX', String(body.environment || 'SANDBOX'), config.environment);
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
          externalReferenceId: C6_B02_AUTHORIZED_REF,
        })
      : null;

    const payload = buildC6HomologB02AuthorizedPayload(auth.tenantId);
    const executorInput = {
      role: auth.role,
      confirmation: String(body.confirmation || ''),
      sessionCompanyId: auth.tenantId,
      integrationId,
      persistedIdempotency,
      existingAtomic,
      credentials: {
        companyId: auth.tenantId,
        integrationId,
        environment: 'SANDBOX' as const,
        clientId: 'blocked',
        clientSecret: 'blocked',
        certificatePem: 'blocked',
        privateKeyPem: 'blocked',
      },
      payload,
    };

    const store = createSupabaseC6HomologIdempotencyAdapter(auth.admin);

    if (!isC6HomologB02LiveAuthorized()) {
      return NextResponse.json(
        { error: 'Emissão B_02 Sandbox não autorizada neste runtime.', executed: false },
        { status: 409 },
      );
    }

    const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
    if (!secrets || secrets.environment !== 'SANDBOX') {
      return NextResponse.json(
        { error: 'Credenciais C6 Sandbox ausentes. Emissão interrompida.', executed: false },
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

    const result = await executeC6HomologB02WithIdempotency(
      {
        ...executorInput,
        credentials: {
          companyId: auth.tenantId,
          integrationId: secrets.integrationId,
          environment: 'SANDBOX',
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        },
        store,
      },
      c6HomologB02LiveExecuteOptions(oauth.accessToken),
    );
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const wordEvidence = collectC6HomologWordEvidence(result.evidence);
    const payloadOut = {
      blocked: false,
      executed: result.evidence.executed,
      persistReservation: true,
      testCase: 'B_02',
      scopes,
      evidence: result.evidence,
      wordEvidence,
      persistedIdempotency: result.idempotency,
    };
    const blocked = blockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: result.ok ? 201 : 409 });
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
    console.error('[banking/c6/homolog/b02]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha ao executar B_02.', executed: false }, { status: 500 });
  }
}
