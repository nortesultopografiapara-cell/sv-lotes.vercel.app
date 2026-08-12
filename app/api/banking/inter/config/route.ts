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
import { interBankProvider } from '@/lib/banking/providers/interBankProvider';

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

/** Teste local Fase A — não chama API Inter. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'test-connection') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const config = await getCompanyInterBankConfig(auth.admin, auth.tenantId);
    const result = await interBankProvider.testConnection({
      integrationId: config.id || 'none',
      companyId: auth.tenantId,
      environment: config.environment,
      config: {
        clientId: config.clientId,
        hasClientSecret: config.hasClientSecret,
        hasCertificate: config.hasCertificate,
        hasPrivateKey: config.hasPrivateKey,
      },
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      latencyMs: result.latencyMs,
      connectionVerified: false,
    });
  } catch (err) {
    console.error(
      '[banking/inter/config POST test]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro no teste local.' },
      { status: 500 },
    );
  }
}
