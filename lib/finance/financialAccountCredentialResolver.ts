/**
 * Resolução de credenciais pela conta financeira (identidade operacional).
 * INTER / ASAAS_COMPANY emitem; C6 é reconhecido e bloqueado nesta fase.
 * Nunca logar secrets. Nunca escolher "a integração do provider da empresa".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import { getCompanyFinancialAccountById } from '@/lib/finance/companyFinancialAccountRepository';
import { loadAsaasApiKeyForFinancialAccount } from '@/lib/finance/companyFinancialAccountRepository';

export type FinancialProviderCode = 'INTER' | 'ASAAS_COMPANY' | 'C6';

export type InterAccountSecrets = {
  provider: 'INTER';
  companyId: string;
  financialAccountId: string;
  integrationId: string;
  environment: BankEnvironment;
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type AsaasAccountSecrets = {
  provider: 'ASAAS_COMPANY';
  companyId: string;
  financialAccountId: string;
  integrationId: string;
  environment: BankEnvironment;
  apiKey: string;
};

export type FinancialAccountSecrets = InterAccountSecrets | AsaasAccountSecrets;

function asProvider(raw: string | null | undefined): FinancialProviderCode | null {
  const p = String(raw || '').trim().toUpperCase();
  if (p === 'INTER') return 'INTER';
  if (p === 'ASAAS_COMPANY' || p === 'ASAAS') return 'ASAAS_COMPANY';
  if (p === 'C6') return 'C6';
  return null;
}

export async function resolveFinancialAccountSecrets(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
): Promise<FinancialAccountSecrets> {
  const account = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
  if (!account || !account.active) {
    throw new Error('Conta financeira não encontrada ou inativa.');
  }
  if (!account.bankIntegrationId) {
    throw new Error('Conta financeira sem integração bancária vinculada.');
  }
  const provider = asProvider(account.provider);
  if (!provider) {
    throw new Error(
      `Provider ${account.provider || 'desconhecido'} ainda não possui resolução de credenciais por conta.`,
    );
  }

  if (provider === 'C6') {
    throw new C6EmissionNotHomologatedError();
  }

  if (provider === 'INTER') {
    const secrets = await loadInterSecretsForServer(admin, companyId, {
      integrationId: account.bankIntegrationId,
      financialAccountId: account.id,
    });
    if (!secrets) {
      throw new Error('Credenciais Inter ausentes para esta conta financeira.');
    }
    return {
      provider: 'INTER',
      companyId,
      financialAccountId: account.id,
      integrationId: account.bankIntegrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };
  }

  const asaas = await loadAsaasApiKeyForFinancialAccount(
    admin,
    account.id,
    companyId,
    account.environment,
  );
  return {
    provider: 'ASAAS_COMPANY',
    companyId,
    financialAccountId: asaas.financialAccountId,
    integrationId: asaas.integrationId,
    environment: asaas.environment,
    apiKey: asaas.apiKey,
  };
}

export function assertSecretsDoNotCrossAccounts(
  secrets: Pick<FinancialAccountSecrets, 'financialAccountId' | 'integrationId'>,
  expectedFinancialAccountId: string,
  expectedIntegrationId?: string | null,
): void {
  if (secrets.financialAccountId !== expectedFinancialAccountId) {
    throw new Error('Credenciais não correspondem à conta financeira da cobrança.');
  }
  if (expectedIntegrationId && secrets.integrationId !== expectedIntegrationId) {
    throw new Error('Credenciais não correspondem à integração da cobrança.');
  }
}
