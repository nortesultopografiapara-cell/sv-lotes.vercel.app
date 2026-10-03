/**
 * Tipo de correção das parcelas — venda padrão (não Recanto Primavera).
 */

export type InstallmentCorrectionType = 'FIXED' | 'IPCA' | 'IGPM' | 'INCC';

export const DEFAULT_INSTALLMENT_CORRECTION_TYPE: InstallmentCorrectionType = 'FIXED';

export const INSTALLMENT_CORRECTION_OPTIONS: ReadonlyArray<{
  value: InstallmentCorrectionType;
  label: string;
}> = [
  { value: 'FIXED', label: 'Parcelas fixas' },
  { value: 'IPCA', label: 'IPCA' },
  { value: 'IGPM', label: 'IGP-M' },
  { value: 'INCC', label: 'INCC' },
] as const;

/** Interpreta o índice; vazio/desconhecido → null (não assume FIXED). */
export function parseInstallmentCorrectionType(
  raw: unknown,
): InstallmentCorrectionType | null {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');
  if (!value) return null;
  if (value === 'IPCA') return 'IPCA';
  if (value === 'IGPM' || value === 'IGPMFGV') return 'IGPM';
  if (value === 'INCC') return 'INCC';
  if (
    value === 'FIXED' ||
    value === 'NONE' ||
    value === 'FIXO' ||
    value === 'FIXAS' ||
    value === 'PARCELASFIXAS'
  ) {
    return 'FIXED';
  }
  return null;
}

export function normalizeInstallmentCorrectionType(
  raw: unknown,
): InstallmentCorrectionType {
  return parseInstallmentCorrectionType(raw) ?? DEFAULT_INSTALLMENT_CORRECTION_TYPE;
}

export function formatInstallmentCorrectionLabel(raw: unknown): string {
  const normalized = normalizeInstallmentCorrectionType(raw);
  return (
    INSTALLMENT_CORRECTION_OPTIONS.find((option) => option.value === normalized)?.label ??
    'Parcelas fixas'
  );
}

export function resolveSaleInstallmentCorrectionType(
  sale: Record<string, unknown>,
): InstallmentCorrectionType {
  return normalizeInstallmentCorrectionType(sale.installment_correction_type);
}
