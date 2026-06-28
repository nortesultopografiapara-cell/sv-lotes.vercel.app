import type { BankProviderContext } from './BankProvider';
import { getCompanyBankIntegrationConfig } from './integrationRepository';
import type { TenantBillingAuth } from '@/lib/tenantBillingAuth';
import { sicoobBankProvider } from './providers/sicoobBankProvider';
import {
  sicoobValidationInputFromIntegration,
  validateSicoobConfig,
} from './sicoobConfigValidation';
import type { BankIntegrationStatus } from './types';

export type SicoobTestConnectionBody = {
  clientId?: string;
  clientSecret?: string;
  environment?: string;
  agency?: string;
  account?: string;
  accountDigit?: string;
  walletCode?: string;
  agreementCode?: string;
  beneficiaryCode?: string;
  pixKey?: string;
  certificateName?: string;
  certificatePassword?: string;
};

function buildSicoobProviderContext(
  companyId: string,
  integrationId: string | null,
  environment: 'SANDBOX' | 'PRODUCTION',
  config: ReturnType<typeof sicoobValidationInputFromIntegration>,
): BankProviderContext {
  return {
    companyId,
    integrationId: integrationId ?? `00000000-0000-4000-b000-${companyId.replace(/-/g, '').slice(0, 12)}`,
    environment,
    config,
  };
}

export async function runSicoobTestConnection(
  auth: Pick<TenantBillingAuth, 'admin' | 'tenantId'>,
  body: SicoobTestConnectionBody = {},
) {
  const saved = await getCompanyBankIntegrationConfig(auth.admin, auth.tenantId);

  const validationInput = sicoobValidationInputFromIntegration(saved, {
    clientSecret: body.clientSecret,
    certificatePassword: body.certificatePassword,
  });

  if (body.clientId !== undefined) validationInput.clientId = body.clientId;
  if (body.environment !== undefined) validationInput.environment = body.environment;
  if (body.agency !== undefined) validationInput.agency = body.agency;
  if (body.account !== undefined) validationInput.accountNumber = body.account;
  if (body.accountDigit !== undefined) validationInput.accountDigit = body.accountDigit;
  if (body.walletCode !== undefined) validationInput.walletCode = body.walletCode;
  if (body.agreementCode !== undefined) validationInput.agreementCode = body.agreementCode;
  if (body.beneficiaryCode !== undefined) validationInput.beneficiaryCode = body.beneficiaryCode;
  if (body.pixKey !== undefined) validationInput.pixKey = body.pixKey;
  if (body.certificateName !== undefined) validationInput.certificateName = body.certificateName;

  if (String(body.clientSecret ?? '').trim()) {
    validationInput.hasClientSecret = true;
  }
  if (String(body.certificatePassword ?? '').trim()) {
    validationInput.hasCertificatePassword = true;
  }

  const precheck = validateSicoobConfig(validationInput);
  const env =
    validationInput.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

  const context = buildSicoobProviderContext(
    auth.tenantId,
    saved.id,
    env,
    validationInput,
  );

  const connection = precheck.ok
    ? await sicoobBankProvider.testConnection(context)
    : {
        ok: false,
        message: precheck.message,
        latencyMs: 0,
      };

  return {
    provider: 'SICOOB' as const,
    environment: env,
    integrationStatus: saved.status as BankIntegrationStatus,
    connection,
  };
}
