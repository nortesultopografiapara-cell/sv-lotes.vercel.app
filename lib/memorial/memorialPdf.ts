/**
 * PDF do memorial descritivo — layout timbrado da empresa logada.
 */

import { jsPDF } from 'jspdf';
import { loadImageAsBase64 } from '@/lib/reportBranding';
import {
  formatTechnicalRegistryLine,
  hasTechnicalResponsible,
} from '@/lib/technicalResponsible';
import type { MemorialPayload } from '@/lib/memorial/memorialTypes';
import {
  buildMemorialFooterLines,
  buildMemorialHeaderContactLines,
  formatMemorialCompanyCityUf,
  formatMemorialDateBr,
  formatMemorialTitleSpaced,
  memorialCompanyDisplayName,
  sanitizeMemorialDisplayText,
} from '@/lib/memorial/memorialBranding';
import { buildMemorialDescriptionParagraphs } from '@/lib/memorial/memorialText';

const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const FOOTER_H = 14;
const CONTENT_TOP = 28;
const LINE = 4;
const LINE_DESC = 3.6;
const LINE_TIGHT = 3.2;
const HEADER_CONTACT_SIZE = 6.2;
const HEADER_NAME_SIZE = 9.5;
const LOGO_W = 22;
const LOGO_H = 11;
const LOGO_X = MARGIN;
const CONTACT_COL_W = 62;

function ensurePageSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  footerReserve = FOOTER_H + 6,
): number {
  if (y + needed <= PAGE_H - MARGIN - footerReserve) return y;
  doc.addPage();
  return CONTENT_TOP;
}

function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH = LINE,
  footerReserve = FOOTER_H + 6,
  justify = false,
): number {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    y = ensurePageSpace(doc, y, lineH, footerReserve);
    if (justify) {
      doc.text(line, x, y, { align: 'justify', maxWidth: maxW });
    } else {
      doc.text(line, x, y);
    }
    y += lineH;
  }
  return y;
}

function writeTableCell(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  colW: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.text(label, x, y);
  const labelW = doc.getTextWidth(`${label} `);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(sanitizeMemorialDisplayText(value), colW - labelW - 1);
  let cy = y;
  for (const line of lines) {
    doc.text(line, x + labelW, cy);
    cy += LINE_TIGHT;
  }
  return cy;
}

function writeFullWidthField(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  maxW: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.text(label, MARGIN, y);
  const labelW = doc.getTextWidth(`${label} `);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(sanitizeMemorialDisplayText(value), maxW - labelW);
  let cy = y;
  for (const line of lines) {
    doc.text(line, MARGIN + labelW, cy);
    cy += LINE_TIGHT;
  }
  return cy + 0.5;
}

function drawMemorialFooter(doc: jsPDF, payload: MemorialPayload) {
  const lines = buildMemorialFooterLines(payload.company);
  if (!lines.length) return;
  const y0 = PAGE_H - FOOTER_H;
  doc.setDrawColor(41, 98, 168);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y0 - 2, PAGE_W - MARGIN, y0 - 2);
  doc.setFontSize(6.2);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(90);
  let y = y0 + 1.5;
  for (const line of lines) {
    doc.text(line, PAGE_W / 2, y, { align: 'center', maxWidth: PAGE_W - MARGIN * 2 });
    y += 2.8;
  }
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
}

async function drawMemorialHeader(
  doc: jsPDF,
  payload: MemorialPayload,
): Promise<number> {
  const yStart = MARGIN;
  const logoUrl = payload.company.logoUrl?.trim();
  let logoDrawn = false;

  if (logoUrl) {
    try {
      const logoB64 = await loadImageAsBase64(logoUrl);
      doc.addImage(logoB64, 'PNG', LOGO_X, yStart, LOGO_W, LOGO_H);
      logoDrawn = true;
    } catch {
      /* logo opcional */
    }
  }

  const centerX = PAGE_W / 2;
  const name = memorialCompanyDisplayName(payload.company);
  const legalName = sanitizeMemorialDisplayText(payload.company.name);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(HEADER_NAME_SIZE);
  doc.setTextColor(30, 72, 130);
  doc.text(name, centerX, yStart + 4, { align: 'center', maxWidth: PAGE_W - LOGO_W - CONTACT_COL_W - MARGIN * 2 });

  if (
    legalName &&
    legalName !== 'Não informado' &&
    legalName.toUpperCase() !== name.toUpperCase()
  ) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(40);
    doc.text(legalName, centerX, yStart + 8.5, {
      align: 'center',
      maxWidth: PAGE_W - LOGO_W - CONTACT_COL_W - MARGIN * 2,
    });
  }

  const contactLines = buildMemorialHeaderContactLines(payload.company);
  const contactX = PAGE_W - MARGIN;
  doc.setFontSize(HEADER_CONTACT_SIZE);
  doc.setTextColor(30);
  let contactY = yStart + (logoDrawn ? 2 : 0);
  for (const line of contactLines) {
    doc.setFont('helvetica', 'normal');
    doc.text(line, contactX, contactY, {
      align: 'right',
      maxWidth: CONTACT_COL_W,
    });
    contactY += 3.1;
  }

  const headerBottom = Math.max(
    yStart + LOGO_H + 1,
    contactY,
    yStart + (legalName !== name && legalName !== 'Não informado' ? 10 : 7),
  );

  doc.setDrawColor(41, 98, 168);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, headerBottom + 1.5, PAGE_W - MARGIN, headerBottom + 1.5);
  doc.setTextColor(0);
  return headerBottom + 5;
}

function drawPropertyTable(
  doc: jsPDF,
  payload: MemorialPayload,
  yStart: number,
): number {
  const maxW = PAGE_W - MARGIN * 2;
  const cols = 4;
  const colW = maxW / cols;
  const id = payload.identification;
  const projectName = sanitizeMemorialDisplayText(
    payload.projectName || id.project,
  );

  const cells: [string, string][] = [
    ['Quadra:', id.quadra],
    ['Lote:', id.lote],
    ['Área:', id.areaM2],
    ['Perímetro:', id.perimeterM],
    ['Município:', id.municipality],
    ['Datum:', 'SIRGAS2000'],
    ['Fuso UTM:', payload.utmZone || 'Não informado'],
    ['Matrícula:', id.matricula],
  ];

  doc.setFontSize(7.2);
  let y = yStart;
  const rows = Math.ceil(cells.length / cols);

  for (let row = 0; row < rows; row++) {
    let rowBottom = y + LINE;
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (idx >= cells.length) break;
      const [label, value] = cells[idx]!;
      const x = MARGIN + col * colW;
      const cellBottom = writeTableCell(doc, label, value, x, y, colW);
      rowBottom = Math.max(rowBottom, cellBottom);
    }
    y = rowBottom + 0.6;
  }

  y = writeFullWidthField(doc, 'Proprietário:', id.owner, y, maxW);
  y = writeFullWidthField(doc, 'Empreendimento:', projectName, y, maxW);

  return y + 1;
}

function drawConfrontationsCompact(
  doc: jsPDF,
  payload: MemorialPayload,
  yStart: number,
): number {
  const maxW = PAGE_W - MARGIN * 2;
  const sides = payload.sides;
  const pairs: [string, string][] = [
    ['Frente:', sides.frente],
    ['Fundo:', sides.fundo],
    ['Lado Direito:', sides.ladoDireito],
    ['Lado Esquerdo:', sides.ladoEsquerdo],
    ['Chanfre:', sides.chanfre],
  ];

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFRONTAÇÕES', MARGIN, yStart);
  let y = yStart + LINE;

  doc.setFontSize(6.8);
  const colW = maxW / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i]!;
    const right = pairs[i + 1];
    const leftBottom = writeTableCell(doc, left[0], left[1], MARGIN, y, colW);
    const rightBottom = right
      ? writeTableCell(doc, right[0], right[1], MARGIN + colW, y, colW)
      : y;
    y = Math.max(leftBottom, rightBottom) + 0.4;
  }

  return y + 1;
}

function formatRegistrySigef(tech: MemorialPayload['technical']): string {
  const parts: string[] = [];
  if (tech.crea) parts.push(`CREA: ${tech.crea}`);
  if (tech.cft) parts.push(`CFT: ${tech.cft}`);
  if (tech.cau) parts.push(`CAU: ${tech.cau}`);
  return parts.join(' · ');
}

function buildContinuousDescription(payload: MemorialPayload): string {
  return buildMemorialDescriptionParagraphs(payload.segments).join(' ');
}

function drawSignatureBlock(
  doc: jsPDF,
  payload: MemorialPayload,
  yStart: number,
  sigImage: string | null,
): number {
  const blockW = 58;
  const blockX = PAGE_W - MARGIN - blockW;
  let y = yStart;

  if (sigImage) {
    try {
      doc.addImage(sigImage, 'PNG', blockX + 9, y, 40, 12);
      y += 14;
    } catch {
      /* assinatura opcional */
    }
  }

  const tech = payload.technical;
  if (!hasTechnicalResponsible(tech)) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Responsável técnico: Não informado', PAGE_W - MARGIN, y, {
      align: 'right',
    });
    return y + LINE;
  }

  const name = sanitizeMemorialDisplayText(tech.name || '—');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(name, PAGE_W - MARGIN, y, { align: 'right', maxWidth: blockW });
  y += LINE;

  doc.setDrawColor(60);
  doc.setLineWidth(0.25);
  doc.line(blockX, y, PAGE_W - MARGIN, y);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Responsável técnico', PAGE_W - MARGIN, y, {
    align: 'right',
    maxWidth: blockW,
  });
  y += LINE_TIGHT;
  if (tech.title) {
    doc.text(sanitizeMemorialDisplayText(tech.title), PAGE_W - MARGIN, y, {
      align: 'right',
      maxWidth: blockW,
    });
    y += LINE_TIGHT;
  }

  const reg = formatRegistrySigef(tech);
  if (reg) {
    doc.text(reg, PAGE_W - MARGIN, y, { align: 'right', maxWidth: blockW });
    y += LINE_TIGHT;
  } else {
    const legacy = formatTechnicalRegistryLine(tech);
    if (legacy !== '—') {
      doc.text(legacy, PAGE_W - MARGIN, y, { align: 'right', maxWidth: blockW });
      y += LINE_TIGHT;
    }
  }

  return y;
}

export async function generateMemorialPdf(
  payload: MemorialPayload,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const maxW = PAGE_W - MARGIN * 2;
  let y = await drawMemorialHeader(doc, payload);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(formatMemorialTitleSpaced(), PAGE_W / 2, y, { align: 'center' });
  y += 7;

  y = drawPropertyTable(doc, payload, y);
  y = drawConfrontationsCompact(doc, payload, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DESCRIÇÃO', MARGIN, y);
  y += LINE;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  const descriptionText = buildContinuousDescription(payload);
  y = writeWrapped(doc, descriptionText, MARGIN, y, maxW, LINE_DESC, FOOTER_H + 6, true);
  y += 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('OBSERVAÇÕES', MARGIN, y);
  y += LINE - 0.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  for (const obs of payload.observations) {
    y = writeWrapped(doc, `• ${obs}`, MARGIN, y, maxW, LINE_TIGHT);
    y += 0.3;
  }

  y = ensurePageSpace(doc, y, 42);
  y += 4;

  const cityUf =
    formatMemorialCompanyCityUf(payload.company) ||
    payload.identification.municipality ||
    '—';
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${cityUf}, ${formatMemorialDateBr(payload.generatedAt)}.`,
    PAGE_W / 2,
    y,
    { align: 'center' },
  );
  y += 10;

  let sigImage: string | null = null;
  const sigUrl = payload.company.signatureUrl;
  if (sigUrl) {
    try {
      sigImage = await loadImageAsBase64(sigUrl);
    } catch {
      /* assinatura opcional */
    }
  }

  y = drawSignatureBlock(doc, payload, y, sigImage);

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawMemorialFooter(doc, payload);
  }

  return doc;
}

export function memorialPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadMemorialPdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}

export function openMemorialPdfPreview(doc: jsPDF): void {
  const blob = memorialPdfToBlob(doc);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Extrai texto do PDF para validação em testes Node. */
export function memorialPdfTextContent(doc: jsPDF): string {
  const parts: string[] = [];
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    const text = (
      doc as unknown as { getPage: (n: number) => { getTextContent?: () => { items: { str: string }[] } } }
    ).getPage?.(p)?.getTextContent?.();
    if (text?.items) {
      parts.push(text.items.map((i) => i.str).join(' '));
    }
  }
  if (parts.length) return parts.join('\n');
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}
