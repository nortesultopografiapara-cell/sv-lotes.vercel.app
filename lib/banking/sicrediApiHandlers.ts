import type { BankProviderContext } from './BankProvider';
import { getCompanyBankIntegrationConfig } from './integrationRepository';
import type { TenantBillingAuth } from '@/lib/tenantBillingAuth';
import { sicrediBankProvider } from './providers/sicrediBankProvider';
import {
  sicrediValidationInputFromIntegration,
  validateSicrediConfig,
} from './sicrediConfigValidation';
import type { BankIntegrationStatus } from './types';

export type SicrediTestConnectionBody = {
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

function buildSicrediProviderContext(
  companyId: string,
  integrationId: string | null,
  environment: 'SANDBOX' | 'PRODUCTION',
  config: ReturnType<typeof sicrediValidationInputFromIntegration>,
): BankProviderContext {
  return {
    companyId,
    integrationId: integrationId ?? `00000000-0000-4000-c000-${companyId.replace(/-/g, '').slice(0, 12)}`,
    environment,
    config,
  };
}

export async function runSicrediTestConnection(
  auth: Pick<TenantBillingAuth, 'admin' | 'tenantId'>,
  body: SicrediTestConnectionBody = {},
) {
  const saved = await getCompanyBankIntegrationConfig(auth.admin, auth.tenantId);

  const validationInput = sicrediValidationInputFromIntegration(saved, {
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

  const precheck = validateSicrediConfig(validationInput);
  const env =
    validationInput.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

  const context = buildSicrediProviderContext(
    auth.tenantId,
    saved.id,
    env,
    validationInput,
  );

  const connection = precheck.ok
    ? await sicrediBankProvider.testConnection(context)
    : {
        ok: false,
        message: precheck.message,
        latencyMs: 0,
      };

  return {
    provider: 'SICREDI' as const,
    environment: env,
    integrationStatus: saved.status as BankIntegrationStatus,
    connection,
  };
}
