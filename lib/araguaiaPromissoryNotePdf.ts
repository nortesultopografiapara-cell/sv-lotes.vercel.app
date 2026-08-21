/**
 * PDF A4 da Nota Promissória ARAGUAIA (jsPDF) — sem e-sign.
 */

import { jsPDF } from 'jspdf';
import type { PromissoryNoteDraft } from '@/lib/araguaiaPromissoryNote';

const PAGE_W = 210;
const MARGIN_X = 20;
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [71, 85, 105];

function wrap(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(text, maxW) as string[];
}

export function buildPromissoryNoteFilename(input: {
  contractNumber: string;
  version: number;
}): string {
  const num = String(input.contractNumber || 'contrato')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 60);
  return `nota-promissoria_${num}_v${input.version}.pdf`;
}

export function buildPromissoryNotePdfBytes(draft: PromissoryNoteDraft): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const maxW = PAGE_W - MARGIN_X * 2;
  let y = 28;

  doc.setTextColor(...TEXT);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('NOTA PROMISSÓRIA', PAGE_W / 2, y, { align: 'center' });
  y += 10;

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  doc.text(`Nota Promissória nº ${draft.promissoryNoteNumber}`, PAGE_W / 2, y, {
    align: 'center',
  });
  y += 7;
  doc.setFontSize(11);
  doc.text(`Contrato nº ${draft.contractNumber}`, PAGE_W / 2, y, {
    align: 'center',
  });
  y += 14;

  doc.setDrawColor(100, 116, 139);
  doc.roundedRect(MARGIN_X, y, maxW, 32, 1, 1);
  let boxY = y + 7;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text(`Valor: ${draft.amountFmt}`, MARGIN_X + 4, boxY);
  boxY += 6;
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  for (const line of wrap(doc, `(${draft.amountExtenso})`, maxW - 8)) {
    doc.text(line, MARGIN_X + 4, boxY);
    boxY += 5;
  }
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(`Vencimento: ${draft.dueDateFmt}`, MARGIN_X + 4, boxY);
  boxY += 6;
  doc.text(`Pagável em: ${draft.payableAt}`, MARGIN_X + 4, boxY);
  y += 40;

  const body =
    `Aos ${draft.dueDateLong}, pagarei(emos), por esta única via de NOTA PROMISSÓRIA, a ${draft.favorecidosPhrase}, ou à sua ordem ou a quem autorizar, a quantia de ${draft.amountFmt} (${draft.amountExtenso}), em moeda corrente nacional.`;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  for (const line of wrap(doc, body, maxW)) {
    doc.text(line, MARGIN_X, y);
    y += 6;
  }
  y += 8;

  doc.setTextColor(...MUTED);
  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  for (const line of wrap(doc, draft.clauseReference, maxW)) {
    doc.text(line, MARGIN_X, y);
    y += 5;
  }
  y += 12;

  doc.setTextColor(...TEXT);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('EMITENTE', MARGIN_X, y);
  y += 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const emitenteLines = [
    `Nome: ${draft.buyer.name}`,
    `CPF: ${draft.buyer.cpf}`,
    draft.buyer.rg ? `RG: ${draft.buyer.rg}` : null,
    draft.buyer.address ? `Endereço: ${draft.buyer.address}` : null,
    draft.buyer.qualification
      ? `Qualificação: ${draft.buyer.qualification}`
      : null,
  ].filter(Boolean) as string[];
  for (const line of emitenteLines) {
    for (const wrapped of wrap(doc, line, maxW)) {
      doc.text(wrapped, MARGIN_X, y);
      y += 6;
    }
  }

  y = Math.max(y + 28, 230);
  const signW = 70;
  const signX = (PAGE_W - signW) / 2;
  doc.setDrawColor(17, 24, 39);
  doc.line(signX, y, signX + signW, y);
  y += 6;
  doc.setFontSize(10);
  doc.text('Assinatura do Emitente', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.text(draft.buyer.name, PAGE_W / 2, y, { align: 'center' });

  const ab = doc.output('arraybuffer') as ArrayBuffer;
  return new Uint8Array(ab);
}
