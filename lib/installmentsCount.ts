/**
 * Limite de parcelamento de vendas (produto).
 * Fonte única — UI, validação, criação/edição e importação.
 */
export const MAX_SALE_INSTALLMENTS = 300;

/** Alias estável usado pelo combobox e helpers existentes. */
export const INSTALLMENTS_MAX = MAX_SALE_INSTALLMENTS;
export const INSTALLMENTS_MIN = 1;

export function sanitizeInstallmentsInput(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export type InstallmentsValidationResult =
  | { valid: true; value: number }
  | { valid: false; message: string };

export function validateInstallmentsCount(raw: string): InstallmentsValidationResult {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { valid: false, message: 'Informe a quantidade de parcelas.' };
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { valid: false, message: 'Informe a quantidade de parcelas.' };
  }
  if (num < INSTALLMENTS_MIN) {
    return { valid: false, message: 'Quantidade mínima: 1 parcela.' };
  }
  if (num > INSTALLMENTS_MAX) {
    return {
      valid: false,
      message: `Quantidade máxima: ${INSTALLMENTS_MAX} parcelas.`,
    };
  }

  return { valid: true, value: num };
}

export function buildInstallmentsOptions(): string[] {
  return Array.from({ length: INSTALLMENTS_MAX }, (_, index) => String(index + 1));
}

export function filterInstallmentsOptions(
  query: string,
  options: string[] = buildInstallmentsOptions(),
): string[] {
  const digits = sanitizeInstallmentsInput(query);
  if (!digits) return options;
  return options.filter((option) => option.startsWith(digits));
}

export function parseValidatedInstallmentsCount(raw: string): number {
  const result = validateInstallmentsCount(raw);
  if (!result.valid) {
    throw new Error(result.message);
  }
  return result.value;
}
