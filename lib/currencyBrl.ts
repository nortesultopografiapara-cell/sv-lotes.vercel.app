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
