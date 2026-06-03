/**
 * PDF do memorial descritivo (MEM-001).
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

function formatDateBr(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
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
      doc.addImage(logoB64, 'PNG', MARGIN, y, 28, 14);
    } catch {
      /* ignore */
    }
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(payload.company.fantasyName, MARGIN + 32, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  y += 6;
  doc.text(`CNPJ: ${payload.company.cnpj}`, MARGIN + 32, y);
  y += 4;
  doc.text(
    `${payload.company.phone} · ${payload.company.email}`,
    MARGIN + 32,
    y,
  );
  y += 4;
  if (payload.company.address !== 'Não informado') {
    doc.text(payload.company.address, MARGIN + 32, y, { maxWidth: maxW - 32 });
    y += 6;
  }
  y = Math.max(y, 28);

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
    doc.text(`${label} ${value}`, MARGIN, y);
    y += LINE;
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
    y = writeWrapped(doc, obs, MARGIN, y, maxW);
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
    `${city}${uf ? `/${uf}` : ''}, ${formatDateBr(new Date(payload.generatedAt))}.`,
    MARGIN,
    y,
  );
  y += 12;

  const sigUrl = payload.company.signatureUrl;
  if (sigUrl) {
    try {
      const sigB64 = await loadImageAsBase64(sigUrl);
      doc.addImage(sigB64, 'PNG', MARGIN, y, 40, 16);
      y += 18;
    } catch {
      /* ignore */
    }
  }

  const tech = payload.technical;
  if (hasTechnicalResponsible(tech)) {
    doc.setFont('helvetica', 'bold');
    doc.text(tech.name || 'Não informado', MARGIN, y);
    y += LINE;
    doc.setFont('helvetica', 'normal');
    if (tech.title) {
      doc.text(tech.title, MARGIN, y);
      y += LINE;
    }
    const reg = formatTechnicalRegistryLine(tech);
    if (reg !== '—') {
      doc.text(reg, MARGIN, y);
      y += LINE;
    }
  } else {
    doc.text('Responsável técnico: Não informado', MARGIN, y);
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
