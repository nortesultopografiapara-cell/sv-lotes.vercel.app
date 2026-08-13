/**
 * Carnê Inter: capa SV LOTES + PDFs oficiais do Banco Inter concatenados.
 * Não reconstrói boleto. Parcelas sem cobrança emitida não entram.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { buildSaleCarnePartialNotice } from '@/lib/finance/saleChargesShared';

export type InterCarneItem = {
  charge: CompanyAsaasChargeResponse;
  parcelLabel: string;
  officialPdf?: Uint8Array | null;
};

export async function buildInterCarnePdfBytes(params: {
  items: InterCarneItem[];
  emittedCount: number;
  totalParcels: number;
  customerName?: string | null;
  projectName?: string | null;
  lotLabel?: string | null;
}): Promise<{ bytes: Uint8Array; includedOfficialPdfs: number; skippedWithoutPdf: number }> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);
  const page = out.addPage([595.28, 841.89]);
  const { height } = page.getSize();
  let y = height - 56;

  const draw = (text: string, size = 11, bold = false) => {
    page.drawText(text.slice(0, 110), {
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
  draw('Cobranças incluídas (dados oficiais Inter):', 11, true);

  for (const item of params.items) {
    const due = String(item.charge.dueDate || '').slice(0, 10);
    const valor = formatCurrencyBRL(Number(item.charge.value) || 0);
    const linha = String(item.charge.bankSlipIdentification || '').trim();
    draw(`${item.parcelLabel}  ·  venc. ${due || '—'}  ·  ${valor}`, 10, true);
    if (linha) draw(`Linha: ${linha}`, 8);
    if (item.officialPdf?.length) draw('Boleto oficial Inter anexado nas páginas seguintes.', 8);
    else draw('PDF oficial ainda não disponível nesta cobrança.', 8);
    y -= 4;
    if (y < 80) break;
  }

  let includedOfficialPdfs = 0;
  let skippedWithoutPdf = 0;
  for (const item of params.items) {
    if (!item.officialPdf || item.officialPdf.length < 8) {
      skippedWithoutPdf += 1;
      continue;
    }
    try {
      const src = await PDFDocument.load(item.officialPdf);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((p) => out.addPage(p));
      includedOfficialPdfs += 1;
    } catch {
      skippedWithoutPdf += 1;
    }
  }

  const bytes = await out.save();
  return { bytes, includedOfficialPdfs, skippedWithoutPdf };
}
