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
};

export type BilateralSignatureCertificateData = {
  contractNumber: string;
  contentVersion?: number | null;
  client: SignatureCertificateData;
  provider: SignatureCertificateData;
};

const CONTENT_LINE_H = 5;

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

export function appendSignatureCertificateToPdf(
  doc: jsPDF,
  cert: SignatureCertificateData,
  margin: number,
  pageW: number,
): void {
  appendPartyCertificateBlock(doc, cert, margin, pageW, {
    title: 'CERTIFICADO DE ASSINATURA ELETRONICA',
    intro:
      'Este certificado comprova a assinatura eletronica do contrato de licenca SaaS SV LOTES, ' +
      'registrada digitalmente com validade juridica conforme a Medida Provisoria no 2.200-2/2001 e a Lei no 14.063/2020, ' +
      'contendo os metadados de autenticidade e integridade indicados abaixo.',
  });
}

export function appendBilateralSignatureCertificateToPdf(
  doc: jsPDF,
  bilateral: BilateralSignatureCertificateData,
  margin: number,
  pageW: number,
): void {
  doc.addPage();
  const contentW = pageW - margin * 2;
  drawCertificateHeader(doc, margin, pageW, 'CERTIFICADO DE ASSINATURA ELETRONICA');

  let y = 40;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const intro =
    'Este certificado registra as assinaturas eletronicas da CONTRATANTE e da CONTRATADA no contrato ' +
    `de licenca SaaS no ${bilateral.contractNumber}, com validade juridica conforme a Medida Provisoria no 2.200-2/2001, ` +
    'a Lei no 14.063/2020 e a legislacao aplicavel, incluindo hash de integridade (SHA-256) para cada signatario.';
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * CONTENT_LINE_H + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(22, 120, 72);
  doc.text(`${ELECTRONIC_SIGNATURE_BADGE} — Contratante e Contratada`, pageW / 2, y, {
    align: 'center',
  });
  y += 10;

  if (bilateral.contentVersion) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 90, 105);
    doc.text(`Versao contratual: v${bilateral.contentVersion}`, margin, y);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(45, 55, 72);
  doc.text('Dados da assinatura', margin, y);
  y += 8;

  y = renderPartyCertificateSection(
    doc,
    bilateral.client,
    margin,
    pageW,
    y,
    `CONTRATANTE — ${ELECTRONIC_SIGNATURE_BADGE}`,
  );
  y += 8;
  y = renderPartyCertificateSection(
    doc,
    bilateral.provider,
    margin,
    pageW,
    y,
    `CONTRATADA — ${ELECTRONIC_SIGNATURE_BADGE}`,
  );

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(45, 55, 72);
  doc.text('Declaracao juridica', margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(45, 55, 72);
  const declaration =
    'Este certificado foi gerado automaticamente pelo sistema SV LOTES e integra o documento assinado ' +
    'como prova de aceite eletronico dos termos contratuais, podendo ser utilizado para fins de auditoria e comprovacao de manifestacao de vontade.';
  const declarationLines = doc.splitTextToSize(declaration, contentW);
  doc.text(declarationLines, margin, y);
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

function appendPartyCertificateBlock(
  doc: jsPDF,
  cert: SignatureCertificateData,
  margin: number,
  pageW: number,
  meta: { title: string; intro: string },
) {
  doc.addPage();
  const contentW = pageW - margin * 2;
  drawCertificateHeader(doc, margin, pageW, meta.title);

  let y = 40;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const introLines = doc.splitTextToSize(meta.intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * CONTENT_LINE_H + 10;

  renderPartyCertificateSection(
    doc,
    cert,
    margin,
    pageW,
    y,
    cert.partyLabel ? `${cert.partyLabel} — ${ELECTRONIC_SIGNATURE_BADGE}` : ELECTRONIC_SIGNATURE_BADGE,
  );

  y += 110;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 110, 120);
  const footer =
    'Este certificado foi gerado automaticamente pelo sistema SV LOTES e integra o documento assinado ' +
    'como prova de aceite eletronico dos termos contratuais, podendo ser utilizado para fins de auditoria e comprovacao de manifestacao de vontade.';
  const footerLines = doc.splitTextToSize(footer, contentW);
  doc.text(footerLines, margin, y);
}

function estimateCertificateBlockHeight(doc: jsPDF, cert: SignatureCertificateData, contentW: number): number {
  let rows = 10;
  if (cert.signatureToken) rows += 1;
  if (cert.signatureId) rows += 1;
  if (cert.contentVersion) rows += 1;
  if (cert.signerAddress) rows += 1;
  if (cert.geoCity || (cert.latitude != null && cert.longitude != null)) rows += 3;
  return 18 + rows * 7;
}

function renderPartyCertificateSection(
  doc: jsPDF,
  cert: SignatureCertificateData,
  margin: number,
  pageW: number,
  startY: number,
  partyLabel: string,
): number {
  const contentW = pageW - margin * 2;
  let y = startY;
  const blockH = estimateCertificateBlockHeight(doc, cert, contentW);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 30, 55);
  doc.text(partyLabel, margin, y);
  y += 8;

  doc.setDrawColor(200, 210, 220);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, blockH, 2, 2, 'FD');
  y += 10;

  const docLabel = formatSignerDocumentFieldLabel(cert.signerDocument);
  const docValue = formatSignerDocumentDisplay(cert.signerDocument);

  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 90, 105);
    doc.text(label, margin + 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9.5);
    const valueLines = doc.splitTextToSize(value || '—', contentW - 70);
    doc.text(valueLines, margin + 58, y);
    y += Math.max(6, valueLines.length * CONTENT_LINE_H + 2);
  };

  row('Contrato no', cert.contractNumber);
  if (cert.signatureId) row('ID da assinatura', cert.signatureId);
  if (cert.contentVersion) row('Versao contratual', `v${cert.contentVersion}`);
  row('Assinado por', cert.signerName);
  row(docLabel, docValue);
  row('E-mail', cert.signerEmail?.trim() || '—');
  row('Cargo', cert.signerRole?.trim() || '—');
  if (cert.signerAddress?.trim()) row('Endereco', cert.signerAddress.trim());
  row('Endereco IP', cert.ipAddress || '—');
  row('Data da assinatura', cert.signedDate);
  row('Hora da assinatura', cert.signedTime);
  if (cert.signatureToken) {
    row('Token', maskToken(cert.signatureToken));
  }
  row('Hash de integridade (SHA-256)', cert.signatureHash);

  if (cert.geoCity?.trim()) {
    row('Local aproximado', cert.geoCity.trim());
  }
  if (cert.latitude != null && cert.longitude != null) {
    row('Latitude', String(cert.latitude));
    row('Longitude', String(cert.longitude));
  }

  return y + 6;
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
