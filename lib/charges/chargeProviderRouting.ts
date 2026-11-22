/**
 * Roteamento de emissão na Central de Cobranças pela conta financeira.
 * Fonte de verdade: provider da bank_integrations vinculada à conta.
 */

import { isC6ProviderCode, throwIfC6EmissionAttempt } from '@/lib/banking/c6/c6EmitGuard';
import type { CompanyFinancialAccountResponse } from '@/lib/finance/companyFinancialAccountTypes';

export { C6_EMIT_NOT_HOMOLOGATED_MESSAGE } from '@/lib/banking/c6/c6EmitGuard';

export type ChargesAccountClassification = ChargesEmitProvider | 'C6';

export function isC6ChargesAccount(provider: string | null | undefined): boolean {
  return isC6ProviderCode(provider);
}

export function assertChargesAccountMayEmit(
  provider: string | null | undefined,
  companyId?: string | null,
): void {
  throwIfC6EmissionAttempt(provider, companyId);
}

export function classifyChargesAccountProvider(
  provider: string | null | undefined,
): ChargesAccountClassification {
  if (isC6ProviderCode(provider)) return 'C6';
  return normalizeChargesEmitProvider(provider);
}

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
