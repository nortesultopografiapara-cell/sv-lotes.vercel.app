import { getCpfCnpjValidationState } from '@/lib/inputMasks';
import { todayIsoDate, toIsoDateOnly } from '@/lib/companySubscriptionDates';
import {
  resolveEffectiveSaasPrice,
  type CompanyPricingSource,
  type SaasEffectivePriceDiagnostic,
  type SaasSubscriptionPriceSource,
} from '@/lib/companyPricing';
import { ASAAS_BOLETO_MIN_AMOUNT } from '@/lib/saasMasterConfig';

/** Valida CPF/CNPJ antes de enviar cobrança ao Asaas. */
export function validateCompanyDocumentForAsaas(
  companyName: string | null | undefined,
  document: string | null | undefined,
): string | null {
  const label = String(companyName || 'Empresa').trim() || 'Empresa';
  const state = getCpfCnpjValidationState(document);
  if (state.digitCount === 0) {
    return `${label}: CPF/CNPJ não informado. Cadastre o documento antes de gerar cobrança PIX.`;
  }
  if (state.tone === 'error') {
    return `${label}: CPF/CNPJ inválido (${state.message}). Corrija o cadastro da empresa.`;
  }
  return null;
}

/** Garante dueDate >= hoje para API Asaas (competência permanece na fatura). */
export function resolveAsaasDueDate(dueDate: string, today = todayIsoDate()): string {
  const due = toIsoDateOnly(dueDate) || today;
  if (due >= today) return due;
  return today;
}

/** Vencimento escolhido no Master prevalece sobre due_date legado da fatura. */
export function resolveSaasChargeDueDate(
  requestedDueDate: string | null | undefined,
  fallbackDueDate: string,
  today = todayIsoDate(),
): string {
  const source = requestedDueDate
    ? toIsoDateOnly(requestedDueDate)
    : toIsoDateOnly(fallbackDueDate);
  return resolveAsaasDueDate(source || fallbackDueDate, today);
}

export class SaasBoletoMinimumError extends Error {
  readonly pricingDiagnostic: SaasEffectivePriceDiagnostic;

  constructor(
    amount: number,
    diagnostic: SaasEffectivePriceDiagnostic,
  ) {
    super(
      `O valor mínimo para cobrança via Boleto Bancário é R$ ${ASAAS_BOLETO_MIN_AMOUNT.toFixed(2).replace('.', ',')}. Valor efetivo: R$ ${amount.toFixed(2).replace('.', ',')}.`,
    );
    this.name = 'SaasBoletoMinimumError';
    this.pricingDiagnostic = diagnostic;
  }
}

export function buildSaasPriceDiagnostic(
  company: CompanyPricingSource & { id?: string },
  subscription?: SaasSubscriptionPriceSource | null,
  options?: { billingType?: string },
): SaasEffectivePriceDiagnostic {
  return resolveEffectiveSaasPrice(company, subscription, {
    companyId: company.id,
    billingType: options?.billingType,
  });
}

export function assertSaasBoletoMinimumAmount(
  amount: number,
  diagnostic: SaasEffectivePriceDiagnostic,
): void {
  if (amount >= ASAAS_BOLETO_MIN_AMOUNT) return;
  throw new SaasBoletoMinimumError(amount, {
    ...diagnostic,
    effective_amount: amount,
  });
}
