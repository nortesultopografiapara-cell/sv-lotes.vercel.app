/**
 * Planejamento de geração de cobranças faltantes (domínio).
 * Independente do provider (Asaas hoje; outros bancos no futuro).
 *
 * IMPORTANTE:
 * - Não limita parcelas do contrato (finance_receipts).
 * - Limita apenas quantas cobranças externas criar nesta ação.
 */

/** Tamanho do lote técnico por request HTTP (provider/timeout). */
export const SALE_CHARGES_GENERATE_BATCH_LIMIT = 5;

/**
 * Teto máximo de cobranças por ação do administrador.
 * Permite atalhos 3/6/12 e personalizado sem gerar 100 de uma vez.
 */
export const SALE_CHARGES_GENERATE_ACTION_MAX = 60;

/** Atalhos do modal. */
export const SALE_CHARGES_QUANTITY_PRESETS = [3, 6, 12] as const;

export type MissingChargeInstallmentPreview = {
  id: string;
  installmentNumber: number | null;
  dueDate: string | null;
  amount: number;
};

export type GenerateMissingChargesPlan = {
  /** Quantidade efetiva a tentar nesta ação. */
  quantity: number;
  /** Faltantes totais antes da ação. */
  missingTotal: number;
  /** Itens selecionados (ordem cronológica). */
  selected: MissingChargeInstallmentPreview[];
  first: MissingChargeInstallmentPreview | null;
  last: MissingChargeInstallmentPreview | null;
  periodStart: string | null;
  periodEnd: string | null;
  labelRange: string;
  periodLabel: string;
};

export function clampGenerateMissingChargesQuantity(
  requested: unknown,
  missingTotal: number,
  actionMax: number = SALE_CHARGES_GENERATE_ACTION_MAX,
): number {
  const missing = Math.max(0, Math.floor(Number(missingTotal) || 0));
  if (missing <= 0) return 0;
  const raw = Math.floor(Number(requested));
  if (!Number.isFinite(raw) || raw < 1) return 0;
  return Math.min(raw, missing, Math.max(1, actionMax));
}

/**
 * Monta o plano das próximas N cobranças a gerar.
 * `missingOrdered` deve estar em ordem de installment_number / cronológica.
 */
export function planGenerateMissingCharges(params: {
  missingOrdered: MissingChargeInstallmentPreview[];
  quantityRequested: unknown;
  actionMax?: number;
}): GenerateMissingChargesPlan {
  const missingTotal = params.missingOrdered.length;
  const quantity = clampGenerateMissingChargesQuantity(
    params.quantityRequested,
    missingTotal,
    params.actionMax ?? SALE_CHARGES_GENERATE_ACTION_MAX,
  );
  const selected = params.missingOrdered.slice(0, quantity);
  const first = selected[0] || null;
  const last = selected[selected.length - 1] || null;
  const periodStart = first?.dueDate || null;
  const periodEnd = last?.dueDate || null;

  const fmtNum = (n: number | null | undefined) =>
    n == null || !Number.isFinite(n)
      ? '—'
      : String(Math.trunc(n)).padStart(2, '0');

  const labelRange =
    quantity <= 0
      ? 'Nenhuma parcela selecionada'
      : quantity === 1
        ? `Será gerada a parcela ${fmtNum(first?.installmentNumber)}`
        : `Serão geradas as parcelas ${fmtNum(first?.installmentNumber)} a ${fmtNum(last?.installmentNumber)}`;

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const [y, m, day] = d.slice(0, 10).split('-');
    if (!y || !m || !day) return d;
    return `${day}/${m}/${y}`;
  };

  const periodLabel =
    quantity <= 0
      ? ''
      : periodStart && periodEnd && periodStart !== periodEnd
        ? `Período: ${fmtDate(periodStart)} a ${fmtDate(periodEnd)}`
        : `Vencimento: ${fmtDate(periodStart || periodEnd)}`;

  return {
    quantity,
    missingTotal,
    selected,
    first,
    last,
    periodStart,
    periodEnd,
    labelRange,
    periodLabel,
  };
}

/**
 * Divide a quantidade da ação em lotes técnicos (ex.: 12 → 5+5+2).
 */
export function splitGenerateMissingChargesBatches(
  quantity: number,
  batchLimit: number = SALE_CHARGES_GENERATE_BATCH_LIMIT,
): number[] {
  const total = Math.max(0, Math.floor(quantity));
  const size = Math.max(1, Math.floor(batchLimit));
  if (total <= 0) return [];
  const batches: number[] = [];
  let left = total;
  while (left > 0) {
    const n = Math.min(size, left);
    batches.push(n);
    left -= n;
  }
  return batches;
}

export function saleHasMonetaryCorrection(correctionType: string | null | undefined): boolean {
  const t = String(correctionType || '')
    .trim()
    .toUpperCase();
  return Boolean(t) && t !== 'FIXED' && t !== 'NONE' && t !== 'SEM_CORRECAO';
}

export const SALE_CHARGES_CORRECTION_WARNING =
  'Esta venda possui correção monetária. Cobranças futuras podem sofrer reajuste. Recomenda-se gerar apenas o período próximo.';
