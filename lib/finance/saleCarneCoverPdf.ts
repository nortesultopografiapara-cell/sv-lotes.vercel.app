/**
 * Capa do Carnê — PDF A4 (jsPDF).
 * Frente + verso com área em branco entre as partes; sem página extra.
 */

import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import type { SaleCarneCoverPdfInput } from '@/lib/finance/saleCarneCoverShared';
import { fitFontSizeForWidth, wrapTextToLines } from '@/lib/finance/saleCarneCoverShared';

export {
  buildSaleCarneCoverFilename,
} from '@/lib/finance/saleCarneCoverShared';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 10;
const CARD_W = PAGE_W - MARGIN_X * 2;
const CARD_H = 88;
const FRONT_Y = 8;
const BACK_Y = 156;
const NAVY: [number, number, number] = [11, 42, 74];
const GOLD: [number, number, number] = [201, 162, 39];
const LABEL: [number, number, number] = [100, 116, 139];
const TEXT: [number, number, number] = [15, 23, 42];
const BORDER: [number, number, number] = [203, 213, 225];
const HEADER_H = 22;
const GOLD_BAR_H = 2.2;
const CARD_PAD_X = 6;
const PORTAL_FEATURES = [
  'Emitir a 2ª via dos boletos',
  'Consultar seus contratos',
  'Acompanhar parcelas e pagamentos',
  'Ver sua situação financeira',
] as const;

function drawDashedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'S');
  doc.setLineDashPattern([], 0);
}

function drawHeaderBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  logoDataUrl: string | null,
  title: string,
  subtitle: string,
): void {
  doc.setFillColor(...NAVY);
  doc.roundedRect(x, y, w, HEADER_H, 2.5, 2.5, 'F');
  // cobrir cantos inferiores do header (só topo arredondado visualmente)
  doc.rect(x, y + HEADER_H - 4, w, 4, 'F');

  const logoBox = 14;
  const logoX = x + 4;
  const logoY = y + (HEADER_H - logoBox) / 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(logoX, logoY, logoBox, logoBox, 1.2, 1.2, 'F');
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoDataUrl, fmt, logoX + 1, logoY + 1, logoBox - 2, logoBox - 2, undefined, 'FAST');
    } catch {
      // fallback: caixa branca já desenhada
    }
  }

  const textX = logoX + logoBox + 4;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, textX, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const sub = subtitle.length > 78 ? `${subtitle.slice(0, 75)}…` : subtitle;
  doc.text(sub, textX, y + 16);
}

function drawGoldBar(doc: jsPDF, x: number, cardBottomY: number, w: number): void {
  doc.setFillColor(...GOLD);
  doc.rect(x, cardBottomY - GOLD_BAR_H, w, GOLD_BAR_H, 'F');
}

function drawInfoCards(
  doc: jsPDF,
  x: number,
  y: number,
  totalW: number,
  quadra: string,
  lote: string,
  parcelas: string,
): number {
  const gap = 4;
  const cardW = (totalW - gap * 2) / 3;
  const cardH = 14;
  const items: Array<[string, string]> = [
    ['QUADRA', quadra],
    ['LOTE', lote],
    ['PARCELAS', parcelas],
  ];

  items.forEach(([label, value], i) => {
    const cx = x + i * (cardW + gap);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cx, y, cardW, cardH, 1.8, 1.8, 'FD');
    doc.setTextColor(...LABEL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(label, cx + cardW / 2, y + 4.5, { align: 'center' });
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    const valueSize = fitFontSizeForWidth(value, 12, 11, 7);
    doc.setFontSize(valueSize);
    doc.text(value, cx + cardW / 2, y + 11, { align: 'center' });
  });

  return y + cardH;
}

function drawFrontCard(doc: jsPDF, input: SaleCarneCoverPdfInput, y: number): void {
  const x = MARGIN_X;
  drawDashedRect(doc, x, y, CARD_W, CARD_H);

  const docDigits = (input.companyDocumentFormatted || '').replace(/\D/g, '');
  const docLabel = docDigits.length === 11 ? 'CPF' : 'CNPJ';
  const headerSub = input.companyDocumentFormatted
    ? `${input.companyLegalName} | ${docLabel} ${input.companyDocumentFormatted}`
    : input.companyLegalName;

  drawHeaderBar(
    doc,
    x,
    y,
    CARD_W,
    input.logoDataUrl,
    'CARNÊ DE PAGAMENTOS',
    headerSub,
  );

  const bodyX = x + CARD_PAD_X;
  const bodyW = CARD_W - CARD_PAD_X * 2;
  let cursorY = y + HEADER_H + 8;

  doc.setTextColor(...LABEL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('CLIENTE', bodyX, cursorY);

  cursorY += 5;
  const customerLines = wrapTextToLines(input.customerName, 48, 2);
  const customerSize = fitFontSizeForWidth(customerLines.join(' '), 42, 13, 9);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(customerSize);
  customerLines.forEach((line, i) => {
    doc.text(line, bodyX, cursorY + i * (customerSize * 0.45));
  });
  cursorY += customerLines.length * (customerSize * 0.45) + 3;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(bodyX, cursorY, bodyX + bodyW, cursorY);
  cursorY += 6;

  doc.setTextColor(...LABEL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('EMPREENDIMENTO', bodyX, cursorY);
  cursorY += 5;

  const projectLines = wrapTextToLines(input.projectName, 52, 2);
  const projectSize = fitFontSizeForWidth(projectLines.join(' '), 48, 11, 8);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(projectSize);
  projectLines.forEach((line, i) => {
    doc.text(line, bodyX, cursorY + i * (projectSize * 0.45));
  });
  cursorY += projectLines.length * (projectSize * 0.45) + 6;

  const cardsBottom = drawInfoCards(
    doc,
    bodyX,
    cursorY,
    bodyW,
    input.quadra || '—',
    input.lote || '—',
    String(input.installmentsCount),
  );

  // Área reservada para a frase — abaixo dos cards, acima da faixa dourada
  const phraseY = Math.min(cardsBottom + 8, y + CARD_H - GOLD_BAR_H - 6);
  doc.setTextColor(...LABEL);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'Guarde este carnê e apresente-o sempre que necessário.',
    bodyX,
    phraseY,
  );

  drawGoldBar(doc, x, y + CARD_H, CARD_W);
}

function drawBackCard(
  doc: jsPDF,
  input: SaleCarneCoverPdfInput,
  y: number,
  qrDataUrl: string,
): void {
  const x = MARGIN_X;
  drawDashedRect(doc, x, y, CARD_W, CARD_H);

  drawHeaderBar(
    doc,
    x,
    y,
    CARD_W,
    input.logoDataUrl,
    'ACESSE SEU PORTAL DO CLIENTE',
    'Boletos, contratos e pagamentos em um só lugar',
  );

  const bodyX = x + CARD_PAD_X;
  const bodyW = CARD_W - CARD_PAD_X * 2;
  const contentTop = y + HEADER_H + 6;

  const qrSize = 38;
  const qrX = bodyX + 2;
  const qrY = contentTop;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'FD');
  try {
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');
  } catch {
    // QR falhou — retângulo vazio
  }
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('APONTE A CÂMERA PARA ACESSAR', qrX + qrSize / 2, qrY + qrSize + 5, {
    align: 'center',
  });

  const rightX = qrX + qrSize + 10;
  const rightW = bodyX + bodyW - rightX;
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NO PORTAL DO CLIENTE VOCÊ PODE:', rightX, contentTop + 3);

  let listY = contentTop + 10;
  PORTAL_FEATURES.forEach((item) => {
    doc.setFillColor(...GOLD);
    doc.circle(rightX + 1.5, listY - 1.2, 1.1, 'F');
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(item, rightX + 5, listY);
    listY += 6;
  });

  // Rodapé: card URL (esquerda) + contatos (direita)
  const footerY = y + CARD_H - GOLD_BAR_H - 14;
  const urlCardW = Math.min(78, rightW * 0.72);
  const urlCardH = 8;
  const urlCardX = rightX;
  doc.setFillColor(...NAVY);
  doc.roundedRect(urlCardX, footerY, urlCardW, urlCardH, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  const urlSize = fitFontSizeForWidth(input.portalDisplayUrl, 36, 7.5, 5.5);
  doc.setFontSize(urlSize);
  doc.text(input.portalDisplayUrl, urlCardX + urlCardW / 2, footerY + 5.3, {
    align: 'center',
  });

  const contactX = urlCardX + urlCardW + 6;
  const contactMaxW = bodyX + bodyW - contactX;
  let contactY = footerY + 2.5;
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'normal');

  if (input.companyPhoneFormatted) {
    doc.setFontSize(7);
    doc.text(input.companyPhoneFormatted, contactX, contactY);
    contactY += 4.5;
  }
  if (input.companyEmail) {
    const email = input.companyEmail;
    const emailSize = fitFontSizeForWidth(email, Math.max(18, contactMaxW / 1.7), 7, 5);
    doc.setFontSize(emailSize);
    const emailLines = wrapTextToLines(email, Math.max(22, Math.floor(contactMaxW / 1.6)), 2);
    emailLines.forEach((line, i) => {
      doc.text(line, contactX, contactY + i * 3.6);
    });
  }

  drawGoldBar(doc, x, y + CARD_H, CARD_W);
}

function drawBlankAreaLabel(doc: jsPDF): void {
  const midY = (FRONT_Y + CARD_H + BACK_Y) / 2;
  doc.setTextColor(180, 190, 200);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('ÁREA EM BRANCO - SEM IMPRESSÃO DA CAPA', PAGE_W / 2, midY, {
    align: 'center',
  });
}

export async function buildSaleCarneCoverPdfBytes(
  input: SaleCarneCoverPdfInput,
): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const qrDataUrl = await QRCode.toDataURL(input.portalUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
    color: { dark: '#0B2A4A', light: '#FFFFFF' },
  });

  drawFrontCard(doc, input, FRONT_Y);
  drawBlankAreaLabel(doc);
  drawBackCard(doc, input, BACK_Y, qrDataUrl);

  // Garantir uma única página
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = pages; p > 1; p -= 1) {
      doc.deletePage(p);
    }
  }

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
