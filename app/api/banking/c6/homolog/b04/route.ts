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
  C6_B01_FORBIDDEN_REF,
  C6_B02_FORBIDDEN_REF,
  C6_B03_FORBIDDEN_REF,
  C6_B04_ALTER_CONFIRMATION_PHRASE,
  C6_B04_ALTER_DUE,
  C6_B04_ALTER_REF,
  C6_B04_SOURCE_CONFIRMATION_PHRASE,
  C6_B04_SOURCE_REF,
  assertC6HomologB04SandboxOnly,
  buildC6HomologB04AlterPatch,
  buildC6HomologB04SourcePayload,
  c6HomologB04LiveExecuteOptions,
  executeC6HomologB04AlterWithIdempotency,
  executeC6HomologB04SourceWithIdempotency,
  isC6HomologB04LiveAuthorized,
} from '@/lib/banking/c6/c6BoletoHomologB04';
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
  C6_HOMOLOG_B01_BANK_SLIP_ID,
  C6_HOMOLOG_B02_BANK_SLIP_ID,
  C6_HOMOLOG_B03_BANK_SLIP_ID,
} from '@/lib/banking/c6/c6BoletoHomologIssuedIds';
import {
  c6HomologBlockedIfSensitive,
  c6HomologHasClientLiveOverride,
  c6HomologRejectProductionRuntime,
} from '@/lib/banking/c6/c6HomologRouteSupport';
import { C6_BANK_SLIPS_URL } from '@/lib/banking/c6/c6BoletoEndpoints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isForbiddenPriorRef(ref: string): boolean {
  return (
    ref === C6_B01_FORBIDDEN_REF ||
    ref === C6_B02_FORBIDDEN_REF ||
    ref === C6_B03_FORBIDDEN_REF
  );
}

/**
 * GET /api/banking/c6/homolog/b04
 * Pré-voo B_04. Não reserva. Não emite. Não altera.
 */
export async function GET(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_04');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_04 restrito a administrador da plataforma.' },
      { status: 403 },
    );
  }
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Administrador sem empresa vinculada.' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const ref = String(url.searchParams.get('external_reference_id') || C6_B04_SOURCE_REF).trim();
    if (isForbiddenPriorRef(ref)) {
      return NextResponse.json(
        {
          error: 'B_04 não pode consultar nem reutilizar as referências B_01, B_02 ou B_03.',
          executed: false,
        },
        { status: 403 },
      );
    }
    const encryption = getBankingEncryptionKeyDiagnostics();
    const liveAuthorized = isC6HomologB04LiveAuthorized();
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB04SandboxOnly('SANDBOX', 'SANDBOX', config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const sourceAtomic =
      integrationId
        ? await loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: C6_B04_SOURCE_REF,
          })
        : null;
    const alterAtomic =
      integrationId
        ? await loadC6HomologAtomicRow(auth.admin, {
            companyId: auth.tenantId,
            integrationId,
            externalReferenceId: C6_B04_ALTER_REF,
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
    const exclusiveId = sourceAtomic?.c6BankSlipId || null;
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
      source: {
        external_reference_id: C6_B04_SOURCE_REF,
        available: !sourceAtomic,
        status: sourceAtomic?.status || null,
        c6BankSlipId: exclusiveId,
        confirmationRequiredLater: C6_B04_SOURCE_CONFIRMATION_PHRASE,
      },
      alter: {
        external_reference_id: C6_B04_ALTER_REF,
        available: !alterAtomic,
        status: alterAtomic?.status || null,
        method: 'PUT',
        url: exclusiveId ? `${C6_BANK_SLIPS_URL.SANDBOX}${exclusiveId}` : null,
        patch: buildC6HomologB04AlterPatch(),
        confirmationRequiredLater: C6_B04_ALTER_CONFIRMATION_PHRASE,
      },
      protectedBankSlipIds: {
        B_01: C6_HOMOLOG_B01_BANK_SLIP_ID,
        B_02: C6_HOMOLOG_B02_BANK_SLIP_ID,
        B_03: C6_HOMOLOG_B03_BANK_SLIP_ID,
      },
    };
    const blocked = c6HomologBlockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: 200 });
  } catch (err) {
    if (err instanceof C6BoletoScopeError) {
      return NextResponse.json({ error: err.message, executed: false }, { status: 403 });
    }
    console.error('[banking/c6/homolog/b04 GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Falha no pré-voo B_04.', executed: false }, { status: 500 });
  }
}

/**
 * POST /api/banking/c6/homolog/b04
 * Emite o boleto exclusivo B04S261027 se flag + SUPER_ADMIN + EMITIR_B04_ORIGEM_SANDBOX.
 * Não é o caso oficial B_04 do Word.
 */
export async function POST(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_04');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_04 restrito a administrador da plataforma.' },
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
        { error: 'Administrador não pertence à empresa autorizada para este B_04.' },
        { status: 403 },
      );
    }
    const requestedRef = String(body.external_reference_id || C6_B04_SOURCE_REF).trim();
    if (isForbiddenPriorRef(requestedRef) || requestedRef !== C6_B04_SOURCE_REF) {
      return NextResponse.json(
        {
          error: 'B_04 não reutiliza B_01/B_02/B_03 e só admite a referência B04S261027.',
          executed: false,
        },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB04SandboxOnly('SANDBOX', String(body.environment || 'SANDBOX'), config.environment);
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
          externalReferenceId: C6_B04_SOURCE_REF,
        })
      : null;

    const payload = buildC6HomologB04SourcePayload(auth.tenantId);
    const store = createSupabaseC6HomologIdempotencyAdapter(auth.admin);

    if (!isC6HomologB04LiveAuthorized()) {
      return NextResponse.json(
        { error: 'Emissão do boleto exclusivo B_04 Sandbox não autorizada neste runtime.', executed: false },
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

    const result = await executeC6HomologB04SourceWithIdempotency(
      {
        role: auth.role,
        confirmation: String(body.confirmation || ''),
        sessionCompanyId: auth.tenantId,
        integrationId,
        persistedIdempotency,
        existingAtomic,
        store,
        credentials: {
          companyId: auth.tenantId,
          integrationId: secrets.integrationId,
          environment: 'SANDBOX',
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        },
        payload,
      },
      c6HomologB04LiveExecuteOptions(oauth.accessToken),
    );
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const wordEvidence = collectC6HomologWordEvidence(result.evidence);
    const payloadOut = {
      blocked: false,
      executed: result.evidence.executed,
      persistReservation: true,
      testCase: 'B_04_SOURCE',
      confirmationRequired: C6_B04_SOURCE_CONFIRMATION_PHRASE,
      scopes,
      evidence: result.evidence,
      wordEvidence,
      persistedIdempotency: result.idempotency,
    };
    const blocked = c6HomologBlockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: result.ok ? 201 : 409 });
  } catch (err) {
    return homologB04Error(err, 'B_04 origem');
  }
}

/**
 * PUT /api/banking/c6/homolog/b04
 * Caso oficial B_04: ALTERAR_B04_SANDBOX altera due_date do boleto exclusivo.
 * Não toca B_01/B_02/B_03.
 */
export async function PUT(request: Request) {
  const production = c6HomologRejectProductionRuntime('B_04');
  if (production) return production;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  if (!isPlatformAdmin(auth.role)) {
    return NextResponse.json(
      { error: 'Executor B_04 restrito a administrador da plataforma.' },
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
    if (String(body.confirmation || '').trim() === C6_B04_SOURCE_CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: 'PUT B_04 não emite. Use POST com EMITIR_B04_ORIGEM_SANDBOX.', executed: false },
        { status: 403 },
      );
    }

    const requestedCompanyId = String(body.companyId || body.company_id || '').trim();
    if (requestedCompanyId && requestedCompanyId !== auth.tenantId) {
      return NextResponse.json(
        { error: 'Administrador não pertence à empresa autorizada para este B_04.' },
        { status: 403 },
      );
    }

    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    try {
      assertC6HomologB04SandboxOnly('SANDBOX', String(body.environment || 'SANDBOX'), config.environment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production está bloqueada.';
      return NextResponse.json({ error: message, executed: false }, { status: 403 });
    }

    const integrationId = config.id ? String(config.id) : '';
    const persistedIdempotency = integrationId
      ? (await loadC6HomologIdempotency(auth.admin, auth.tenantId, integrationId)).index
      : {};
    const sourceAtomic = integrationId
      ? await loadC6HomologAtomicRow(auth.admin, {
          companyId: auth.tenantId,
          integrationId,
          externalReferenceId: C6_B04_SOURCE_REF,
        })
      : null;
    const existingAtomic = integrationId
      ? await loadC6HomologAtomicRow(auth.admin, {
          companyId: auth.tenantId,
          integrationId,
          externalReferenceId: C6_B04_ALTER_REF,
        })
      : null;

    if (sourceAtomic?.status !== 'SUCCEEDED' || !sourceAtomic.c6BankSlipId) {
      return NextResponse.json(
        {
          error: 'Boleto exclusivo B04S261027 ainda não foi emitido. B_04 não altera B_01/B_02/B_03.',
          executed: false,
        },
        { status: 409 },
      );
    }

    const store = createSupabaseC6HomologIdempotencyAdapter(auth.admin);

    if (!isC6HomologB04LiveAuthorized()) {
      return NextResponse.json(
        { error: 'Alteração B_04 Sandbox não autorizada neste runtime.', executed: false },
        { status: 409 },
      );
    }

    const secrets = await loadC6SecretsForServer(auth.admin, auth.tenantId, { integrationId });
    if (!secrets || secrets.environment !== 'SANDBOX') {
      return NextResponse.json(
        { error: 'Credenciais C6 Sandbox ausentes. Alteração interrompida.', executed: false },
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

    const result = await executeC6HomologB04AlterWithIdempotency(
      {
        role: auth.role,
        confirmation: String(body.confirmation || ''),
        sessionCompanyId: auth.tenantId,
        integrationId,
        persistedIdempotency,
        existingAtomic,
        store,
        bankSlipId: sourceAtomic.c6BankSlipId,
        patch: buildC6HomologB04AlterPatch(),
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
      c6HomologB04LiveExecuteOptions(oauth.accessToken),
    );
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const wordEvidence = collectC6HomologWordEvidence(result.evidence);
    const payloadOut = {
      blocked: false,
      executed: result.evidence.executed,
      persistReservation: true,
      testCase: 'B_04',
      confirmationRequired: C6_B04_ALTER_CONFIRMATION_PHRASE,
      alterDueDate: C6_B04_ALTER_DUE,
      scopes,
      evidence: result.evidence,
      wordEvidence,
      persistedIdempotency: result.idempotency,
    };
    const blocked = c6HomologBlockedIfSensitive(payloadOut);
    if (blocked) return blocked;
    return NextResponse.json(payloadOut, { status: result.ok ? 200 : 409 });
  } catch (err) {
    return homologB04Error(err, 'B_04');
  }
}

function homologB04Error(err: unknown, label: string) {
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
  console.error(`[banking/c6/homolog/b04] ${label}`, err instanceof Error ? err.message : 'error');
  return NextResponse.json({ error: `Falha ao executar ${label}.`, executed: false }, { status: 500 });
}
