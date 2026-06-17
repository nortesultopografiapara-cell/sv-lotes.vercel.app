/**
 * Certificado HTML anexo ao PDF do contrato de venda quando assinado eletronicamente.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';
import { formatSignatureDateBr, formatSignatureTimeBr } from '@/lib/saasContractSignaturePdf';

export type SaleContractSignatureCertificateInput = {
  contractNumber: string;
  projectName: string;
  quadra: string;
  lote: string;
  buyerName: string;
  buyerDocument: string;
  signerEmail?: string | null;
  companyName?: string | null;
  companyCnpj?: string | null;
  representativeName?: string | null;
  signatureStatus: string;
  signedAt?: string | null;
  viewedAt?: string | null;
  ipAddress?: string | null;
  signatureToken?: string | null;
  signatureHash?: string | null;
};

export function buildSaleContractSignatureCertificateHtml(
  input: SaleContractSignatureCertificateInput,
): string {
  const signedDate = input.signedAt
    ? formatSignatureDateBr(input.signedAt)
    : '—';
  const signedTime = input.signedAt
    ? formatSignatureTimeBr(input.signedAt)
    : '—';
  const dateTimeLabel =
    input.signedAt && signedDate !== '—'
      ? `${signedDate} ${signedTime}`
      : '—';

  const lotLabel = `QD ${input.quadra || '—'} · LT ${input.lote || '—'}`;

  return `
    <div class="contract-clause contract-clause--tight" style="page-break-before: always; margin-top: 24px; border-top: 2px solid #333; padding-top: 20px;">
      <h3 style="text-align: center; font-size: 13pt; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        Certificado de Assinatura Eletrônica
      </h3>
      <table style="width: 100%; font-size: 10pt; border-collapse: collapse; margin-bottom: 16px;">
        <tbody>
          <tr><td style="padding: 4px 8px; width: 34%; font-weight: bold;">CONTRATO</td><td style="padding: 4px 8px;">${escapeHtml(input.contractNumber)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">EMPREENDIMENTO</td><td style="padding: 4px 8px;">${escapeHtml(input.projectName || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">LOTE</td><td style="padding: 4px 8px;">${escapeHtml(lotLabel)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">ASSINANTE</td><td style="padding: 4px 8px;">${escapeHtml(input.buyerName || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">CPF</td><td style="padding: 4px 8px;">${escapeHtml(formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">E-MAIL</td><td style="padding: 4px 8px;">${escapeHtml(input.signerEmail || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">IP</td><td style="padding: 4px 8px;">${escapeHtml(input.ipAddress || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">DATA E HORA</td><td style="padding: 4px 8px;">${escapeHtml(dateTimeLabel)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">TOKEN</td><td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(maskToken(input.signatureToken))}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">STATUS</td><td style="padding: 4px 8px;">${escapeHtml(input.signatureStatus || 'ASSINADO ELETRONICAMENTE')}</td></tr>
        </tbody>
      </table>
      <p style="font-size: 10pt; margin: 0 0 8px 0; font-weight: bold;">DECLARAÇÃO</p>
      <p style="font-size: 10pt; margin: 0; line-height: 1.5;">
        Este contrato foi assinado eletronicamente através da plataforma SV LOTES, com registro de identificação do signatário,
        endereço IP, data, hora, token de autenticação e demais evidências eletrônicas armazenadas pelo sistema.
      </p>
      ${
        input.signatureHash
          ? `<p style="font-size: 8pt; color: #444; margin-top: 12px; word-break: break-all;">Hash de integridade (SHA-256): ${escapeHtml(input.signatureHash)}</p>`
          : ''
      }
    </div>`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskToken(token?: string | null): string {
  const t = String(token || '').trim();
  if (!t) return '—';
  if (t.length <= 12) return t;
  return `${t.slice(0, 6)}…${t.slice(-6)}`;
}
