/**
 * Formatação e parse de moeda brasileira (BRL).
 */

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Exibe valor monetário em inputs read-only ou ao carregar dados numéricos crus. */
export function formatCurrencyFieldValue(
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return formatCurrencyBRL(value);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.includes('R$')) return trimmed;
  const parsed = parseCurrencyBRL(trimmed);
  return parsed != null ? formatCurrencyBRL(parsed) : trimmed;
}

/**
 * Máscara para digitação — padrão de reais inteiros (5000 → R$ 5.000,00).
 * Com vírgula, aceita centavos (1500,50 → R$ 1.500,50).
 */
export function maskCurrencyBRL(input: string): string {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return '';

  let cleaned = trimmed.replace(/[R$\s]/gi, '');
  if (!cleaned) return '';

  if (cleaned.includes(',')) {
    const commaIndex = cleaned.indexOf(',');
    const intPart = cleaned.slice(0, commaIndex).replace(/\D/g, '') || '0';
    const decPart = cleaned.slice(commaIndex + 1).replace(/\D/g, '').slice(0, 2);
    const numeric = Number(`${intPart}.${decPart.padEnd(2, '0')}`);
    if (!Number.isFinite(numeric) || numeric < 0) return '';
    return formatCurrencyBRL(numeric);
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  return formatCurrencyBRL(numeric);
}

/** Parse para cálculos — vazio/ inválido retorna 0. */
export function parseCurrencyBRLNumber(
  input: string | number | null | undefined,
): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return 0;
    return Math.round(input * 100) / 100;
  }
  return parseCurrencyBRL(input) ?? 0;
}

/** Número limpo para persistência (sem máscara). */
export function serializeCurrencyBRL(
  input: string | number | null | undefined,
): string {
  const n = parseCurrencyBRLNumber(input);
  return String(n);
}

/** Converte entrada do usuário para número decimal ou null se vazio/inválido. */
export function parseCurrencyBRL(
  input: string | number | null | undefined,
): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    if (input === 0) return null;
    return Math.round(input * 100) / 100;
  }

  const trimmed = String(input ?? '').trim();
  if (!trimmed) return null;

  let s = trimmed.replace(/[R$\s]/gi, '');
  if (!s) return null;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return null;
  return Math.round(n * 100) / 100;
}

/** Alias usado no GIS — mesma função que parseCurrencyBRL. */
export const parseCurrencyBR = parseCurrencyBRL;

/** Normaliza valores monetários em descrições de auditoria/histórico. */
export function formatLotAuditDescription(description: string | null | undefined): string {
  if (!description) return '';

  let text = description;

  text = text.replace(/R\$\s*([\d.,]+)/gi, (_match, raw: string) => {
    const parsed = parseCurrencyBRL(raw);
    return parsed != null ? formatCurrencyBRL(parsed) : `R$ ${raw}`;
  });

  text = text.replace(
    /([\d][\d.,]*)\s*→\s*([\d][\d.,]*)/g,
    (_match, from: string, to: string) => {
      const parsedFrom = parseCurrencyBRL(from);
      const parsedTo = parseCurrencyBRL(to);
      if (parsedFrom != null && parsedTo != null) {
        return `${formatCurrencyBRL(parsedFrom)} → ${formatCurrencyBRL(parsedTo)}`;
      }
      return `${from} → ${to}`;
    },
  );

  return text;
}
