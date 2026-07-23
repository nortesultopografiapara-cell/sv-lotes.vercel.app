/**
 * Cálculos financeiros de orçamento (BDI, totais, desconto, margem).
 */

export type QuoteItemCalcInput = {
  quantity: number;
  /** Preço adotado (sem BDI) */
  unit_value: number;
  reference_price?: number;
};

export type QuoteFinancialSummary = {
  totalWithoutBdi: number;
  bdiPercent: number;
  bdiAmount: number;
  totalWithBdi: number;
  discountPercent: number;
  discountValue: number;
  totalGeral: number;
  marginPercent: number;
  marginValue: number;
  /** Soma dos preços referência × qtd (sem BDI) */
  totalReferenceWithoutBdi: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function itemUnitWithBdi(unitValue: number, bdiPercent: number): number {
  return round4(unitValue * (1 + bdiPercent / 100));
}

export function itemTotalWithBdi(
  quantity: number,
  unitValue: number,
  bdiPercent: number,
): number {
  return round2(quantity * itemUnitWithBdi(unitValue, bdiPercent));
}

export function itemTotalWithoutBdi(quantity: number, unitValue: number): number {
  return round2(quantity * unitValue);
}

export function priceDifferencePercent(reference: number, adopted: number): number {
  if (!Number.isFinite(reference) || reference <= 0) return 0;
  return round4(((adopted - reference) / reference) * 100);
}

export function priceDifferenceValue(reference: number, adopted: number): number {
  return round2(adopted - reference);
}

export function computeQuoteFinancials(
  items: QuoteItemCalcInput[],
  bdiPercent: number,
  discountPercent: number,
  marginPercent = 0,
): QuoteFinancialSummary {
  const bdi = Number.isFinite(bdiPercent) ? Math.max(0, bdiPercent) : 0;
  const disc = Number.isFinite(discountPercent)
    ? Math.min(100, Math.max(0, discountPercent))
    : 0;
  const margin = Number.isFinite(marginPercent) ? marginPercent : 0;

  let totalWithoutBdi = 0;
  let totalReferenceWithoutBdi = 0;
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const uv = Number(item.unit_value) || 0;
    const ref = Number(item.reference_price ?? uv) || 0;
    totalWithoutBdi += qty * uv;
    totalReferenceWithoutBdi += qty * ref;
  }
  totalWithoutBdi = round2(totalWithoutBdi);
  totalReferenceWithoutBdi = round2(totalReferenceWithoutBdi);
  const bdiAmount = round2(totalWithoutBdi * (bdi / 100));
  const totalWithBdi = round2(totalWithoutBdi + bdiAmount);
  const discountValue = round2(totalWithBdi * (disc / 100));
  const totalGeral = round2(totalWithBdi - discountValue);
  const marginValue = round2(totalGeral * (margin / 100));

  return {
    totalWithoutBdi,
    bdiPercent: bdi,
    bdiAmount,
    totalWithBdi,
    discountPercent: disc,
    discountValue,
    totalGeral,
    marginPercent: margin,
    marginValue,
    totalReferenceWithoutBdi,
  };
}

export function stageSubtotal(
  items: QuoteItemCalcInput[],
  bdiPercent: number,
): number {
  return round2(
    items.reduce(
      (acc, item) =>
        acc +
        itemTotalWithBdi(Number(item.quantity) || 0, Number(item.unit_value) || 0, bdiPercent),
      0,
    ),
  );
}

export function stagePercentOfBudget(stageSubtotalValue: number, totalWithBdi: number): number {
  if (!totalWithBdi || totalWithBdi <= 0) return 0;
  return round4((stageSubtotalValue / totalWithBdi) * 100);
}
