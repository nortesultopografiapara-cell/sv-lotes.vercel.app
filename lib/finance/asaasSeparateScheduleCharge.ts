/**
 * Autorização Asaas do sinal separado.
 * O Inter continua na trava antiga. Venda sem grupo continua LEGACY.
 */

import {
  isRecantoSeparateSignalAllowed,
  type RecantoSeparateSignalEnv,
} from '@/lib/recantoSeparateSignalRuntime';
import {
  readReceiptScheduleGroup,
  SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE,
} from '@/lib/finance/recantoReceiptSchedule';
import { formatFinanceParcelLabel, countFutureSignalInstallments } from '@/lib/finance/separateScheduleParcelLabel';
import { formatSaleCarneParcelLabel } from '@/lib/finance/saleChargesShared';

export function asaasSeparateScheduleChargeAllowed(input: {
  scheduleGroup?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  env?: RecantoSeparateSignalEnv;
}): boolean {
  if (readReceiptScheduleGroup({ schedule_group: input.scheduleGroup }) === 'LEGACY') return true;
  return isRecantoSeparateSignalAllowed(input.companyId, input.projectId, input.env);
}

export function assertAsaasSeparateScheduleChargeAllowed(input: {
  scheduleGroup?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  env?: RecantoSeparateSignalEnv;
}): void {
  if (!asaasSeparateScheduleChargeAllowed(input)) {
    throw new Error(SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE);
  }
}

export function buildAsaasInstallmentChargeDescription(input: {
  scheduleGroup?: string | null;
  installmentNumber?: number | string | null;
  contractNumber?: string | null;
  lotInstallmentCount?: number | null;
  signalFutureCount?: number | null;
}): string {
  const label = formatFinanceParcelLabel({
    scheduleGroup: input.scheduleGroup,
    installmentNumber: input.installmentNumber,
    lotInstallmentCount: input.lotInstallmentCount,
    signalFutureCount: input.signalFutureCount,
  });
  const contractNo = String(input.contractNumber || '').trim() || 'S/N';
  return `${label} — Contrato ${contractNo}`.slice(0, 500);
}

export function asaasCarneGroupRank(scheduleGroup?: string | null): number {
  const group = readReceiptScheduleGroup({ schedule_group: scheduleGroup });
  if (group === 'SIGNAL') return 0;
  if (group === 'LOT') return 1;
  return 2;
}

type CarneReceipt = {
  sale_id?: string | null;
  schedule_group?: string | null;
  installment_number?: number | null;
};

export function buildAsaasCarneParcelLabel(
  installment: CarneReceipt | null,
  installments: CarneReceipt[],
  contractTotal: number,
): string {
  if (!installment) return 'Parcela';
  const group = readReceiptScheduleGroup(installment);
  if (group === 'LEGACY') {
    return formatSaleCarneParcelLabel(installment.installment_number, contractTotal);
  }
  const saleId = String(installment.sale_id || '');
  const lotCount = installments.filter((row) => {
    if (saleId && String(row.sale_id || '') !== saleId) return false;
    return readReceiptScheduleGroup(row) === 'LOT' && Number(row.installment_number) > 0;
  }).length;
  return formatFinanceParcelLabel({
    scheduleGroup: group,
    installmentNumber: installment.installment_number,
    lotInstallmentCount: lotCount || null,
    signalFutureCount: countFutureSignalInstallments(
      installments.map((row) => ({
        saleId: row.sale_id,
        scheduleGroup: row.schedule_group,
        installmentNumber: row.installment_number,
      })),
      saleId,
    ),
  });
}

export function compareAsaasCarneInstallments(
  a: CarneReceipt | null,
  b: CarneReceipt | null,
): number {
  const rank = asaasCarneGroupRank(a?.schedule_group) - asaasCarneGroupRank(b?.schedule_group);
  if (rank !== 0) return rank;
  return Number(a?.installment_number ?? 9999) - Number(b?.installment_number ?? 9999);
}
