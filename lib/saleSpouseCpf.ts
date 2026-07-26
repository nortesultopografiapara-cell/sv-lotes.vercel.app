/**
 * Máscara CPF do cônjuge — mesma regra do comprador (formatCpfCnpj),
 * limitada a 11 dígitos (cônjuge é sempre pessoa física).
 */

import {
  formatCpfCnpj,
  getCpfCnpjValidationState,
  onlyDigits,
  type CpfCnpjValidationState,
} from '@/lib/inputMasks';

/** Digitação/colagem → máscara 000.000.000-00 (máx. 11 dígitos). */
export function formatSpouseCpf(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 11);
  return formatCpfCnpj(digits);
}

/** Persistência canônica: máscara completa quando há 11 dígitos; senão dígitos parciais. */
export function normalizeSpouseCpfForStorage(value?: string | null): string | null {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return null;
  if (digits.length === 11) return formatCpfCnpj(digits);
  return digits;
}

export function spouseCpfDigits(value?: string | null): string {
  return onlyDigits(value).slice(0, 11);
}

export function getSpouseCpfValidationState(
  value?: string | null,
): CpfCnpjValidationState {
  return getCpfCnpjValidationState(formatSpouseCpf(value));
}
