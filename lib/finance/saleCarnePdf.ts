/**
 * Carnê PDF A4 — 3 boletos por folha — artefatos oficiais Asaas.
 */

import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { SaleChargeInstallmentRow, SaleChargesSummary } from '@/lib/finance/saleChargesShared';
import { digitableLineToBarcode44 } from '@/lib/finance/saleChargesShared';

export type SaleCarneBoletoItem = {
  charge: CompanyAsaasChargeResponse;
  installment: SaleChargeInstallmentRow | null;
  parcelLabel: string;
  totalParcels: number;
};

export type SaleCarnePdfInput = {
  summary: SaleChargesSummary;
  items: SaleCarneBoletoItem[];
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 8;
const SLOT_H = (PAGE_H - MARGIN * 2) / 3;

export {
  buildSaleCarneFilename,
  buildSaleCarneWhatsAppMessage,
} from '@/lib/finance/saleChargesShared';


/** ITF (Interleaved 2 of 5) patterns for digits 0-9 */
const ITF_PATTERNS = [
  '00110',
  '10001',
  '01001',
  '11000',
  '00101',
  '10100',
  '01100',
  '00011',
  '10010',
  '01010',
];

function drawItfBarcode(
  doc: jsPDF,
  code: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 2 || digits.length % 2 !== 0) return;

  // Start / stop
  let pattern = '0000'; // nnnn start
  for (let i = 0; i < digits.length; i += 2) {
    const a = ITF_PATTERNS[Number(digits[i])] || ITF_PATTERNS[0];
    const b = ITF_PATTERNS[Number(digits[i + 1])] || ITF_PATTERNS[0];
    for (let j = 0; j < 5; j++) {
      pattern += a[j] === '1' ? '1' : '0'; // bar wide/narrow
      pattern += b[j] === '1' ? '1' : '0'; // space
    }
  }
  pattern += '100'; // stop

  const unit = width / (pattern.length * 1.5);
  let cursor = x;
  let isBar = true;
  for (const bit of pattern) {
    const w = (bit === '1' ? 2.5 : 1) * unit;
    if (isBar) {
      doc.setFillColor(0, 0, 0);
      doc.rect(cursor, y, w, height, 'F');
    }
    cursor += w;
    isBar = !isBar;
  }
}

function formatDigitableDisplay(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 47) return raw;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}

async function resolvePixImage(charge: CompanyAsaasChargeResponse): Promise<string | null> {
  const existing = String(charge.pixQrCode || '').trim();
  if (existing.startsWith('data:image')) return existing;
  const payload = String(charge.pixCopyPaste || '').trim();
  if (!payload) return null;
  try {
    return await QRCode.toDataURL(payload, { margin: 1, width: 160 });
  } catch {
    return null;
  }
}

function parcelLabelFor(item: SaleCarneBoletoItem): string {
  if (item.parcelLabel) return item.parcelLabel;
  const n = item.installment?.installment_number;
  if (n === 0) return `Entrada de ${item.totalParcels}`;
  if (n == null) return `Parcela — de ${item.totalParcels}`;
  return `Parcela ${n} de ${item.totalParcels}`;
}

export async function buildSaleCarnePdfBytes(input: SaleCarnePdfInput): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const items = input.items;
  if (items.length === 0) {
    throw new Error('Nenhuma cobrança pendente com dados suficientes para o carnê.');
  }

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % 3 === 0) doc.addPage();
    const slot = i % 3;
    const y0 = MARGIN + slot * SLOT_H;
    const item = items[i];
    const charge = item.charge;
    const s = input.summary;

    // Cut line between slots
    if (slot > 0) {
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y0 - 0.5, PAGE_W - MARGIN, y0 - 0.5);
    }

    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y0 + 1, PAGE_W - MARGIN * 2, SLOT_H - 4);

    let y = y0 + 6;
    const x = MARGIN + 3;
    const innerW = PAGE_W - MARGIN * 2 - 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ASAAS / BOLETO BANCÁRIO', x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    y += 4;
    doc.text(
      `Beneficiário: ${input.beneficiaryName || s.financialAccountName || 'Empresa'}`,
      x,
      y,
    );
    y += 3.5;
    if (input.beneficiaryDocument) {
      doc.text(`CNPJ/CPF: ${input.beneficiaryDocument}`, x, y);
      y += 3.5;
    }
    doc.text(`Pagador: ${s.customerName || '—'}`, x, y);
    y += 3.5;
    doc.text(
      `${parcelLabelFor(item)}  |  ${s.projectName || 'Empreendimento'}  |  ${s.lotLabel || `QD ${s.quadra || '—'} — LT ${s.lote || '—'}`}`,
      x,
      y,
      { maxWidth: innerW },
    );
    y += 5;

    const due = String(charge.dueDate || '').slice(0, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Vencimento: ${due}`, x, y);
    doc.text(`Valor: ${formatCurrencyBRL(charge.value)}`, x + 70, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    y += 5;

    doc.text(`Documento: ${charge.asaasPaymentId || charge.id}`, x, y);
    y += 3.5;
    doc.text(`Nº cobrança: ${charge.id.slice(0, 8)}…`, x, y);
    y += 4;

    const digitable = String(charge.bankSlipIdentification || '').trim();
    if (digitable) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Linha digitável:', x, y);
      y += 3.5;
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.text(formatDigitableDisplay(digitable), x, y, { maxWidth: innerW });
      y += 5;

      const barcode = digitableLineToBarcode44(digitable);
      if (barcode) {
        drawItfBarcode(doc, barcode, x, y, Math.min(innerW * 0.72, 130), 12);
        y += 14;
      }
    }

    const pixImg = await resolvePixImage(charge);
    if (pixImg) {
      try {
        doc.addImage(pixImg, 'PNG', PAGE_W - MARGIN - 28, y0 + 8, 22, 22);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text('PIX', PAGE_W - MARGIN - 22, y0 + 32);
      } catch {
        /* ignore image errors */
      }
    }

    if (charge.pixCopyPaste) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      const pixShort =
        charge.pixCopyPaste.length > 90
          ? `${charge.pixCopyPaste.slice(0, 87)}…`
          : charge.pixCopyPaste;
      doc.text(`PIX Copia e Cola: ${pixShort}`, x, Math.min(y, y0 + SLOT_H - 8), {
        maxWidth: innerW * 0.7,
      });
    }

    const url = charge.bankSlipUrl || charge.invoiceUrl;
    if (url) {
      doc.setFontSize(6);
      doc.setTextColor(0, 80, 160);
      doc.text(`Boleto oficial: ${url}`, x, y0 + SLOT_H - 5, {
        maxWidth: innerW,
      });
      doc.setTextColor(0, 0, 0);
    }
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
