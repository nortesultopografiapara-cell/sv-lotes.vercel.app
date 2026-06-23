/**
 * Certificado de assinatura eletrônica — anexado ao PDF do contrato SaaS.
 */

import type { jsPDF } from 'jspdf';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';
import {
  formatSignerDocumentDisplay,
  formatSignerDocumentFieldLabel,
} from '@/lib/saasContractDocumentLabel';

export const ELECTRONIC_SIGNATURE_BADGE = 'ASSINADO ELETRONICAMENTE';

/** Área reservada ao rodapé (mm) — conteúdo não deve ultrapassar pageHeight - FOOTER_RESERVED. */
const FOOTER_RESERVED = 45;
const TOP_MARGIN = 40;
const CONTENT_LINE_H = 4.2;
const ROW_GAP = 4;
const SECTION_GAP = 4;
const PARTY_LABEL_GAP = 6;
const TECHNICAL_FONT_SIZE = 8;
const FIELD_FONT_SIZE = 9;
const LABEL_FONT_SIZE = 8.5;

const TECHNICAL_FIELD_LABELS = new Set([
  'Endereco IP',
  'Token',
  'Hash de integridade (SHA-256)',
  'Latitude',
  'Longitude',
]);

export type SignatureCertificateData = {
  contractNumber: string;
  signerName: string;
  signerDocument: string;
  signerEmail?: string | null;
  signerRole?: string | null;
  signerAddress?: string | null;
  ipAddress: string;
  signedDate: string;
  signedTime: string;
  signatureHash: string;
  signatureToken?: string | null;
  signatureId?: string | null;
  contentVersion?: number | null;
  partyLabel?: 'CONTRATANTE' | 'CONTRATADA';
  geoCity?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  phone?: string | null;
  approxLocation?: string | null;
};

export type BilateralSignatureCertificateData = {
  contractNumber: string;
  contentVersion?: number | null;
  client: SignatureCertificateData;
  provider: SignatureCertificateData;
};

type CertificateLayoutContext = {
  doc: jsPDF;
  margin: number;
  pageW: number;
  pageH: number;
  contentW: number;
  y: number;
  title: string;
  contentBottom: () => number;
  ensureSpace: (need: number) => void;
  newPage: () => void;
};

export function formatSignatureDateBr(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatSignatureTimeBr(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function drawCertificateHeader(doc: jsPDF, margin: number, pageW: number, title: string) {
  doc.setFillColor(8, 15, 30);
  doc.rect(0, 0, pageW, 28, 'F');
  const logo = loadSvLotesLogoDataUrl();
  if (logo) {
    doc.addImage(logo, 'PNG', margin, 4, 20, 20);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, pageW / 2, 18, { align: 'center' });
}

function createCertificateLayout(
  doc: jsPDF,
  margin: number,
  pageW: number,
  title: string,
): CertificateLayoutContext {
  doc.addPage();
  drawCertificateHeader(doc, margin, pageW, title);

  const ctx: CertificateLayoutContext = {
    doc,
    margin,
    pageW,
    pageH: doc.internal.pageSize.getHeight(),
    contentW: pageW - margin * 2,
    y: TOP_MARGIN,
    title,
    contentBottom: () => ctx.pageH - FOOTER_RESERVED,
    ensureSpace(need: number) {
      if (ctx.y + need > ctx.contentBottom()) {
        ctx.newPage();
      }
    },
    newPage() {
      doc.addPage();
      ctx.pageH = doc.internal.pageSize.getHeight();
      drawCertificateHeader(doc, margin, pageW, title);
      ctx.y = TOP_MARGIN;
    },
  };

  return ctx;
}

function writeWrappedBlock(
  ctx: CertificateLayoutContext,
  text: string,
  opts?: { size?: number; bold?: boolean; gapAfter?: number },
): void {
  const size = opts?.size ?? 9;
  const gapAfter = opts?.gapAfter ?? 4;
  ctx.doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
  ctx.doc.setFontSize(size);
  const lines = ctx.doc.splitTextToSize(text, ctx.contentW);
  const blockH = lines.length * CONTENT_LINE_H + gapAfter;
  ctx.ensureSpace(blockH);
  ctx.doc.text(lines, ctx.margin, ctx.y);
  ctx.y += lines.length * CONTENT_LINE_H + gapAfter;
}

type CertificateRowDef = {
  label: string;
  value: string;
  technical?: boolean;
};

export function buildCertificateRows(cert: SignatureCertificateData): CertificateRowDef[] {
  const docLabel = formatSignerDocumentFieldLabel(cert.signerDocument);
  const docValue = formatSignerDocumentDisplay(cert.signerDocument);
  const rows: CertificateRowDef[] = [
    { label: 'Contrato no', value: cert.contractNumber },
  ];
  if (cert.signatureId) rows.push({ label: 'ID da assinatura', value: cert.signatureId });
  if (cert.contentVersion) rows.push({ label: 'Versao contratual', value: `v${cert.contentVersion}` });
  rows.push(
    { label: 'Assinado por', value: cert.signerName },
    { label: docLabel, value: docValue },
    { label: 'E-mail', value: cert.signerEmail?.trim() || '—' },
    { label: 'Cargo', value: cert.signerRole?.trim() || '—' },
  );
  if (cert.signerAddress?.trim()) {
    rows.push({ label: 'Endereco', value: cert.signerAddress.trim() });
  }
  rows.push(
    { label: 'Endereco IP', value: cert.ipAddress || '—', technical: true },
    { label: 'Data da assinatura', value: cert.signedDate },
    { label: 'Hora da assinatura', value: cert.signedTime },
  );
  if (cert.signatureToken) {
    rows.push({ label: 'Token', value: maskToken(cert.signatureToken), technical: true });
  }
  rows.push({
    label: 'Hash de integridade (SHA-256)',
    value: cert.signatureHash,
    technical: true,
  });
  if (cert.geoCity?.trim()) {
    rows.push({ label: 'Local aproximado', value: cert.geoCity.trim() });
  } else if (cert.approxLocation?.trim() && cert.approxLocation !== 'Não identificado') {
    rows.push({ label: 'Local aproximado', value: cert.approxLocation.trim() });
  }
  if (cert.browser?.trim() && cert.browser !== 'Não informado') {
    rows.push({ label: 'Navegador', value: cert.browser.trim() });
  }
  if (cert.os?.trim() && cert.os !== 'Não informado') {
    rows.push({ label: 'Sistema operacional', value: cert.os.trim() });
  }
  if (cert.device?.trim() && cert.device !== 'Não informado') {
    rows.push({ label: 'Dispositivo', value: cert.device.trim() });
  }
  if (cert.phone?.trim() && cert.phone !== 'Não informado') {
    rows.push({ label: 'Telefone', value: cert.phone.trim() });
  }
  if (cert.latitude != null && cert.longitude != null) {
    rows.push(
      { label: 'Latitude', value: String(cert.latitude), technical: true },
      { label: 'Longitude', value: String(cert.longitude), technical: true },
    );
  }
  return rows;
}

function measureRowHeight(
  doc: jsPDF,
  row: CertificateRowDef,
  contentW: number,
): number {
  const technical = row.technical ?? TECHNICAL_FIELD_LABELS.has(row.label);
  const valueFontSize = technical ? TECHNICAL_FONT_SIZE : FIELD_FONT_SIZE;
  doc.setFontSize(valueFontSize);
  const valueLines = doc.splitTextToSize(row.value || '—', contentW - 70);
  const lineStep = technical ? CONTENT_LINE_H : CONTENT_LINE_H + 0.2;
  return Math.max(technical ? 4.5 : 5, valueLines.length * lineStep + 1) + ROW_GAP;
}

function renderCertificateRow(
  ctx: CertificateLayoutContext,
  row: CertificateRowDef,
): void {
  const { doc, margin, contentW } = ctx;
  const technical = row.technical ?? TECHNICAL_FIELD_LABELS.has(row.label);
  const valueFontSize = technical ? TECHNICAL_FONT_SIZE : FIELD_FONT_SIZE;
  const labelFontSize = technical ? TECHNICAL_FONT_SIZE : LABEL_FONT_SIZE;

  doc.setFontSize(valueFontSize);
  const valueLines = doc.splitTextToSize(row.value || '—', contentW - 70);
  const lineStep = technical ? CONTENT_LINE_H : CONTENT_LINE_H + 0.2;
  const rowH = Math.max(technical ? 4.5 : 5, valueLines.length * lineStep + 1) + ROW_GAP;

  ctx.ensureSpace(rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(labelFontSize);
  doc.setTextColor(80, 90, 105);
  doc.text(row.label, margin + 6, ctx.y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(valueFontSize);
  doc.text(valueLines, margin + 58, ctx.y);

  ctx.y += rowH;
}

function renderPartyCertificateSection(
  ctx: CertificateLayoutContext,
  cert: SignatureCertificateData,
  partyLabel: string,
): void {
  const { doc, margin, contentW } = ctx;

  ctx.ensureSpace(10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 30, 55);
  doc.text(partyLabel, margin, ctx.y);
  ctx.y += PARTY_LABEL_GAP;

  const rows = buildCertificateRows(cert);
  const rowsHeight =
    rows.reduce((sum, row) => sum + measureRowHeight(doc, row, contentW), 0) + 8;
  const boxFitsOnPage = ctx.y + rowsHeight <= ctx.contentBottom();

  const boxStartY = ctx.y;
  if (boxFitsOnPage) {
    ctx.ensureSpace(rowsHeight + 2);
    doc.setDrawColor(200, 210, 220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, boxStartY, contentW, rowsHeight, 2, 2, 'FD');
    ctx.y = boxStartY + 5;
  } else {
    doc.setDrawColor(200, 210, 220);
    doc.line(margin, ctx.y, margin + contentW, ctx.y);
    ctx.y += 4;
  }

  for (const row of rows) {
    renderCertificateRow(ctx, row);
  }

  if (boxFitsOnPage) {
    ctx.y = Math.max(ctx.y, boxStartY + rowsHeight + 2);
  } else {
    doc.line(margin, ctx.y, margin + contentW, ctx.y);
    ctx.y += 2;
  }
}

export function appendSignatureCertificateToPdf(
  doc: jsPDF,
  cert: SignatureCertificateData,
  margin: number,
  pageW: number,
): void {
  const ctx = createCertificateLayout(doc, margin, pageW, 'CERTIFICADO DE ASSINATURA ELETRONICA');

  ctx.doc.setTextColor(30, 30, 30);
  writeWrappedBlock(
    ctx,
    'Este certificado comprova a assinatura eletronica do contrato de licenca SaaS SV LOTES, ' +
      'registrada digitalmente com validade juridica conforme a Medida Provisoria no 2.200-2/2001 e a Lei no 14.063/2020, ' +
      'contendo os metadados de autenticidade e integridade indicados abaixo.',
    { gapAfter: 6 },
  );

  renderPartyCertificateSection(
    ctx,
    cert,
    cert.partyLabel ? `${cert.partyLabel} — ${ELECTRONIC_SIGNATURE_BADGE}` : ELECTRONIC_SIGNATURE_BADGE,
  );

  ctx.y += SECTION_GAP;
  ctx.ensureSpace(20);
  ctx.doc.setFont('helvetica', 'italic');
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(100, 110, 120);
  writeWrappedBlock(
    ctx,
    'Este certificado foi gerado automaticamente pelo sistema SV LOTES e integra o documento assinado ' +
      'como prova de aceite eletronico dos termos contratuais, podendo ser utilizado para fins de auditoria e comprovacao de manifestacao de vontade.',
    { gapAfter: 0 },
  );
}

export function appendBilateralSignatureCertificateToPdf(
  doc: jsPDF,
  bilateral: BilateralSignatureCertificateData,
  margin: number,
  pageW: number,
): void {
  const ctx = createCertificateLayout(doc, margin, pageW, 'CERTIFICADO DE ASSINATURA ELETRONICA');

  ctx.doc.setTextColor(30, 30, 30);
  writeWrappedBlock(
    ctx,
    'Este certificado registra as assinaturas eletronicas da CONTRATANTE e da CONTRATADA no contrato ' +
      `de licenca SaaS no ${bilateral.contractNumber}, com validade juridica conforme a Medida Provisoria no 2.200-2/2001, ` +
      'a Lei no 14.063/2020 e a legislacao aplicavel, incluindo hash de integridade (SHA-256) para cada signatario.',
    { gapAfter: 4 },
  );

  ctx.ensureSpace(10);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(9.5);
  ctx.doc.setTextColor(22, 120, 72);
  ctx.doc.text(`${ELECTRONIC_SIGNATURE_BADGE} — Contratante e Contratada`, ctx.pageW / 2, ctx.y, {
    align: 'center',
  });
  ctx.y += 7;

  if (bilateral.contentVersion) {
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(8.5);
    ctx.doc.setTextColor(80, 90, 105);
    ctx.ensureSpace(6);
    ctx.doc.text(`Versao contratual: v${bilateral.contentVersion}`, ctx.margin, ctx.y);
    ctx.y += 5;
  }

  ctx.ensureSpace(10);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(9);
  ctx.doc.setTextColor(45, 55, 72);
  ctx.doc.text('Dados da assinatura', ctx.margin, ctx.y);
  ctx.y += 6;

  renderPartyCertificateSection(
    ctx,
    bilateral.client,
    `CONTRATANTE — ${ELECTRONIC_SIGNATURE_BADGE}`,
  );
  ctx.y += SECTION_GAP;
  renderPartyCertificateSection(
    ctx,
    bilateral.provider,
    `CONTRATADA — ${ELECTRONIC_SIGNATURE_BADGE}`,
  );

  ctx.y += SECTION_GAP;
  ctx.ensureSpace(16);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(9);
  ctx.doc.setTextColor(45, 55, 72);
  ctx.doc.text('Declaracao juridica', ctx.margin, ctx.y);
  ctx.y += 5;

  ctx.doc.setFont('helvetica', 'normal');
  ctx.doc.setFontSize(8.5);
  ctx.doc.setTextColor(45, 55, 72);
  writeWrappedBlock(
    ctx,
    'Este certificado foi gerado automaticamente pelo sistema SV LOTES e integra o documento assinado ' +
      'como prova de aceite eletronico dos termos contratuais, podendo ser utilizado para fins de auditoria e comprovacao de manifestacao de vontade.',
    { gapAfter: 0 },
  );
}

function maskToken(token?: string | null): string {
  const t = String(token || '').trim();
  if (!t) return '—';
  if (t.length <= 12) return t;
  return `${t.slice(0, 6)}…${t.slice(-6)}`;
}

export function buildProviderCertificateDefaults(): {
  legalName: string;
  tradeName: string;
} {
  return {
    legalName: SAAS_PROVIDER.legalName,
    tradeName: SAAS_PROVIDER.tradeName,
  };
}

export function buildSignatureHashPayload(input: {
  contractId: string;
  contractNumber: string;
  signerName: string;
  signerDocument: string;
  signerEmail?: string | null;
  signedAt: string;
  ipAddress: string;
  party?: 'CLIENT' | 'PROVIDER';
}): string {
  return [
    input.party || 'CLIENT',
    input.contractId,
    input.contractNumber,
    input.signerName.trim().toUpperCase(),
    input.signerDocument.replace(/\D/g, ''),
    (input.signerEmail || '').trim().toLowerCase(),
    input.signedAt,
    input.ipAddress,
  ].join('|');
}

export async function computeSignatureHash(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Versão síncrona para Node (scripts de teste). */
export function computeSignatureHashSync(payload: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
