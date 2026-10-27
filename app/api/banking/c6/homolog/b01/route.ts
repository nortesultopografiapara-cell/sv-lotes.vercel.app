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
import {
  C6_B01_CONFIRMATION_PHRASE,
  C6HomologAuthorizationError,
  assertC6HomologB01SandboxOnly,
  c6HomologB01LiveExecuteOptions,
  captureC6HomologB01Blocked,
  executeC6HomologB01WithIdempotency,
  isC6HomologB01LiveAuthorized,
} from '@/lib/banking/c6/c6BoletoHomologB01';
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
import {
  C6HomologIdempotencyError,
  type C6HomologIdempotencyRow,
} from '@/lib/banking/c6/c6HomologIdempotency';
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

function assertNotProductionRuntime(): NextResponse | null {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') {
    return NextResponse.json(
      { error: 'B_01 de homologação usa somente Preview/Develop. Production está bloqueada.', executed: false },
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
 * GET /api/banking/c6/homolog/b01
 * Pré-voo Sandbox: Secret presente, mTLS, OAuth, escopo e referência.
 * Não reserva. Não emite. Sem token/PEM na resposta.
 */
export async function GET(request: Request) {
  const production = assertNotProductionRuntime();
  if (production) return production;

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
    const url = new URL(request.url);
    const ref = String(url.searchParams.get('external_reference_id') || '').trim();
    const encryption = getBankingEncryptionKeyDiagnostics();
    const liveAuthorized = isC6HomologB01LiveAuthorized();
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB01SandboxOnly('SANDBOX', 'SANDBOX', config.environment);
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
        external_reference_id: ref || null,
        available: Boolean(ref) && !existingAtomic,
        status: existingAtomic?.status || null,
      },
    };
    const blocked = blockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: 200 });
  } catch (err) {
    if (err instanceof C6BoletoScopeError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    console.error('[banking/c6/homolog/b01 GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha no pré-voo B_01.', executed: false }, { status: 500 });
  }
}

/**
 * POST /api/banking/c6/homolog/b01
 * B_01 Sandbox. Sem live: sempre 409, sem HTTP ao C6.
 * Com live (flag + SUPER_ADMIN + EMITIR_B01_SANDBOX): uma emissão Sandbox.
 * Cliente não pode enviar override de emissão. Fora de vendas/Central.
 */
export async function POST(request: Request) {
  const production = assertNotProductionRuntime();
  if (production) return production;

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
    const ref = String(body.external_reference_id || '').trim();
    const existingAtomic =
      integrationId && ref
        ? await loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: ref,
          })
        : null;

    const payload = {
      companyId: auth.tenantId,
      environment: 'SANDBOX' as const,
      billing_scheme: '21',
      external_reference_id: ref,
      amount: Number(body.amount),
      due_date: String(body.due_date || ''),
      payer: body.payer,
    } as C6BoletoCreateInput;

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

    if (isC6HomologB01LiveAuthorized()) {
      const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
      if (!secrets || secrets.environment !== 'SANDBOX') {
        return NextResponse.json(
          { error: 'Credenciais C6 Sandbox ausentes. Emissão interrompida.' },
          { status: 403 },
        );
      }

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
          { error: oauth.message, code: oauth.code, executed: false },
          { status: 400 },
        );
      }
      const scopes = assertC6BankSlipWriteScope(oauth.scopeRaw || oauth.scope);

      const result = await executeC6HomologB01WithIdempotency(
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
        c6HomologB01LiveExecuteOptions(oauth.accessToken),
      );
      assertC6BoletoEvidencePublicSafe(result.evidence);
      const wordEvidence = collectC6HomologWordEvidence(result.evidence);
      const payloadOut = {
        blocked: false,
        executed: result.evidence.executed,
        persistReservation: true,
        testCase: 'B_01',
        scopes,
        evidence: result.evidence,
        wordEvidence,
        persistedIdempotency: result.idempotency,
      };
      const blocked = blockedIfSensitive(payloadOut);
      if (blocked) return blocked;
      return NextResponse.json(payloadOut, { status: result.ok ? 201 : 409 });
    }

    const { evidence } = captureC6HomologB01Blocked(executorInput);
    assertC6BoletoEvidencePublicSafe(evidence);

    let persisted: C6HomologIdempotencyRow | null = existingAtomic;
    try {
      await executeC6HomologB01WithIdempotency(
        { ...executorInput, store },
        { persistReservation: true },
      );
    } catch (err) {
      if (err instanceof C6HomologIdempotencyError) {
        persisted = err.row || persisted;
      } else if (err instanceof C6EmissionNotHomologatedError) {
        // esperado: reserva persistida como FAILED, sem HTTP ao C6
      } else {
        const message = err instanceof Error ? err.message : String(err);
        if (!/PGRST205|PGRST202|42P01|Could not find the (table|function)/i.test(message)) {
          throw err;
        }
      }
    }

    if (integrationId && ref) {
      persisted =
        (await loadC6HomologAtomicRow(auth.admin, {
          companyId: auth.tenantId,
          integrationId,
          externalReferenceId: ref,
        })) || persisted;
    }

    const wordEvidence = collectC6HomologWordEvidence(evidence);
    const jsonPayload = {
      blocked: true,
      executed: false,
      persistReservation: true,
      testCase: 'B_01',
      confirmationRequired: C6_B01_CONFIRMATION_PHRASE,
      evidence,
      wordEvidence,
      persistedIdempotency: persisted,
    };
    const blocked = blockedIfSensitive(jsonPayload);
    if (blocked) return blocked;

    return NextResponse.json(jsonPayload, { status: 409 });
  } catch (err) {
    if (err instanceof C6HomologAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
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
      return NextResponse.json({ error: err.message, fields: err.fields }, { status: 400 });
    }
    if (err instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[banking/c6/homolog/b01]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha ao preparar B_01.' }, { status: 500 });
  }
}
