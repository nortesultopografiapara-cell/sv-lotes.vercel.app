import type { SupabaseClient } from '@supabase/supabase-js';
import { asaasCompanyFetchOwnWalletId } from '@/lib/finance/asaasCompanyClient';
import {
  ASAAS_WALLET_MISSING_API_KEY_MESSAGE,
  assertAsaasApiKeyMatchesEnvironment,
  maskAsaasWalletId,
  sanitizeAsaasPublicError,
} from '@/lib/finance/asaasWalletId';
import { loadAsaasApiKeyForFinancialAccount } from '@/lib/finance/companyFinancialAccountRepository';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import { RevenueSplitError, type FinancialAccountProviderDestination, type RevenueSplitActor } from './types';
import { assertCanManageRevenueSplit } from './permissions';

export function canResolveAsaasWallet(role?: string | null): boolean {
  return isTenantEnterpriseAdminRole(role) || isPlatformAdmin(role);
}

export type ResolvedAsaasWalletView = {
  ok: true;
  environment: 'SANDBOX' | 'PRODUCTION';
  walletLinked: true;
  walletMasked: string;
  destination: {
    id: string;
    financialAccountId: string;
    provider: string;
    destinationType: string;
    status: string;
  };
};

export async function resolveAsaasWalletForFinancialAccount(input: {
  admin: SupabaseClient;
  actor: RevenueSplitActor;
  companyId: string;
  financialAccountId: string;
  upsertDestination: (params: {
    actor: RevenueSplitActor;
    companyId: string;
    financialAccountId: string;
    walletId: string;
  }) => Promise<FinancialAccountProviderDestination>;
  loadApiKey?: typeof loadAsaasApiKeyForFinancialAccount;
  fetchWalletId?: typeof asaasCompanyFetchOwnWalletId;
}): Promise<ResolvedAsaasWalletView> {
  assertCanManageRevenueSplit(input.actor, input.companyId);
  if (!canResolveAsaasWallet(input.actor.role)) {
    throw new RevenueSplitError(
      'PERMISSION_DENIED',
      'Apenas administradores da empresa podem validar a carteira Asaas.',
    );
  }

  const accountId = String(input.financialAccountId || '').trim();
  if (!accountId) {
    throw new RevenueSplitError('FINANCIAL_ACCOUNT_NOT_FOUND', 'Conta financeira não encontrada.');
  }

  const loadApiKey = input.loadApiKey ?? loadAsaasApiKeyForFinancialAccount;
  let credentials: Awaited<ReturnType<typeof loadAsaasApiKeyForFinancialAccount>>;
  try {
    credentials = await loadApiKey(input.admin, accountId, input.companyId);
  } catch (err) {
    const message = sanitizeAsaasPublicError(err);
    if (message === ASAAS_WALLET_MISSING_API_KEY_MESSAGE) {
      throw new RevenueSplitError('ASAAS_API_KEY_MISSING', ASAAS_WALLET_MISSING_API_KEY_MESSAGE);
    }
    throw new RevenueSplitError('ASAAS_API_KEY_INVALID', message);
  }

  try {
    assertAsaasApiKeyMatchesEnvironment(credentials.apiKey, credentials.environment);
  } catch (err) {
    throw new RevenueSplitError('ASAAS_ENVIRONMENT_MISMATCH', sanitizeAsaasPublicError(err));
  }

  const fetchWalletId = input.fetchWalletId ?? asaasCompanyFetchOwnWalletId;
  let walletId = '';
  try {
    walletId = await fetchWalletId(credentials.apiKey, credentials.environment);
  } catch (err) {
    throw new RevenueSplitError('ASAAS_WALLET_LOOKUP_FAILED', sanitizeAsaasPublicError(err));
  }

  const destination = await input.upsertDestination({
    actor: input.actor,
    companyId: input.companyId,
    financialAccountId: accountId,
    walletId,
  });

  return {
    ok: true,
    environment: credentials.environment,
    walletLinked: true,
    walletMasked: maskAsaasWalletId(walletId),
    destination: {
      id: destination.id,
      financialAccountId: destination.financialAccountId,
      provider: destination.provider,
      destinationType: destination.destinationType,
      status: destination.status,
    },
  };
}
