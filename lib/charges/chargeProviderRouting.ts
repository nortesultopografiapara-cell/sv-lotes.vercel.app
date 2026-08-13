/**
 * Roteamento de emissão na Central de Cobranças pela conta financeira.
 * Fonte de verdade: provider da bank_integrations vinculada à conta.
 */

import type { CompanyFinancialAccountResponse } from '@/lib/finance/companyFinancialAccountTypes';

export type ChargesEmitProvider = 'ASAAS_COMPANY' | 'INTER';

export function normalizeChargesEmitProvider(
  provider: string | null | undefined,
): ChargesEmitProvider {
  const p = String(provider || '').trim().toUpperCase();
  if (p === 'INTER') return 'INTER';
  return 'ASAAS_COMPANY';
}

export function resolveChargesEmitProviderForAccount(
  account: Pick<CompanyFinancialAccountResponse, 'provider'> | null | undefined,
): ChargesEmitProvider {
  return normalizeChargesEmitProvider(account?.provider);
}

export function resolveChargesEmitProviderByAccountId(
  financialAccountId: string | null | undefined,
  accountsById: Record<string, CompanyFinancialAccountResponse>,
): ChargesEmitProvider {
  const id = String(financialAccountId || '').trim();
  if (!id) return 'ASAAS_COMPANY';
  return resolveChargesEmitProviderForAccount(accountsById[id] || null);
}

export const INTER_PROVIDER_BLOCKED_ON_ASAAS_MESSAGE =
  'Esta parcela está vinculada a uma conta financeira Banco Inter. Use a emissão Inter (Cobrança V3), não o Asaas.';

/** Cobrança só conta como gerada com id local + identificador externo persistido. */
export function isConfirmedPersistedProviderCharge(charge: {
  id?: string | null;
  asaasPaymentId?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!charge) return false;
  const id = String(charge.id || '').trim();
  const externalId = String(charge.asaasPaymentId || '').trim();
  if (!id || !externalId) return false;
  const status = String(charge.status || '').toUpperCase();
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') return false;
  return true;
}
