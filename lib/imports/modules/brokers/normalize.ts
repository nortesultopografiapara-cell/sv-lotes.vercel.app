/**
 * Normalização de campos — importação de corretores.
 */

export function normalizeBrokerEmail(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

export function parseBrokerCommissionPercent(raw: string): {
  value: number;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { value: 0 };

  const normalized = trimmed.replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    return { value: 0, error: 'Percentual de comissão inválido.' };
  }
  if (num < 0 || num > 100) {
    return { value: 0, error: 'Percentual de comissão deve estar entre 0 e 100.' };
  }
  return { value: num };
}

export function parseBrokerActiveFlag(raw: string): {
  value: boolean;
  warning?: string;
} {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) return { value: true };

  if (['sim', 'ativo', 'true', '1', 'yes', 's'].includes(normalized)) {
    return { value: true };
  }

  if (['nao', 'inativo', 'false', '0', 'no', 'n'].includes(normalized)) {
    return { value: false };
  }

  return {
    value: true,
    warning: `Valor de ativo não reconhecido ("${raw}") — assumido como ativo.`,
  };
}
