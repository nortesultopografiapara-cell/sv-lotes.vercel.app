/**
 * Preço persistido em blocks.price — manual sempre prevalece sobre cálculo por m².
 */

import { calculateLotPriceFromAreaM2 } from '@/lib/txtImportLotPricing';

export function hasSavedLotPrice(price: unknown): boolean {
  if (price == null || price === '') return false;
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
}

export function normalizeSavedLotPrice(price: unknown): number | null {
  if (!hasSavedLotPrice(price)) return null;
  return Math.round(Number(price) * 100) / 100;
}

/**
 * Retorna o preço exibido/persistido do lote.
 * Se blocks.price > 0, usa o valor salvo (manual ou importado).
 * Caso contrário, calcula área × preço/m² apenas como sugestão inicial.
 */
export function resolveLotBlockPrice(input: {
  price?: unknown;
  areaM2?: unknown;
  pricePerM2?: number | null;
}): number | null {
  const saved = normalizeSavedLotPrice(input.price);
  if (saved != null) return saved;

  const areaM2 = Number(input.areaM2);
  const pricePerM2 = input.pricePerM2;
  if (
    pricePerM2 != null &&
    Number.isFinite(pricePerM2) &&
    pricePerM2 > 0 &&
    Number.isFinite(areaM2) &&
    areaM2 > 0
  ) {
    return calculateLotPriceFromAreaM2(areaM2, pricePerM2);
  }

  return null;
}
