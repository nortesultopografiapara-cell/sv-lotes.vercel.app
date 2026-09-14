import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import { isAsaasIntegrationVerified } from '@/lib/finance/asaasIntegrationUiHelpers';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  canGenerateAsaasCharge,
  isInstallmentPaidForCharges,
} from '@/lib/charges/chargeOperationsHelpers';
import type { FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';
import type { ChargesEmitProvider } from '@/lib/charges/chargeProviderRouting';

export type AsaasIntegrationLoadResult = {
  integration: AsaasIntegrationConfigResponse | null;
  ready: boolean;
};

export function resolveChargesIntegrationReady(
  integration: AsaasIntegrationConfigResponse | null | undefined,
  apiReadyFlag?: boolean | null,
): boolean {
  if (apiReadyFlag === true) return true;
  if (!integration) return false;
  return isAsaasIntegrationVerified(integration);
}

export function resolveAsaasSyncInstallmentIds(params: {
  rows: Array<{ id: unknown; financial_account_id?: string | null }>;
  chargesByInstallment: Record<
    string,
    { asaasPaymentId?: string | null; financialAccountId?: string | null } | null | undefined
  >;
  financialAccountFilter: string;
  resolveProvider?: (row: { id: unknown; financial_account_id?: string | null }) => ChargesEmitProvider;
}): string[] {
  const filter = String(params.financialAccountFilter || 'Todas as contas').trim();
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const row of params.rows) {
    const installmentId = String(row.id || '').trim();
    if (!installmentId || seen.has(installmentId)) continue;
    const provider = params.resolveProvider?.(row) ?? 'ASAAS_COMPANY';
    if (provider !== 'ASAAS_COMPANY') continue;
    const charge = params.chargesByInstallment[installmentId];
    if (!charge?.asaasPaymentId) continue;

    if (filter && filter !== 'Todas as contas') {
      const chargeAccountId = String(charge.financialAccountId || '').trim();
      const rowAccountId = String(row.financial_account_id || '').trim();
      if (chargeAccountId) {
        if (chargeAccountId !== filter) continue;
      } else if (rowAccountId !== filter) {
        continue;
      }
    }

    seen.add(installmentId);
    ids.push(installmentId);
  }

  return ids;
}

export function countSelectedGeneratableCharges(params: {
  selectedIds: Iterable<string>;
  payments: FinanceReceiptRow[];
  chargesByInstallment: Record<string, CompanyAsaasChargeResponse>;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  installmentsDataReady?: boolean;
  resolveProvider?: (row: FinanceReceiptRow) => ChargesEmitProvider;
}): number {
  let count = 0;
  for (const installmentId of params.selectedIds) {
    const row = params.payments.find((p) => String(p.id) === installmentId);
    if (!row) continue;
    const provider = params.resolveProvider?.(row) ?? 'ASAAS_COMPANY';
    const isInter = provider === 'INTER';
    if (
      canGenerateAsaasCharge({
        installmentPaid: isInstallmentPaidForCharges(row),
        integrationActive: isInter ? true : params.integrationActive,
        companyAsaasEnabled: isInter ? true : params.companyAsaasEnabled,
        ownerReadOnly: params.ownerReadOnly,
        charge: params.chargesByInstallment[installmentId] ?? null,
        installmentsDataReady: params.installmentsDataReady,
        installmentId,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

export function countSelectedWithAsaasCharge(
  selectedIds: Iterable<string>,
  chargesByInstallment: Record<string, CompanyAsaasChargeResponse>,
): number {
  let count = 0;
  for (const installmentId of selectedIds) {
    if (chargesByInstallment[installmentId]) count += 1;
  }
  return count;
}
