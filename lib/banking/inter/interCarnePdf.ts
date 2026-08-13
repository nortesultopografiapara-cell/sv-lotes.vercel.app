/**
 * Carnê Inter: somente PDFs oficiais compactados (até 3 por A4).
 * Sem capa/resumo — a capa permanece na aba “Capa do Carnê”.
 * Não reconstrói boleto. Escala contain/fit — sem stretch.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  SALE_CARNE_MARGIN_MM,
  SALE_CARNE_PAGE_SIZE_PT,
  SALE_CARNE_PAGE_W_MM,
  containFitRect,
  mmToPt,
  saleCarneBoletoSheetCount,
  saleCarneDocumentPageCount,
  saleCarneNeedsNewPage,
  saleCarneSlotIndex,
  saleCarneSlotInnerBoxPt,
} from '@/lib/finance/saleCarneSlotLayout';

export type InterCarneItem = {
  charge: CompanyAsaasChargeResponse;
  parcelLabel: string;
  officialPdf?: Uint8Array | null;
};

export type InterCarnePdfResult = {
  bytes: Uint8Array;
  includedOfficialPdfs: number;
  skippedWithoutPdf: number;
  pageCount: number;
  boletoSheetCount: number;
  coverPages: number;
};

export async function buildInterCarnePdfBytes(params: {
  items: InterCarneItem[];
  emittedCount: number;
  totalParcels: number;
  customerName?: string | null;
  projectName?: string | null;
  lotLabel?: string | null;
}): Promise<InterCarnePdfResult> {
  const out = await PDFDocument.create();
  const officialItems = params.items.filter((item) => item.officialPdf && item.officialPdf.length >= 8);
  let includedOfficialPdfs = 0;
  let skippedWithoutPdf = params.items.length - officialItems.length;
  let boletoPage: ReturnType<PDFDocument['addPage']> | null = null;
  let font: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;

  for (const item of officialItems) {
    try {
      const src = await PDFDocument.load(item.officialPdf as Uint8Array);
      const srcPages = src.getPages();
      if (srcPages.length === 0) {
        skippedWithoutPdf += 1;
        continue;
      }
      const embedded = await out.embedPage(srcPages[0]);
      const srcW = embedded.width;
      const srcH = embedded.height;
      const placed = includedOfficialPdfs;

      if (placed === 0 || saleCarneNeedsNewPage(placed)) {
        boletoPage = out.addPage(SALE_CARNE_PAGE_SIZE_PT);
      }
      if (!boletoPage) continue;

      const slot = saleCarneSlotIndex(placed);
      const box = saleCarneSlotInnerBoxPt(slot);
      if (box.cutY != null) {
        const x0 = mmToPt(SALE_CARNE_MARGIN_MM);
        const x1 = mmToPt(SALE_CARNE_PAGE_W_MM) - x0;
        boletoPage.drawLine({
          start: { x: x0, y: box.cutY },
          end: { x: x1, y: box.cutY },
          thickness: 0.4,
          color: rgb(0.47, 0.47, 0.47),
          dashArray: [3.4, 3.4],
        });
        boletoPage.drawLine({
          start: { x: x0, y: box.cutY - 4 },
          end: { x: x0, y: box.cutY + 4 },
          thickness: 0.5,
          color: rgb(0.47, 0.47, 0.47),
        });
        boletoPage.drawLine({
          start: { x: x1, y: box.cutY - 4 },
          end: { x: x1, y: box.cutY + 4 },
          thickness: 0.5,
          color: rgb(0.47, 0.47, 0.47),
        });
        if (!font) font = await out.embedFont(StandardFonts.Helvetica);
        boletoPage.drawText('corte aqui', {
          x: mmToPt(SALE_CARNE_PAGE_W_MM) / 2 - 18,
          y: box.cutY + 2,
          size: 6,
          font,
          color: rgb(0.47, 0.47, 0.47),
        });
      }

      const fit = containFitRect(srcW, srcH, box.x, box.y, box.width, box.height);
      boletoPage.drawPage(embedded, {
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
      });
      includedOfficialPdfs += 1;
    } catch {
      skippedWithoutPdf += 1;
    }
  }

  const boletoSheetCount = saleCarneBoletoSheetCount(includedOfficialPdfs);
  const coverPages = 0;
  const bytes = await out.save();
  return {
    bytes,
    includedOfficialPdfs,
    skippedWithoutPdf,
    pageCount: out.getPageCount(),
    boletoSheetCount,
    coverPages,
  };
}

export function expectedInterCarnePageCount(officialBoletoCount: number): number {
  return saleCarneDocumentPageCount({ coverPages: 0, boletoCount: officialBoletoCount });
}
