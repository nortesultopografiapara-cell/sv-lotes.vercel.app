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
  buildMemorialHeaderLines,
  formatMemorialCompanyCityUf,
  formatMemorialDateBr,
  memorialCompanyDisplayName,
  sanitizeMemorialDisplayText,
} from '@/lib/memorial/memorialBranding';
import { buildMemorialDescriptionParagraphs } from '@/lib/memorial/memorialText';

const MARGIN = 16;
const PAGE_W = 210;
const PAGE_H = 297;
const FOOTER_H = 18;
const HEADER_H = 34;
const LINE = 5.4;
const HEADER_LINE = 4;

function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH = LINE,
  footerReserve = FOOTER_H + 8,
): number {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y > PAGE_H - MARGIN - footerReserve) {
      doc.addPage();
      y = MARGIN + HEADER_H;
    }
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

function writeCenteredLines(
  doc: jsPDF,
  lines: string[],
  y: number,
  fontSize: number,
  boldFirst = false,
): number {
  doc.setFontSize(fontSize);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    doc.setFont('helvetica', boldFirst && i === 0 ? 'bold' : 'normal');
    doc.text(line, PAGE_W / 2, y, { align: 'center', maxWidth: PAGE_W - MARGIN * 2 });
    y += HEADER_LINE;
  }
  return y;
}

function drawMemorialFooter(doc: jsPDF, payload: MemorialPayload) {
  const lines = buildMemorialFooterLines(payload.company);
  if (!lines.length) return;
  const y0 = PAGE_H - FOOTER_H;
  doc.setDrawColor(200);
  doc.line(MARGIN, y0 - 2, PAGE_W - MARGIN, y0 - 2);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  let y = y0 + 2;
  for (const line of lines) {
    doc.text(line, PAGE_W / 2, y, { align: 'center', maxWidth: PAGE_W - MARGIN * 2 });
    y += 3.2;
  }
  doc.setTextColor(0);
}

async function drawMemorialHeader(
  doc: jsPDF,
  payload: MemorialPayload,
  yStart: number,
): Promise<number> {
  let y = yStart;
  const logoUrl = payload.company.logoUrl?.trim();
  if (logoUrl) {
    try {
      const logoB64 = await loadImageAsBase64(logoUrl);
      doc.addImage(logoB64, 'PNG', PAGE_W / 2 - 12, y, 24, 12);
      y += 14;
    } catch {
      /* logo opcional */
    }
  }

  const headerLines = buildMemorialHeaderLines(payload.company);
  y = writeCenteredLines(doc, headerLines, y, 8, true);
  y += 2;
  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 6;
}

function formatRegistrySigef(tech: MemorialPayload['technical']): string {
  const parts: string[] = [];
  if (tech.crea) parts.push(`CREA: ${tech.crea}`);
  if (tech.cft) parts.push(`CFT: ${tech.cft}`);
  if (tech.cau) parts.push(`CAU: ${tech.cau}`);
  return parts.join(' · ');
}

export async function generateMemorialPdf(
  payload: MemorialPayload,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const maxW = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  y = await drawMemorialHeader(doc, payload, y);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MEMORIAL DESCRITIVO', PAGE_W / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const id = payload.identification;
  const projectName = sanitizeMemorialDisplayText(
    payload.projectName || id.project,
  );
  const idLines: [string, string][] = [
    ['Empreendimento:', projectName],
    ['Quadra:', id.quadra],
    ['Lote:', id.lote],
    ['Município:', id.municipality],
    ['Área:', id.areaM2],
    ['Perímetro:', id.perimeterM],
    ['Datum:', 'SIRGAS2000'],
    ['Fuso UTM:', payload.utmZone || 'Não informado'],
    ['Proprietário:', id.owner],
    ['Matrícula:', id.matricula],
  ];
  for (const [label, value] of idLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeMemorialDisplayText(value), MARGIN + 36, y, {
      maxWidth: maxW - 38,
    });
    y += LINE;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('CONFRONTAÇÕES', MARGIN, y);
  y += LINE + 1;
  doc.setFont('helvetica', 'normal');
  const sides = payload.sides;
  const summary: [string, string][] = [
    ['Frente:', sides.frente],
    ['Fundo:', sides.fundo],
    ['Lado Direito:', sides.ladoDireito],
    ['Lado Esquerdo:', sides.ladoEsquerdo],
    ['Chanfre:', sides.chanfre],
  ];
  for (const [label, value] of summary) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(sanitizeMemorialDisplayText(value), maxW - 40);
    doc.text(lines[0]!, MARGIN + 36, y);
    y += LINE;
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i]!, MARGIN + 36, y);
      y += LINE;
    }
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESCRIÇÃO', MARGIN, y);
  y += LINE + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  for (const para of buildMemorialDescriptionParagraphs(payload.segments)) {
    y = writeWrapped(doc, para, MARGIN, y, maxW);
    y += 2.5;
  }

  y += 3;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('OBSERVAÇÕES', MARGIN, y);
  y += LINE + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const obs of payload.observations) {
    y = writeWrapped(doc, `• ${obs}`, MARGIN, y, maxW);
    y += 1.5;
  }

  if (y > PAGE_H - 60) {
    doc.addPage();
    y = MARGIN + HEADER_H;
  }
  y += 8;

  const cityUf =
    formatMemorialCompanyCityUf(payload.company) || id.municipality || '—';
  doc.setFontSize(9);
  doc.text(
    `${cityUf}, ${formatMemorialDateBr(payload.generatedAt)}.`,
    PAGE_W / 2,
    y,
    { align: 'center' },
  );
  y += 12;

  const sigUrl = payload.company.signatureUrl;
  if (sigUrl) {
    try {
      const sigB64 = await loadImageAsBase64(sigUrl);
      doc.addImage(sigB64, 'PNG', PAGE_W / 2 - 20, y, 40, 14);
      y += 18;
    } catch {
      /* assinatura opcional */
    }
  }

  const tech = payload.technical;
  if (hasTechnicalResponsible(tech)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(sanitizeMemorialDisplayText(tech.name || '—'), PAGE_W / 2, y, {
      align: 'center',
    });
    y += LINE;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Responsável técnico', PAGE_W / 2, y, { align: 'center' });
    y += LINE;
    if (tech.title) {
      doc.text(sanitizeMemorialDisplayText(tech.title), PAGE_W / 2, y, {
        align: 'center',
      });
      y += LINE;
    }
    const reg = formatRegistrySigef(tech);
    if (reg) {
      doc.text(reg, PAGE_W / 2, y, { align: 'center' });
      y += LINE;
    } else {
      const legacy = formatTechnicalRegistryLine(tech);
      if (legacy !== '—') {
        doc.text(legacy, PAGE_W / 2, y, { align: 'center' });
        y += LINE;
      }
    }
  } else {
    doc.setFontSize(9);
    doc.text(
      'Responsável técnico: Não informado',
      PAGE_W / 2,
      y,
      { align: 'center' },
    );
  }

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
