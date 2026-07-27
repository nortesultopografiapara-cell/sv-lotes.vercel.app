/**
 * Carnê PDF A4 — 3 boletos/folha — layout visual próximo ao boleto oficial Asaas.
 * Usa apenas artefatos oficiais: linha digitável, barcode, PIX QR, nosso número.
 */

import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  COMPANY_ASAAS_FINE_PERCENT,
  COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY,
} from '@/lib/finance/asaasCompanyLateFees';
import type { SaleChargeInstallmentRow, SaleChargesSummary } from '@/lib/finance/saleChargesShared';
import {
  digitableLineToBarcode44,
  formatDateBr,
  formatDigitableLineDisplay,
} from '@/lib/finance/saleChargesShared';
import { formatCarneTaxDocument } from '@/lib/finance/saleCarneBeneficiary';
import { formatPayerAddressForCarne } from '@/lib/finance/saleCarnePayerAddress';

export type SaleCarneBoletoItem = {
  charge: CompanyAsaasChargeResponse;
  installment: SaleChargeInstallmentRow | null;
  parcelLabel: string;
  totalParcels: number;
};

export type SaleCarnePayerInfo = {
  name: string;
  document: string;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** Endereço já formatado para impressão no carnê. */
  formattedAddress?: string | null;
};

export type SaleCarnePdfInput = {
  summary: SaleChargesSummary;
  items: SaleCarneBoletoItem[];
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
  payer?: SaleCarnePayerInfo | null;
  agencyCedente?: string | null;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 6;
const SLOT_H = (PAGE_H - MARGIN * 2) / 3;
const ASAAS_BANK_CODE = '461';

export {
  buildSaleCarneFilename,
  buildSaleCarneWhatsAppMessage,
} from '@/lib/finance/saleChargesShared';

/** ITF (Interleaved 2 of 5) — padrões Febraban para dígitos 0-9 */
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

  let pattern = '0000';
  for (let i = 0; i < digits.length; i += 2) {
    const a = ITF_PATTERNS[Number(digits[i])] || ITF_PATTERNS[0];
    const b = ITF_PATTERNS[Number(digits[i + 1])] || ITF_PATTERNS[0];
    for (let j = 0; j < 5; j++) {
      pattern += a[j] === '1' ? '1' : '0';
      pattern += b[j] === '1' ? '1' : '0';
    }
  }
  pattern += '100';

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

async function resolveOfficialPixImage(
  charge: CompanyAsaasChargeResponse,
): Promise<string | null> {
  const existing = String(charge.pixQrCode || '').trim();
  if (existing.startsWith('data:image')) return existing;
  if (/^[A-Za-z0-9+/=]+$/.test(existing) && existing.length > 80) {
    return `data:image/png;base64,${existing}`;
  }
  const payload = String(charge.pixCopyPaste || '').trim();
  if (!payload) return null;
  try {
    return await QRCode.toDataURL(payload, { margin: 0, width: 180 });
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

function resolveOfficialDigitable(charge: CompanyAsaasChargeResponse): string {
  const digits = String(charge.bankSlipIdentification || '').replace(/\D/g, '');
  return digits.length === 47 ? digits : '';
}

function resolveOfficialBarcode(charge: CompanyAsaasChargeResponse): string {
  const fromApi = String(charge.barCode || '').replace(/\D/g, '');
  if (fromApi.length === 44) return fromApi;
  const digitable = resolveOfficialDigitable(charge);
  if (!digitable) return '';
  return digitableLineToBarcode44(digitable) || '';
}

function resolveNossoNumero(charge: CompanyAsaasChargeResponse): string {
  const n = String(charge.nossoNumero || '').trim();
  if (n && !/^pay_/i.test(n) && !/^[0-9a-f-]{20,}$/i.test(n)) return n;
  return '';
}

function resolveDocumentNumber(charge: CompanyAsaasChargeResponse): string {
  const inv = String(charge.invoiceNumber || '').trim();
  if (inv && !/^pay_/i.test(inv)) return inv;
  const nosso = resolveNossoNumero(charge);
  return nosso;
}

function formatDoc(value: string | null | undefined): string {
  return formatCarneTaxDocument(value) || '';
}

function drawLabeledBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts?: { valueSize?: number; align?: 'left' | 'right'; boldValue?: boolean },
): void {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.rect(x, y, w, h);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(60, 60, 60);
  doc.text(label, x + 0.7, y + 2.1);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', opts?.boldValue === false ? 'normal' : 'bold');
  doc.setFontSize(opts?.valueSize ?? 6.5);
  const text = value || '';
  const ty = y + h - 1.4;
  if (opts?.align === 'right') {
    doc.text(text, x + w - 0.8, ty, { align: 'right', maxWidth: w - 1.6 });
  } else {
    doc.text(text, x + 0.7, ty, { maxWidth: w - 1.4 });
  }
}

function drawCutLine(doc: jsPDF, y: number): void {
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4);
  doc.setTextColor(120, 120, 120);
  doc.text('✂ corte aqui', PAGE_W / 2, y - 0.8, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

async function drawBoletoSlot(
  doc: jsPDF,
  y0: number,
  input: SaleCarnePdfInput,
  item: SaleCarneBoletoItem,
): Promise<void> {
  const charge = item.charge;
  const s = input.summary;
  const digitable = resolveOfficialDigitable(charge);
  const barcode = resolveOfficialBarcode(charge);
  if (!digitable && !barcode) {
    throw new Error(
      'Cobrança sem linha digitável/código de barras oficiais do Asaas. Atualize a situação e tente novamente.',
    );
  }

  const due = formatDateBr(charge.dueDate);
  const valueStr = formatCurrencyBRL(charge.value);
  const beneficiary = String(
    input.beneficiaryName || s.financialAccountName || 'Beneficiário',
  ).trim();
  const beneficiaryDoc = formatDoc(input.beneficiaryDocument);
  const payerName = String(input.payer?.name || s.customerName || 'Pagador').trim();
  const payerDoc = formatDoc(input.payer?.document);
  const nosso = resolveNossoNumero(charge);
  const docNumber = resolveDocumentNumber(charge);
  const agency = String(input.agencyCedente || '0001').trim() || '0001';
  const parcel = parcelLabelFor(item);
  const processed = formatDateBr(charge.createdAt) || due;
  const digitableDisplay = digitable
    ? formatDigitableLineDisplay(digitable)
    : formatDigitableLineDisplay(barcode);

  const slotPad = 1.2;
  const top = y0 + slotPad;
  const height = SLOT_H - slotPad * 2 - 1;
  const leftW = 42;
  const gap = 1.2;
  const xLeft = MARGIN;
  const xRight = MARGIN + leftW + gap;
  const rightW = PAGE_W - MARGIN - xRight;

  // ——— Recibo do Pagador ———
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(xLeft, top, leftW, height);

  let y = top + 3.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ASAAS', xLeft + 1.2, y);
  y += 3;
  doc.setFontSize(5.5);
  doc.text('RECIBO DO PAGADOR', xLeft + 1.2, y);
  y += 1.5;

  const receiptRows: Array<{ label: string; value: string; h?: number }> = [
    { label: 'Número do documento', value: docNumber || '—' },
    { label: 'Data de Vencimento', value: due || '—' },
    { label: 'Agência / Código do Cedente', value: agency },
    { label: 'Nosso número', value: nosso || '—' },
    { label: 'Valor Documento', value: valueStr || '—' },
    { label: 'Nº Parcela', value: parcel },
    { label: '(-) Desconto / Abatimentos', value: '' },
    { label: '(-) Outras deduções/Abat.', value: '' },
    { label: '(+) Mora / Multa', value: '' },
    { label: '(+) Outros acréscimos', value: '' },
    { label: '(=) Valor cobrado', value: '' },
  ];

  const receiptBottomReserve = 14;
  const receiptAvail = height - (y - top) - receiptBottomReserve;
  const rowH = Math.min(5.2, receiptAvail / receiptRows.length);
  for (const row of receiptRows) {
    drawLabeledBox(doc, xLeft, y, leftW, rowH, row.label, row.value, {
      valueSize: 6,
      boldValue: true,
    });
    y += rowH;
  }

  const payerBoxH = top + height - y;
  doc.rect(xLeft, y, leftW, payerBoxH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(60, 60, 60);
  doc.text('Pagador', xLeft + 0.7, y + 2.1);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.text(payerName, xLeft + 0.7, y + 5.2, { maxWidth: leftW - 1.4 });
  if (payerDoc) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.text(`CPF/CNPJ: ${payerDoc}`, xLeft + 0.7, y + 8.5, {
      maxWidth: leftW - 1.4,
    });
  }

  // ——— Ficha de compensação ———
  let ry = top;
  const headerH = 7;

  // Header: ASAAS | 461 | linha digitável
  doc.setLineWidth(0.25);
  doc.rect(xRight, ry, rightW, headerH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ASAAS', xRight + 1.5, ry + 4.8);

  const bankBoxW = 12;
  const bankBoxX = xRight + 28;
  doc.setLineWidth(0.45);
  doc.rect(bankBoxX, ry + 1.2, bankBoxW, 4.6);
  doc.setFontSize(9);
  doc.text(ASAAS_BANK_CODE, bankBoxX + bankBoxW / 2, ry + 4.5, { align: 'center' });
  doc.setLineWidth(0.25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text(digitableDisplay, xRight + rightW - 1.2, ry + 4.8, {
    align: 'right',
    maxWidth: rightW - 44,
  });
  ry += headerH;

  // Local / Vencimento
  const r1H = 6.2;
  drawLabeledBox(doc, xRight, ry, rightW - 32, r1H, 'Local de pagamento', 'Pagável em qualquer banco ou casa lotérica');
  drawLabeledBox(doc, xRight + rightW - 32, ry, 32, r1H, 'Vencimento', due, {
    align: 'right',
    valueSize: 7.5,
  });
  ry += r1H;

  // Beneficiário
  const r2H = 6.2;
  const benW = rightW - 64;
  drawLabeledBox(doc, xRight, ry, benW, r2H, 'Beneficiário', beneficiary, { valueSize: 6.2 });
  drawLabeledBox(doc, xRight + benW, ry, 32, r2H, 'CPF/CNPJ do Beneficiário', beneficiaryDoc || '—', {
    valueSize: 5.5,
  });
  drawLabeledBox(doc, xRight + benW + 32, ry, 32, r2H, 'Agência / Código do Cedente', agency, {
    valueSize: 5.8,
  });
  ry += r2H;

  // Datas / documento / nosso número
  const r3H = 6;
  const c3 = rightW / 6;
  drawLabeledBox(doc, xRight, ry, c3, r3H, 'Data do Documento', processed, { valueSize: 5.8 });
  drawLabeledBox(doc, xRight + c3, ry, c3, r3H, 'Nº do Documento', docNumber || '—', {
    valueSize: 5.8,
  });
  drawLabeledBox(doc, xRight + c3 * 2, ry, c3 * 0.7, r3H, 'Espécie Doc.', 'DM', { valueSize: 5.8 });
  drawLabeledBox(doc, xRight + c3 * 2.7, ry, c3 * 0.6, r3H, 'Aceite', 'N', { valueSize: 5.8 });
  drawLabeledBox(doc, xRight + c3 * 3.3, ry, c3, r3H, 'Data Processamento', processed, {
    valueSize: 5.5,
  });
  drawLabeledBox(doc, xRight + c3 * 4.3, ry, rightW - c3 * 4.3, r3H, 'Nosso Número', nosso || '—', {
    valueSize: 6,
    align: 'right',
  });
  ry += r3H;

  // Uso banco / carteira / valor
  const r4H = 6;
  drawLabeledBox(doc, xRight, ry, c3, r4H, 'Uso do banco', '');
  drawLabeledBox(doc, xRight + c3, ry, c3 * 0.7, r4H, 'Carteira', '1');
  drawLabeledBox(doc, xRight + c3 * 1.7, ry, c3 * 0.7, r4H, 'Espécie', 'R$');
  drawLabeledBox(doc, xRight + c3 * 2.4, ry, c3, r4H, 'Quantidade', '');
  drawLabeledBox(doc, xRight + c3 * 3.4, ry, c3, r4H, 'Valor', '');
  drawLabeledBox(doc, xRight + c3 * 4.4, ry, rightW - c3 * 4.4, r4H, 'Valor Documento', valueStr, {
    align: 'right',
    valueSize: 7.2,
  });
  ry += r4H;

  // Instruções + PIX + valores laterais
  const midBottom = top + height - 22;
  const midH = Math.max(18, midBottom - ry);
  const instrW = rightW - 54;
  const pixW = 22;
  const sideW = 32;

  doc.rect(xRight, ry, instrW, midH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(60, 60, 60);
  doc.text('Instruções (Texto de responsabilidade do beneficiário)', xRight + 0.7, ry + 2.1);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  const instructions = [
    'Não receber após o vencimento.',
    `Multa de ${COMPANY_ASAAS_FINE_PERCENT}% após o vencimento.`,
    `Juros de mora de ${COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY}% ao mês.`,
    parcel,
    s.projectName ? `Empreendimento: ${s.projectName}` : '',
    s.quadra || s.lote
      ? `Quadra: ${s.quadra || '—'}  |  Lote: ${s.lote || '—'}`
      : s.lotLabel || '',
  ].filter(Boolean);
  let iy = ry + 4.5;
  for (const line of instructions) {
    doc.text(line, xRight + 0.8, iy, { maxWidth: instrW - 1.6 });
    iy += 2.6;
  }

  const pixX = xRight + instrW;
  doc.rect(pixX, ry, pixW, midH);
  const pixImg = await resolveOfficialPixImage(charge);
  if (pixImg) {
    try {
      const size = Math.min(pixW - 2, midH - 7);
      doc.addImage(pixImg, 'PNG', pixX + (pixW - size) / 2, ry + 2.2, size, size);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4);
      doc.text('Pague com Pix', pixX + pixW / 2, ry + midH - 1.4, { align: 'center' });
    } catch {
      /* ignore */
    }
  } else {
    doc.setFontSize(4.5);
    doc.text('PIX', pixX + pixW / 2, ry + midH / 2, { align: 'center' });
  }

  const sideX = pixX + pixW;
  const sideRows = [
    '(-) Desconto / Abatimentos',
    '(-) Outras deduções/Abat.',
    '(+) Mora / Multa',
    '(+) Outros acréscimos',
    '(=) Valor cobrado',
  ];
  const sideRowH = midH / sideRows.length;
  for (let i = 0; i < sideRows.length; i++) {
    drawLabeledBox(doc, sideX, ry + i * sideRowH, sideW, sideRowH, sideRows[i], '');
  }
  ry += midH;

  // Pagador
  const payerH = 8.5;
  doc.rect(xRight, ry, rightW, payerH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.setTextColor(60, 60, 60);
  doc.text('Pagador', xRight + 0.7, ry + 2);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  const payerLine = payerDoc ? `${payerName}, CPF/CNPJ: ${payerDoc}` : payerName;
  doc.text(payerLine, xRight + 0.7, ry + 4.6, { maxWidth: rightW - 1.4 });
  const addrLine =
    String(input.payer?.formattedAddress || '').trim() ||
    formatPayerAddressForCarne({
      address: input.payer?.address,
      neighborhood: input.payer?.neighborhood,
      city: input.payer?.city,
      state: input.payer?.state,
      cep: input.payer?.zip,
    });
  if (addrLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(addrLine, xRight + 0.7, ry + 7.2, { maxWidth: rightW - 1.4 });
  }
  ry += payerH;

  // Código de barras
  const barAreaH = top + height - ry;
  doc.rect(xRight, ry, rightW, barAreaH);
  if (barcode) {
    const barW = Math.min(rightW - 28, 118);
    drawItfBarcode(doc, barcode, xRight + 1.5, ry + 1.8, barW, Math.max(9, barAreaH - 5));
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2);
  doc.text('Ficha de compensação', xRight + rightW - 1.2, ry + barAreaH - 1.5, {
    align: 'right',
  });
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
    if (slot > 0) drawCutLine(doc, y0);
    await drawBoletoSlot(doc, y0, input, items[i]);
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
