import { getCpfCnpjValidationState } from '@/lib/inputMasks';
import { todayIsoDate, toIsoDateOnly } from '@/lib/companySubscriptionDates';

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
