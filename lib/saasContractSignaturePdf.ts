/**
 * Certificado de assinatura eletrônica — anexado ao PDF do contrato SaaS.
 */

import type { jsPDF } from 'jspdf';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import { formatCpfCnpj } from '@/lib/inputMasks';

export type SignatureCertificateData = {
  contractNumber: string;
  signerName: string;
  signerDocument: string;
  signerEmail?: string | null;
  signerRole?: string | null;
  ipAddress: string;
  signedDate: string;
  signedTime: string;
  signatureHash: string;
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
  doc.addPage();
  const contentW = pageW - margin * 2;

  doc.setFillColor(8, 15, 30);
  doc.rect(0, 0, pageW, 28, 'F');

  const logo = loadSvLotesLogoDataUrl();
  if (logo) {
    doc.addImage(logo, 'PNG', margin, 4, 20, 20);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CERTIFICADO DE ASSINATURA', pageW / 2, 18, { align: 'center' });

  let y = 40;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const intro =
    'O documento abaixo certifica a assinatura eletrônica do contrato de licença SaaS SV LOTES, ' +
    'registrada digitalmente com os metadados de autenticidade indicados neste certificado.';
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * CONTENT_LINE_H + 10;

  doc.setDrawColor(200, 210, 220);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, 72, 2, 2, 'FD');
  y += 10;

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

  row('Contrato nº', cert.contractNumber);
  row('Assinado por', cert.signerName);
  row('CPF', formatCpfCnpj(cert.signerDocument) || cert.signerDocument);
  if (cert.signerEmail) row('E-mail', cert.signerEmail);
  if (cert.signerRole) row('Cargo', cert.signerRole);
  row('IP', cert.ipAddress || '—');
  row('Data', cert.signedDate);
  row('Hora', cert.signedTime);
  row('Hash', cert.signatureHash);

  y += 12;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 110, 120);
  const footer =
    'Este certificado foi gerado automaticamente pelo sistema SV LOTES e integra o documento assinado ' +
    'como prova de aceite eletrônico dos termos contratuais.';
  const footerLines = doc.splitTextToSize(footer, contentW);
  doc.text(footerLines, margin, y);
}

export function buildSignatureHashPayload(input: {
  contractId: string;
  contractNumber: string;
  signerName: string;
  signerDocument: string;
  signerEmail?: string | null;
  signedAt: string;
  ipAddress: string;
}): string {
  return [
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
