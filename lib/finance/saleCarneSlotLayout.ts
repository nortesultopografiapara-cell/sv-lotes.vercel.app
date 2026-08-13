/**
 * Paginação compartilhada do carnê: até 3 boletos por folha A4.
 * Geometria idêntica à usada pelo carnê Asaas (mm). Inter apenas posiciona
 * o PDF oficial no slot — não redesenha boleto.
 */

export const SALE_CARNE_SLOTS_PER_PAGE = 3;
export const SALE_CARNE_PAGE_W_MM = 210;
export const SALE_CARNE_PAGE_H_MM = 297;
export const SALE_CARNE_MARGIN_MM = 6;
export const SALE_CARNE_SLOT_H_MM =
  (SALE_CARNE_PAGE_H_MM - SALE_CARNE_MARGIN_MM * 2) / SALE_CARNE_SLOTS_PER_PAGE;
export const SALE_CARNE_SLOT_PAD_MM = 1.2;

const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export const SALE_CARNE_PAGE_SIZE_PT: [number, number] = [
  mmToPt(SALE_CARNE_PAGE_W_MM),
  mmToPt(SALE_CARNE_PAGE_H_MM),
];

export function saleCarneSlotIndex(itemIndex: number): number {
  return ((Math.max(0, Math.floor(itemIndex)) % SALE_CARNE_SLOTS_PER_PAGE) +
    SALE_CARNE_SLOTS_PER_PAGE) %
    SALE_CARNE_SLOTS_PER_PAGE;
}

export function saleCarneNeedsNewPage(itemIndex: number): boolean {
  return itemIndex > 0 && itemIndex % SALE_CARNE_SLOTS_PER_PAGE === 0;
}

/** Folhas de boletos (sem capa). 0 itens → 0 folhas. */
export function saleCarneBoletoSheetCount(boletoCount: number): number {
  const n = Math.max(0, Math.floor(Number(boletoCount) || 0));
  if (n === 0) return 0;
  return Math.ceil(n / SALE_CARNE_SLOTS_PER_PAGE);
}

/** Capa SV Lotes + folhas de boletos. */
export function saleCarneDocumentPageCount(params: {
  coverPages?: number;
  boletoCount: number;
}): number {
  const cover = Math.max(0, Math.floor(Number(params.coverPages ?? 0) || 0));
  return cover + saleCarneBoletoSheetCount(params.boletoCount);
}

export type ContainFitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

/** Encaixa src no box sem distorcer (contain). Origem bottom-left (pdf-lib). */
export function containFitRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): ContainFitRect {
  const sw = Math.max(1, Number(srcW) || 1);
  const sh = Math.max(1, Number(srcH) || 1);
  const bw = Math.max(1, Number(boxW) || 1);
  const bh = Math.max(1, Number(boxH) || 1);
  const scale = Math.min(bw / sw, bh / sh);
  const width = sw * scale;
  const height = sh * scale;
  return {
    x: boxX + (bw - width) / 2,
    y: boxY + (bh - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * Slot 0 = topo da folha. Coordenadas pdf-lib (y = base do retângulo interno).
 */
export function saleCarneSlotInnerBoxPt(slotIndex: number): {
  x: number;
  y: number;
  width: number;
  height: number;
  cutY: number | null;
} {
  const slot = saleCarneSlotIndex(slotIndex);
  const pageH = SALE_CARNE_PAGE_SIZE_PT[1];
  const margin = mmToPt(SALE_CARNE_MARGIN_MM);
  const slotH = mmToPt(SALE_CARNE_SLOT_H_MM);
  const pad = mmToPt(SALE_CARNE_SLOT_PAD_MM);
  const topFromTop = margin + slot * slotH;
  const yTop = pageH - topFromTop;
  const yBottom = yTop - slotH;
  const cutY = slot > 0 ? yTop : null;
  return {
    x: margin + pad,
    y: yBottom + pad,
    width: SALE_CARNE_PAGE_SIZE_PT[0] - margin * 2 - pad * 2,
    height: slotH - pad * 2,
    cutY,
  };
}
