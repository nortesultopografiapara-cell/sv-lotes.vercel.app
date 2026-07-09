/**
 * Multa e juros padrão — cobranças Asaas Company (parcelas de compradores).
 * Multa: 2% · Juros: 1% a.m. (PERCENTAGE no payload Asaas).
 */

import type { AsaasCompanyPayment } from '@/lib/finance/asaasCompanyClient';

export const COMPANY_ASAAS_FINE_PERCENT = 2;
export const COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY = 1;

export type CompanyAsaasFinePayload = {
  value: number;
  type: 'PERCENTAGE';
};

export type CompanyAsaasInterestPayload = {
  value: number;
  type: 'PERCENTAGE';
};

export function buildCompanyAsaasLateFeePayload(): {
  fine: CompanyAsaasFinePayload;
  interest: CompanyAsaasInterestPayload;
} {
  return {
    fine: { value: COMPANY_ASAAS_FINE_PERCENT, type: 'PERCENTAGE' },
    interest: { value: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY, type: 'PERCENTAGE' },
  };
}

export function extractCompanyAsaasBankSlipIdentification(
  payment: Pick<AsaasCompanyPayment, 'identificationField' | 'nossoNumero'>,
): string | null {
  const idField = String(payment.identificationField || '').trim();
  if (idField) return idField;
  const nosso = String(payment.nossoNumero || '').trim();
  return nosso || null;
}

/** PIX explícito permanece só PIX; demais fluxos usam boleto + pix (UNDEFINED no Asaas). */
export function resolveAsaasApiBillingType(
  requested: 'PIX' | 'BOLETO',
): 'PIX' | 'BOLETO' | 'UNDEFINED' {
  if (requested === 'PIX') return 'PIX';
  return 'UNDEFINED';
}

/** Tipo persistido em company_asaas_charges. */
export function resolveStoredCompanyBillingType(
  requested: 'PIX' | 'BOLETO',
  asaasBillingType?: string | null,
): 'PIX' | 'BOLETO' | 'UNDEFINED' {
  const asaas = String(asaasBillingType || '').trim().toUpperCase();
  if (asaas === 'PIX' || asaas === 'BOLETO' || asaas === 'UNDEFINED') {
    return asaas;
  }
  return requested === 'PIX' ? 'PIX' : 'UNDEFINED';
}

export function chargeSupportsBoleto(
  billingType: string | null | undefined,
): boolean {
  const key = String(billingType || '').toUpperCase();
  return key === 'BOLETO' || key === 'UNDEFINED';
}
