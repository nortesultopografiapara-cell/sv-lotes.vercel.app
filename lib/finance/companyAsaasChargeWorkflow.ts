import type {
  CompanyAsaasChargeResponse,
  CompanyAsaasChargeStatus,
} from './companyAsaasChargeTypes';

export const ACTIVE_COMPANY_ASAAS_CHARGE_STATUSES = [
  'PENDING',
  'REGISTERED',
  'OVERDUE',
] as const satisfies readonly CompanyAsaasChargeStatus[];

export const REGENERATABLE_COMPANY_ASAAS_CHARGE_STATUSES = [
  'CANCELLED',
  'EXPIRED',
  'FAILED',
] as const satisfies readonly CompanyAsaasChargeStatus[];

export type CompanyAsaasChargeSummary = {
  totalCharges: number;
  pendingCount: number;
  openValue: number;
};

export type CompanyAsaasChargeWorkflowState =
  | 'none'
  | 'active'
  | 'paid'
  | 'cancelled'
  | 'terminal';

export function isActiveCompanyAsaasChargeStatus(status: CompanyAsaasChargeStatus): boolean {
  return (ACTIVE_COMPANY_ASAAS_CHARGE_STATUSES as readonly string[]).includes(status);
}

export function isRegeneratableCompanyAsaasChargeStatus(status: CompanyAsaasChargeStatus): boolean {
  return (REGENERATABLE_COMPANY_ASAAS_CHARGE_STATUSES as readonly string[]).includes(status);
}

export function resolveCompanyAsaasChargeWorkflowState(
  charge: CompanyAsaasChargeResponse | null | undefined,
): CompanyAsaasChargeWorkflowState {
  if (!charge) return 'none';
  if (charge.status === 'PAID') return 'paid';
  if (isActiveCompanyAsaasChargeStatus(charge.status)) return 'active';
  if (isRegeneratableCompanyAsaasChargeStatus(charge.status)) return 'cancelled';
  return 'terminal';
}

export function assertCanCreateCompanyAsaasCharge(
  charge: CompanyAsaasChargeResponse | null | undefined,
): CompanyAsaasChargeResponse | null {
  if (!charge) return null;
  if (charge.status === 'PAID') {
    throw new Error('Esta parcela já foi paga.');
  }
  if (isActiveCompanyAsaasChargeStatus(charge.status)) {
    return charge;
  }
  return null;
}

export function assertCanRegenerateCompanyAsaasCharge(
  charge: CompanyAsaasChargeResponse | null | undefined,
): void {
  if (!charge) {
    throw new Error('Nenhuma cobrança Asaas para regenerar.');
  }
  if (charge.status === 'PAID') {
    throw new Error('Esta parcela já foi paga.');
  }
}

export function resolveCompanyAsaasPaymentLink(charge: CompanyAsaasChargeResponse): string {
  return charge.paymentLink || charge.invoiceUrl || charge.bankSlipUrl || '';
}

export function resolveCompanyAsaasBoletoUrl(charge: CompanyAsaasChargeResponse): string {
  return charge.bankSlipUrl || charge.invoiceUrl || charge.paymentLink || '';
}

export function formatCompanyAsaasChargeStatusLabel(status: CompanyAsaasChargeStatus): string {
  const labels: Record<CompanyAsaasChargeStatus, string> = {
    PENDING: 'Pendente',
    REGISTERED: 'Registrada',
    PAID: 'Paga',
    CANCELLED: 'Cancelada',
    EXPIRED: 'Expirada',
    FAILED: 'Falhou',
    OVERDUE: 'Vencida',
  };
  return labels[status] || status;
}

export function summarizeCompanyAsaasCharges(
  charges: CompanyAsaasChargeResponse[],
): CompanyAsaasChargeSummary {
  const pending = charges.filter((charge) => isActiveCompanyAsaasChargeStatus(charge.status));
  return {
    totalCharges: charges.length,
    pendingCount: pending.length,
    openValue: pending.reduce((sum, charge) => sum + Number(charge.value || 0), 0),
  };
}
