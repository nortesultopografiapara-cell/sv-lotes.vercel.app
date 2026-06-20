/**
 * Interface desacoplada de providers de pagamento SaaS (PIX / Boleto).
 */

import type { SaasMasterBillingType } from '@/lib/saasMasterConfig';

export type SaasChargeProviderStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type CreatePixChargeInput = {
  companyId: string;
  chargeId: string;
  amount: number;
  dueDate: string;
  description: string;
  payerName?: string;
  payerDocument?: string;
  payerEmail?: string;
  /** Default PIX — Asaas não combina PIX+BOLETO no mesmo payment. */
  billingType?: SaasMasterBillingType;
};

export type PixChargeProviderResult = {
  paymentId: string;
  pixQrCode: string;
  pixCopyPaste: string;
  paymentUrl?: string | null;
  status: SaasChargeProviderStatus;
  provider: string;
  billingType?: SaasMasterBillingType;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  bankSlipIdentification?: string | null;
};

export type ChargeStatusProviderResult = {
  paymentId: string;
  status: SaasChargeProviderStatus;
  paidAt?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
};

/** Resultado estruturado do DELETE /payments/{id} no Asaas. */
export type PaymentDeleteResult = {
  ok: boolean;
  httpStatus: number;
  blocking: boolean;
  status: 'deleted' | 'not_found' | 'skipped' | 'blocked' | 'error';
  message?: string;
};

export interface PaymentProvider {
  readonly providerName: string;
  createPixCharge(input: CreatePixChargeInput): Promise<PixChargeProviderResult>;
  getChargeStatus(paymentId: string): Promise<ChargeStatusProviderResult>;
  cancelCharge(paymentId: string): Promise<void>;
  deleteCharge?(paymentId: string): Promise<PaymentDeleteResult>;
}

export function mapProviderStatusToChargeStatus(
  status: SaasChargeProviderStatus | string,
): 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' {
  const key = String(status || '').toUpperCase();
  if (key === 'PAID' || key === 'PAGO' || key === 'RECEIVED' || key === 'CONFIRMED') return 'PAID';
  if (key === 'OVERDUE' || key === 'VENCIDO') return 'OVERDUE';
  if (key === 'CANCELLED' || key === 'CANCELADO' || key === 'CANCELED' || key === 'DELETED' || key === 'REFUNDED') {
    return 'CANCELLED';
  }
  return 'PENDING';
}

export function normalizeSaasBillingType(value?: string | null): SaasMasterBillingType {
  return String(value || '').toUpperCase() === 'BOLETO' ? 'BOLETO' : 'PIX';
}
