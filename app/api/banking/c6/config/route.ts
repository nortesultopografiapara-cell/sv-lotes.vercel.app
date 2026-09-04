import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
import type { C6BankConfigSaveInput } from '@/lib/banking/c6/c6ConfigTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const lookup = {
      financialAccountId:
        url.searchParams.get('financialAccountId') ||
        url.searchParams.get('financial_account_id'),
      integrationId:
        url.searchParams.get('integrationId') || url.searchParams.get('integration_id'),
    };
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId, lookup);
    assertC6ConfigResponseSafe(config);
    return NextResponse.json({ config });
  } catch (err) {
    console.error('[banking/c6/config GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar configuração C6.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input: C6BankConfigSaveInput = {
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
      financialAccountId:
        String(body.financialAccountId ?? body.financial_account_id ?? '').trim() || null,
    };

    const config = await saveCompanyC6BankConfig(auth.admin, auth.tenantId, input, {
      financialAccountId: input.financialAccountId,
    });
    assertC6ConfigResponseSafe(config);
    return NextResponse.json({ config });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao salvar configuração C6.';
    if (message.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY')) {
      console.warn(
        '[banking/c6/config PUT] encryption diagnostics',
        getBankingEncryptionKeyDiagnostics(),
      );
    }
    // Nunca logar body/PEM/secret
    console.error('[banking/c6/config PUT]', message);
    const status =
      message.includes('não correspondem') ||
      message.includes('inválid') ||
      message.includes('obrigatório') ||
      message.includes('incompleta') ||
      message.includes('juntos') ||
      message.includes('vinculada')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
