import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import {
  assertIntegrationResponseSafe,
  getCompanyBankIntegrationConfig,
  saveCompanyBankIntegrationConfig,
} from '@/lib/banking/integrationRepository';
import type { BankIntegrationConfigInput } from '@/lib/banking/integrationConfig';
import { normalizeBankEnvironmentInput, normalizeBankProviderInput } from '@/lib/banking/integrationConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const config = await getCompanyBankIntegrationConfig(auth.admin, auth.tenantId);
    assertIntegrationResponseSafe(config);
    return NextResponse.json({ integration: config });
  } catch (err) {
    console.error('[banking/integration GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar integração.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input: BankIntegrationConfigInput = {
      bankProvider: normalizeBankProviderInput(body.bankProvider ?? body.bank_provider),
      environment: normalizeBankEnvironmentInput(body.environment),
      clientId: String(body.clientId ?? body.client_id ?? ''),
      clientSecret: String(body.clientSecret ?? body.client_secret ?? ''),
      webhookSecret: String(body.webhookSecret ?? body.webhook_secret ?? ''),
      apiBaseUrl: String(body.apiBaseUrl ?? body.api_base_url ?? ''),
      webhookUrl: String(body.webhookUrl ?? body.webhook_url ?? ''),
      agency: String(body.agency ?? ''),
      account: String(body.account ?? body.account_number ?? ''),
      accountDigit: String(body.accountDigit ?? body.account_digit ?? ''),
      walletCode: String(body.walletCode ?? body.wallet_code ?? ''),
      agreementCode: String(body.agreementCode ?? body.agreement_code ?? body.covenant_code ?? ''),
      beneficiaryCode: String(body.beneficiaryCode ?? body.beneficiary_code ?? ''),
      pixKey: String(body.pixKey ?? body.pix_key ?? ''),
      certificateName: String(body.certificateName ?? body.certificate_name ?? ''),
      certificatePassword: String(body.certificatePassword ?? body.certificate_password ?? ''),
      active: Boolean(body.active),
    };

    const integration = await saveCompanyBankIntegrationConfig(
      auth.admin,
      auth.tenantId,
      auth.userId,
      input,
    );
    assertIntegrationResponseSafe(integration);
    return NextResponse.json({ integration });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar integração.';
    if (message.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY')) {
      console.warn('[banking/integration PUT] encryption key diagnostics', getBankingEncryptionKeyDiagnostics());
    }
    console.error('[banking/integration PUT]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
