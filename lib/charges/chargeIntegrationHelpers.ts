import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import { isAsaasIntegrationVerified } from '@/lib/finance/asaasIntegrationUiHelpers';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  canGenerateAsaasCharge,
  isInstallmentPaidForCharges,
} from '@/lib/charges/chargeOperationsHelpers';
import type { FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';

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

export function countSelectedGeneratableCharges(params: {
  selectedIds: Iterable<string>;
  payments: FinanceReceiptRow[];
  chargesByInstallment: Record<string, CompanyAsaasChargeResponse>;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
}): number {
  let count = 0;
  for (const installmentId of params.selectedIds) {
    const row = params.payments.find((p) => String(p.id) === installmentId);
    if (!row) continue;
    if (
      canGenerateAsaasCharge({
        installmentPaid: isInstallmentPaidForCharges(row),
        integrationActive: params.integrationActive,
        companyAsaasEnabled: params.companyAsaasEnabled,
        ownerReadOnly: params.ownerReadOnly,
        charge: params.chargesByInstallment[installmentId] ?? null,
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
