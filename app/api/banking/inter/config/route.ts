import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import {
  assertInterConfigResponseSafe,
  getCompanyInterBankConfig,
  saveCompanyInterBankConfig,
} from '@/lib/banking/inter/interConfigRepository';
import type { InterBankConfigSaveInput } from '@/lib/banking/inter/interConfigTypes';
import { runCompanyInterConnectionTest } from '@/lib/banking/inter/interConnectionTest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const config = await getCompanyInterBankConfig(auth.admin, auth.tenantId);
    assertInterConfigResponseSafe(config);
    return NextResponse.json({ config });
  } catch (err) {
    console.error('[banking/inter/config GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar configuração Inter.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input: InterBankConfigSaveInput = {
      environment: normalizeBankEnvironmentInput(body.environment),
      clientId: String(body.clientId ?? body.client_id ?? ''),
      clientSecret: String(body.clientSecret ?? body.client_secret ?? ''),
      certificatePem: String(body.certificatePem ?? body.certificate_pem ?? ''),
      certificateFileName: String(
        body.certificateFileName ?? body.certificate_file_name ?? '',
      ),
      privateKeyPem: String(body.privateKeyPem ?? body.private_key_pem ?? ''),
      privateKeyFileName: String(
        body.privateKeyFileName ?? body.private_key_file_name ?? '',
      ),
    };

    const config = await saveCompanyInterBankConfig(
      auth.admin,
      auth.tenantId,
      auth.userId,
      input,
    );
    assertInterConfigResponseSafe(config);
    return NextResponse.json({ config });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao salvar configuração Inter.';
    if (message.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY')) {
      console.warn(
        '[banking/inter/config PUT] encryption diagnostics',
        getBankingEncryptionKeyDiagnostics(),
      );
    }
    // Nunca logar body/PEM
    console.error('[banking/inter/config PUT]', message);
    const status =
      message.includes('não correspondem') ||
      message.includes('inválid') ||
      message.includes('obrigatório') ||
      message.includes('incompleta') ||
      message.includes('juntos')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Fase B — OAuth2 + mTLS real (sem emissão de cobrança). */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'test-connection') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const { test, config } = await runCompanyInterConnectionTest(auth.admin, auth.tenantId);
    assertInterConfigResponseSafe(config);

    const payload = {
      ok: test.ok,
      message: test.message,
      environment: test.environment,
      authStatus: test.authStatus,
      testedAt: test.testedAt,
      connectionVerified: test.connectionVerified,
      tokenUrlHost: test.tokenUrlHost,
      expiresIn: test.expiresIn,
      config,
    };

    const json = JSON.stringify(payload);
    if (
      json.includes('access_token') ||
      json.includes('BEGIN CERTIFICATE') ||
      json.includes('BEGIN PRIVATE KEY') ||
      json.includes('clientSecret')
    ) {
      console.error('[banking/inter/config POST test] resposta insegura bloqueada');
      return NextResponse.json(
        { error: 'Resposta de teste bloqueada por segurança.' },
        { status: 500 },
      );
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error(
      '[banking/inter/config POST test]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro no teste de conexão Inter.' },
      { status: 500 },
    );
  }
}
