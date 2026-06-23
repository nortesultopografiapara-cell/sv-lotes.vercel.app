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

export function normalizeInstallmentCorrectionType(
  raw: unknown,
): InstallmentCorrectionType {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '');
  if (value === 'IPCA') return 'IPCA';
  if (value === 'IGPM' || value === 'IGP-M') return 'IGPM';
  if (value === 'INCC') return 'INCC';
  return DEFAULT_INSTALLMENT_CORRECTION_TYPE;
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
