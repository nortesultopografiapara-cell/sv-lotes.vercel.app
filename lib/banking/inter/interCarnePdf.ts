/**
 * Carnê Inter: capa SV LOTES + PDFs oficiais compactados (até 3 por A4).
 * Não reconstrói boleto. Escala contain/fit — sem stretch.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { buildSaleCarnePartialNotice } from '@/lib/finance/saleChargesShared';
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
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);
  const cover = out.addPage(SALE_CARNE_PAGE_SIZE_PT);
  const { height } = cover.getSize();
  let y = height - 56;

  const draw = (text: string, size = 11, bold = false) => {
    cover.drawText(text.slice(0, 110), {
      x: 48,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.12, 0.14, 0.18),
    });
    y -= size + 8;
  };

  draw('Carnê de cobranças — Banco Inter', 16, true);
  draw(params.customerName || 'Cliente', 12, true);
  if (params.projectName) draw(params.projectName);
  if (params.lotLabel) draw(params.lotLabel);
  const notice =
    buildSaleCarnePartialNotice(params.emittedCount, params.totalParcels) ||
    `${params.emittedCount} de ${params.totalParcels} parcelas com cobrança emitida.`;
  draw(notice, 10);
  y -= 6;
  draw('Cobranças incluídas (PDF oficial Inter, até 3 por folha):', 11, true);

  for (const item of params.items) {
    const due = String(item.charge.dueDate || '').slice(0, 10);
    const valor = formatCurrencyBRL(Number(item.charge.value) || 0);
    const linha = String(item.charge.bankSlipIdentification || '').trim();
    draw(`${item.parcelLabel}  ·  venc. ${due || '—'}  ·  ${valor}`, 10, true);
    if (linha) draw(`Linha: ${linha}`, 8);
    if (item.officialPdf?.length) draw('Boleto oficial Inter nas folhas seguintes.', 8);
    else draw('PDF oficial ainda não disponível nesta cobrança.', 8);
    y -= 4;
    if (y < 80) break;
  }

  const officialItems = params.items.filter((item) => item.officialPdf && item.officialPdf.length >= 8);
  let includedOfficialPdfs = 0;
  let skippedWithoutPdf = params.items.length - officialItems.length;
  let boletoPage: ReturnType<PDFDocument['addPage']> | null = null;

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
  const coverPages = 1;
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
  return saleCarneDocumentPageCount({ coverPages: 1, boletoCount: officialBoletoCount });
}
