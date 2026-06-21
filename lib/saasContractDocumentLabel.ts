/**
 * Rótulo CPF / CNPJ / CPF/CNPJ para assinatura, certificado e PDF.
 */

import { contractPartyDigits } from '@/lib/saasContractParty';
import { formatContractPartyDocument } from '@/lib/saasContractParty';

export type SignerDocumentLabel = 'CPF' | 'CNPJ' | 'CPF/CNPJ';

/** Identifica rótulo pelo número de dígitos (11 = CPF, 14 = CNPJ). */
export function resolveSignerDocumentLabel(raw?: string | null): SignerDocumentLabel {
  const len = contractPartyDigits(raw).length;
  if (len === 11) return 'CPF';
  if (len === 14) return 'CNPJ';
  if (len > 0) return 'CPF/CNPJ';
  return 'CPF/CNPJ';
}

export function formatSignerDocumentDisplay(raw?: string | null): string {
  const digits = contractPartyDigits(raw);
  if (!digits) return '—';
  const formatted = formatContractPartyDocument(digits);
  return formatted || digits;
}

export function formatSignerDocumentLine(raw?: string | null): string {
  const label = resolveSignerDocumentLabel(raw);
  const value = formatSignerDocumentDisplay(raw);
  if (value === '—') return `${label}: —`;
  return `${label}: ${value}`;
}

export function formatSignerDocumentFieldLabel(raw?: string | null): string {
  return resolveSignerDocumentLabel(raw);
}
