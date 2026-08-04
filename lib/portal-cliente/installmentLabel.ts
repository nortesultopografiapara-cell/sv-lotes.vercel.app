/**
 * Rótulos de parcela no Portal do Cliente (somente exibição).
 * Não altera números, valores, status nem persistência.
 */

export type ClientPortalInstallmentLabelInput = {
  installmentNumber?: number | string | null;
  type?: string | null;
  paymentType?: string | null;
  kind?: string | null;
  description?: string | null;
  label?: string | null;
};

/** Rótulos explícitos preservados (tipo / descrição financeira). */
const EXPLICIT_TYPE_LABELS: Record<string, string> = {
  ENTRY: 'Entrada',
  ENTRADA: 'Entrada',
  DOWN_PAYMENT: 'Entrada',
  DOWNPAYMENT: 'Entrada',
  SIGNAL: 'Sinal',
  SINAL: 'Sinal',
  BALLOON: 'Parcela balão',
  BALAO: 'Parcela balão',
  SINGLE: 'Pagamento único',
  PAGAMENTO_UNICO: 'Pagamento único',
  UNIQUE: 'Pagamento único',
  FEE: 'Taxa',
  TAXA: 'Taxa',
  RENEGOTIATION: 'Renegociação',
  RENEGOCIACAO: 'Renegociação',
};

function normalizeToken(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function parseInstallmentNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Descrições genéricas "Parcela N" podem ser recalculadas; demais são preservadas. */
function isGenericParcelaDescription(description: string): boolean {
  return /^parcela\s*\d+$/i.test(description.trim());
}

function resolveExplicitTypeLabel(
  input: ClientPortalInstallmentLabelInput,
): string | null {
  for (const raw of [input.type, input.paymentType, input.kind]) {
    const token = normalizeToken(String(raw || ''));
    if (token && EXPLICIT_TYPE_LABELS[token]) return EXPLICIT_TYPE_LABELS[token];
  }
  return null;
}

/**
 * Formata o nome da parcela para o Portal do Cliente.
 *
 * Prioridade:
 * 1. descrição/label explícita válida (não genérica "Parcela N");
 * 2. tipo financeiro explícito (ENTRY, SINAL, BALAO, …);
 * 3. número 0 → Entrada;
 * 4. número >= 1 → Parcela N;
 * 5. inválido/nulo → Cobrança (nunca "Parcela undefined").
 */
export function formatClientPortalInstallmentLabel(
  input: ClientPortalInstallmentLabelInput | number | string | null | undefined,
): string {
  const normalized: ClientPortalInstallmentLabelInput =
    input != null && typeof input === 'object'
      ? input
      : { installmentNumber: input as number | string | null | undefined };

  const explicitText = String(
    normalized.description || normalized.label || '',
  ).trim();
  if (explicitText && !isGenericParcelaDescription(explicitText)) {
    const fromTextType = EXPLICIT_TYPE_LABELS[normalizeToken(explicitText)];
    return fromTextType || explicitText;
  }

  const fromType = resolveExplicitTypeLabel(normalized);
  if (fromType) return fromType;

  const n = parseInstallmentNumber(normalized.installmentNumber);
  if (n === 0) return 'Entrada';
  if (n != null && n >= 1) return `Parcela ${n}`;
  return 'Cobrança';
}
