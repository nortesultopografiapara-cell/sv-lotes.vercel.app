/**
 * PDF do memorial descritivo (MEM-001) — layout SIGEF/INCRA.
 */

import { jsPDF } from 'jspdf';
import {
  loadImageAsBase64,
  loadReportHeaderLogoBase64,
} from '@/lib/reportBranding';
import {
  formatTechnicalRegistryLine,
  hasTechnicalResponsible,
} from '@/lib/technicalResponsible';
import type { MemorialPayload } from '@/lib/memorial/memorialTypes';
import { buildMemorialDescriptionParagraphs } from '@/lib/memorial/memorialText';

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const LINE = 5.5;
const HEADER_LINE = 4.2;

function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH = LINE,
): number {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y > PAGE_H - MARGIN - 20) {
      doc.addPage();
      y = MARGIN + 10;
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
    doc.text(line, PAGE_W / 2, y, { align: 'center' });
    y += HEADER_LINE;
  }
  return y;
}

function formatDateBr(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
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

  const logoB64 = await loadReportHeaderLogoBase64(
    payload.company.logoUrl || null,
  );
  if (logoB64) {
    try {
      doc.addImage(logoB64, 'PNG', PAGE_W / 2 - 14, y, 28, 14);
      y += 18;
    } catch {
      /* ignore */
    }
  }

  const companyLines: string[] = [
    payload.company.fantasyName || payload.company.name,
    payload.company.cnpj !== 'Não informado'
      ? `CNPJ: ${payload.company.cnpj}`
      : '',
    payload.company.phone !== 'Não informado'
      ? `Telefone: ${payload.company.phone}`
      : '',
    payload.company.email !== 'Não informado'
      ? `E-mail: ${payload.company.email}`
      : '',
    payload.company.address !== 'Não informado'
      ? payload.company.address
      : '',
  ].filter(Boolean);

  y = writeCenteredLines(doc, companyLines, y, 8.5, true);
  y += 6;

  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MEMORIAL DESCRITIVO', PAGE_W / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const id = payload.identification;
  const idLines: [string, string][] = [
    ['Proprietário:', id.owner],
    ['Propriedade:', id.property],
    ['Projeto:', id.project],
    ['Quadra:', id.quadra],
    ['Lote:', id.lote],
    ['Município/UF:', id.municipality],
    ['Matrícula:', id.matricula],
    ['Área:', id.areaM2],
    ['Perímetro:', id.perimeterM],
  ];
  for (const [label, value] of idLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, MARGIN + 38, y, { maxWidth: maxW - 40 });
    y += LINE;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('QUADRO RESUMO', MARGIN, y);
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
    const lines = doc.splitTextToSize(value, maxW - 42);
    if (lines.length === 1) {
      doc.text(lines[0]!, MARGIN + 38, y);
      y += LINE;
    } else {
      doc.text(lines[0]!, MARGIN + 38, y);
      y += LINE;
      for (let i = 1; i < lines.length; i++) {
        doc.text(lines[i]!, MARGIN + 38, y);
        y += LINE;
      }
    }
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIÇÃO', MARGIN, y);
  y += LINE + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  for (const para of buildMemorialDescriptionParagraphs(payload.segments)) {
    y = writeWrapped(doc, para, MARGIN, y, maxW);
    y += 3;
  }

  y += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('OBSERVAÇÕES', MARGIN, y);
  y += LINE + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const obs of payload.observations) {
    y = writeWrapped(doc, `• ${obs}`, MARGIN, y, maxW);
    y += 2;
  }

  if (y > PAGE_H - 55) {
    doc.addPage();
    y = MARGIN;
  }
  y += 8;

  const city =
    payload.company.city !== 'Não informado'
      ? payload.company.city
      : id.municipality.split('/')[0] || '—';
  const uf =
    payload.company.state !== 'Não informado'
      ? payload.company.state
      : id.municipality.split('/')[1] || '';
  doc.setFontSize(9);
  doc.text(
    `${city}${uf ? ` - ${uf}` : ''}, ${formatDateBr(new Date(payload.generatedAt))}.`,
    PAGE_W / 2,
    y,
    { align: 'center' },
  );
  y += 14;

  const sigUrl = payload.company.signatureUrl;
  if (sigUrl) {
    try {
      const sigB64 = await loadImageAsBase64(sigUrl);
      doc.addImage(sigB64, 'PNG', PAGE_W / 2 - 20, y, 40, 16);
      y += 20;
    } catch {
      /* ignore */
    }
  }

  const tech = payload.technical;
  if (hasTechnicalResponsible(tech)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(tech.name || '—', PAGE_W / 2, y, { align: 'center' });
    y += LINE + 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (tech.title) {
      doc.text(tech.title, PAGE_W / 2, y, { align: 'center' });
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
