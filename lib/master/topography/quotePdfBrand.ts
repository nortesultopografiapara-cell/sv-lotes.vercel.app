/**
 * Identidade visual compartilhada dos PDFs de orçamento (sintético / analítico / memorial).
 */

import type jsPDF from 'jspdf';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';
import { MASTER_TOPOGRAFIA_LOGO_PATH } from '@/lib/master/config';
import {
  buildQuotePdfFooterContactLine,
  formatQuotePdfMoney,
  preserveQuotePdfUserText,
} from './quotePdfSyntheticLayout';

export const QUOTE_PDF_BRAND = {
  tradeName: 'SV Topografia & Projetos',
  primary: [29, 78, 216] as [number, number, number],
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  softFill: [239, 246, 255] as [number, number, number],
  stageFill: [226, 232, 240] as [number, number, number],
};

export function quotePdfMoney(n: number): string {
  return formatQuotePdfMoney(n);
}

export async function loadQuotePdfLogo(
  doc: jsPDF,
  x = 14,
  y = 10,
  w = 28,
  h = 14,
): Promise<boolean> {
  try {
    const res = await fetch(MASTER_TOPOGRAFIA_LOGO_PATH);
    if (!res.ok) return false;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return false;
    doc.addImage(dataUrl, 'PNG', x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

export function drawQuotePdfBrandHeader(
  doc: jsPDF,
  opts: {
    code: string;
    subtitle: string;
    marginLeft: number;
    marginRight: number;
    pageWidth: number;
  },
): number {
  const { tradeName, primary, ink, muted } = QUOTE_PDF_BRAND;
  const addressLine = `${SAAS_PROVIDER.address}, ${SAAS_PROVIDER.neighborhood} — ${SAAS_PROVIDER.city}/${SAAS_PROVIDER.state}`;

  doc.setFontSize(12);
  doc.setTextColor(...primary);
  doc.text(tradeName, 46, 14);
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(SAAS_PROVIDER.legalName, 46, 19);
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj}`, 46, 23);
  doc.text(addressLine, 46, 27);

  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(opts.subtitle, opts.pageWidth - opts.marginRight, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(...primary);
  doc.text(`Orçamento ${opts.code}`, opts.pageWidth - opts.marginRight, 19, {
    align: 'right',
  });
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, opts.pageWidth - opts.marginRight, 23, {
    align: 'right',
  });

  doc.setDrawColor(...QUOTE_PDF_BRAND.line);
  doc.setLineWidth(0.3);
  doc.line(opts.marginLeft, 31, opts.pageWidth - opts.marginRight, 31);
  return 36;
}

export function drawQuotePdfFooter(
  doc: jsPDF,
  page: number,
  totalPages: number,
  code: string,
  marginLeft: number,
  marginRight: number,
  pageWidth: number,
  pageHeight: number,
) {
  const footerContact = buildQuotePdfFooterContactLine(
    SAAS_PROVIDER as {
      phone?: string | null;
      email?: string | null;
      website?: string | null;
    },
  );
  doc.setFontSize(7);
  doc.setTextColor(...QUOTE_PDF_BRAND.muted);
  const left = footerContact
    ? `${SAAS_PROVIDER.legalName} · ${footerContact}`
    : `${SAAS_PROVIDER.legalName}`;
  doc.text(left, marginLeft, pageHeight - 8);
  doc.text(`${code} · página ${page}/${totalPages}`, pageWidth - marginRight, pageHeight - 8, {
    align: 'right',
  });
}

export function ensureQuotePdfSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  marginBottom: number,
  topAfterBreak = 16,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - marginBottom) return y;
  doc.addPage();
  return topAfterBreak;
}

export function drawQuotePdfSectionTitle(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
): number {
  doc.setFontSize(10);
  doc.setTextColor(...QUOTE_PDF_BRAND.primary);
  doc.text(title, x, y);
  return y + 5;
}

export function drawQuotePdfWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  marginBottom: number,
): number {
  const safe = preserveQuotePdfUserText(text);
  if (!safe) return y;
  const lines = doc.splitTextToSize(safe, maxWidth) as string[];
  let cursor = y;
  doc.setFontSize(8);
  doc.setTextColor(...QUOTE_PDF_BRAND.ink);
  for (const line of lines) {
    cursor = ensureQuotePdfSpace(doc, cursor, lineHeight, marginBottom);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}
