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
  companyName: string;
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
  const viewedDate = input.viewedAt
    ? `${formatSignatureDateBr(input.viewedAt)} ${formatSignatureTimeBr(input.viewedAt)}`
    : '—';

  return `
    <div class="contract-clause contract-clause--tight" style="page-break-before: always; margin-top: 24px; border-top: 2px solid #333; padding-top: 20px;">
      <h3 style="text-align: center; font-size: 13pt; margin: 0 0 16px 0; text-transform: uppercase;">
        Certificado de Assinatura Eletrônica
      </h3>
      <p style="font-size: 10pt; margin-bottom: 14px;">
        Este certificado comprova a assinatura eletrônica do contrato de compra e venda registrada na plataforma SV LOTES,
        com validade jurídica conforme a Medida Provisória nº 2.200-2/2001 e a Lei nº 14.063/2020.
      </p>
      <table style="width: 100%; font-size: 10pt; border-collapse: collapse;">
        <tbody>
          <tr><td style="padding: 4px 8px; width: 38%; font-weight: bold;">Contrato nº</td><td style="padding: 4px 8px;">${escapeHtml(input.contractNumber)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Empreendimento</td><td style="padding: 4px 8px;">${escapeHtml(input.projectName || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Quadra / Lote</td><td style="padding: 4px 8px;">QD ${escapeHtml(input.quadra || '—')} · LT ${escapeHtml(input.lote || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Comprador</td><td style="padding: 4px 8px;">${escapeHtml(input.buyerName || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">CPF do comprador</td><td style="padding: 4px 8px;">${escapeHtml(formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Imobiliária / Vendedor</td><td style="padding: 4px 8px;">${escapeHtml(input.companyName || '—')}${input.companyCnpj ? ` — CNPJ ${escapeHtml(formatCpfCnpj(input.companyCnpj) || input.companyCnpj)}` : ''}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Representante da imobiliária</td><td style="padding: 4px 8px;">${escapeHtml(input.representativeName || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Status</td><td style="padding: 4px 8px;">${escapeHtml(input.signatureStatus || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Visualização</td><td style="padding: 4px 8px;">${escapeHtml(viewedDate)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Data da assinatura</td><td style="padding: 4px 8px;">${escapeHtml(signedDate)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Hora da assinatura</td><td style="padding: 4px 8px;">${escapeHtml(signedTime)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Endereço IP</td><td style="padding: 4px 8px;">${escapeHtml(input.ipAddress || '—')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Token de autenticação</td><td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(maskToken(input.signatureToken))}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Hash de integridade (SHA-256)</td><td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(input.signatureHash || '—')}</td></tr>
        </tbody>
      </table>
      <p style="font-size: 9pt; color: #444; margin-top: 16px; font-style: italic;">
        Documento emitido digitalmente pelo SV LOTES GIS. Este certificado integra o contrato assinado como prova de aceite eletrônico.
      </p>
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
