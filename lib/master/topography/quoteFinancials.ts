/**
 * Cálculos financeiros de orçamento (BDI, totais, desconto).
 * Margem reservada para fase futura.
 */

export type QuoteItemCalcInput = {
  quantity: number;
  unit_value: number;
};

export type QuoteFinancialSummary = {
  totalWithoutBdi: number;
  bdiPercent: number;
  bdiAmount: number;
  totalWithBdi: number;
  discountPercent: number;
  discountValue: number;
  totalGeral: number;
  /** Placeholder — futura implementação */
  marginPercent: number | null;
  marginValue: number | null;
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

export function computeQuoteFinancials(
  items: QuoteItemCalcInput[],
  bdiPercent: number,
  discountPercent: number,
): QuoteFinancialSummary {
  const bdi = Number.isFinite(bdiPercent) ? Math.max(0, bdiPercent) : 0;
  const disc = Number.isFinite(discountPercent)
    ? Math.min(100, Math.max(0, discountPercent))
    : 0;

  let totalWithoutBdi = 0;
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const uv = Number(item.unit_value) || 0;
    totalWithoutBdi += qty * uv;
  }
  totalWithoutBdi = round2(totalWithoutBdi);
  const bdiAmount = round2(totalWithoutBdi * (bdi / 100));
  const totalWithBdi = round2(totalWithoutBdi + bdiAmount);
  const discountValue = round2(totalWithBdi * (disc / 100));
  const totalGeral = round2(totalWithBdi - discountValue);

  return {
    totalWithoutBdi,
    bdiPercent: bdi,
    bdiAmount,
    totalWithBdi,
    discountPercent: disc,
    discountValue,
    totalGeral,
    marginPercent: null,
    marginValue: null,
  };
}

export function stageSubtotal(
  items: QuoteItemCalcInput[],
  bdiPercent: number,
): number {
  return round2(
    items.reduce(
      (acc, item) =>
        acc + itemTotalWithBdi(Number(item.quantity) || 0, Number(item.unit_value) || 0, bdiPercent),
      0,
    ),
  );
}
