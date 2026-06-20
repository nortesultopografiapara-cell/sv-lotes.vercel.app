/**
 * Multa e juros padrão para cobranças SaaS (Asaas).
 * Valores alinhados à configuração operacional: 2% multa + 0,033% juros/dia.
 */

/** Multa por atraso (% sobre o valor da cobrança). */
export const DEFAULT_FINE_PERCENT = 2;

/** Juros diário (% ao dia — enviado ao Asaas conforme padrão da conta). */
export const DEFAULT_INTEREST_PERCENT = 0.033;

export type AsaasFinePayload = {
  value: number;
  type: 'PERCENTAGE';
};

export type AsaasInterestPayload = {
  value: number;
};

export function resolveSaasLateFeePercents(input?: {
  finePercent?: number | null;
  interestPercent?: number | null;
}): { finePercent: number; interestPercent: number } {
  const fine = Number(input?.finePercent);
  const interest = Number(input?.interestPercent);
  return {
    finePercent: Number.isFinite(fine) && fine > 0 ? fine : DEFAULT_FINE_PERCENT,
    interestPercent:
      Number.isFinite(interest) && interest > 0 ? interest : DEFAULT_INTEREST_PERCENT,
  };
}

export function buildAsaasFinePayload(finePercent = DEFAULT_FINE_PERCENT): AsaasFinePayload {
  return { value: finePercent, type: 'PERCENTAGE' };
}

export function buildAsaasInterestPayload(
  interestPercent = DEFAULT_INTEREST_PERCENT,
): AsaasInterestPayload {
  return { value: interestPercent };
}

/** Status internos elegíveis para aplicar/atualizar multa e juros. */
export function isSaasChargeEligibleForLateFeeUpdate(status: string | null | undefined): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'OVERDUE';
}

/** Status Asaas que não devem receber multa/juros. */
export function isAsaasPaymentBlockedForLateFeeUpdate(
  asaasStatus: string | null | undefined,
): boolean {
  const key = String(asaasStatus || '').toUpperCase();
  return [
    'RECEIVED',
    'CONFIRMED',
    'RECEIVED_IN_CASH',
    'REFUNDED',
    'CANCELED',
    'CANCELLED',
    'DELETED',
  ].includes(key);
}

export function isAsaasPaymentEligibleForLateFeeUpdate(
  asaasStatus: string | null | undefined,
): boolean {
  if (isAsaasPaymentBlockedForLateFeeUpdate(asaasStatus)) return false;
  const key = String(asaasStatus || '').toUpperCase();
  return key === 'PENDING' || key === 'OVERDUE' || !key;
}

export function hasAsaasLateFeesConfigured(payment: {
  fine?: { value?: number | null } | null;
  interest?: { value?: number | null } | null;
}): boolean {
  const fine = Number(payment.fine?.value ?? 0);
  const interest = Number(payment.interest?.value ?? 0);
  return fine > 0 && interest > 0;
}

/** Cobrança aberta na UI Master (pendente ou vencida). */
export function isSaasChargeOpenForLateFeeDisplay(
  status: string | null | undefined,
): boolean {
  const key = String(status || '').toUpperCase();
  return (
    key === 'PENDING' ||
    key === 'OVERDUE' ||
    key === 'GERADA' ||
    key === 'ENVIADA' ||
    key === 'VISUALIZADA' ||
    key === 'VENCIDA' ||
    key === 'PENDENTE'
  );
}

export function formatSaasLateFeeFineLabel(finePercent?: number | null): string {
  const value = resolveSaasLateFeePercents({ finePercent }).finePercent;
  return `Multa: ${value}%`;
}

export function formatSaasLateFeeInterestLabel(interestPercent?: number | null): string {
  const value = resolveSaasLateFeePercents({ interestPercent }).interestPercent;
  return `Juros: ${value}% ao dia`;
}
