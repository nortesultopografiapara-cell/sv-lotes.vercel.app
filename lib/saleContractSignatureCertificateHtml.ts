/**
 * Certificado Digital de Assinatura SV LOTES — layout oficial unificado.
 * Aplicado globalmente a todos os modelos de contrato de venda assinado.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';
import { formatSignatureDateBr, formatSignatureTimeBr } from '@/lib/saasContractSignaturePdf';
import type { SignatureHistoryEvent } from '@/lib/saleContractSignatureService';
import { SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE } from '@/lib/saleContractSignatureVerify';

export type { SignatureHistoryEvent };

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
  representativeCpf?: string | null;
  signatureStatus: string;
  signedAt?: string | null;
  viewedAt?: string | null;
  ipAddress?: string | null;
  signatureToken?: string | null;
  signatureHash?: string | null;
  issuedAt?: string | null;
  documentVersion?: number | string | null;
  uniqueId?: string | null;
  publicUrl?: string | null;
  verifyUrl?: string | null;
  signatureUrl?: string | null;
  qrCodeDataUrl?: string | null;
  logoSrc?: string | null;
  historyEvents?: SignatureHistoryEvent[];
  vendorIpAddress?: string | null;
  vendorSignedAt?: string | null;
  vendorDocumentLabel?: 'CPF' | 'CNPJ';
  certificateTitle?: string | null;
};

export type SaleContractElectronicSignaturesInput = {
  vendorName: string;
  vendorRepresentative?: string | null;
  vendorDocument?: string | null;
  vendorDocumentLabel?: 'CPF' | 'CNPJ';
  buyerName: string;
  buyerDocument: string;
  signedAt?: string | null;
  signatureStatus?: string;
};

const CERT_STYLES = `
<style type="text/css">
  .sv-cert-official {
    margin-top: 18px;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.4;
    color: #1a202c;
    page-break-inside: avoid;
    break-inside: avoid-page;
    page-break-before: avoid;
    break-before: avoid-page;
  }
  .sv-cert-official .sv-cert-cards {
    display: flex;
    flex-direction: row;
    gap: 14px;
    align-items: stretch;
    margin-bottom: 14px;
  }
  .sv-cert-official .sv-cert-card {
    flex: 1 1 0;
    border: 1.5px solid #86efac;
    border-radius: 8px;
    background: #f0fff4;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 220px;
    box-sizing: border-box;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-cert-official .sv-cert-card-head {
    padding: 10px 12px 8px 12px;
    text-align: center;
    border-bottom: 1px solid #bbf7d0;
  }
  .sv-cert-official .sv-cert-card-role {
    margin: 0 0 8px 0;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #14532d;
  }
  .sv-cert-official .sv-cert-card-badge {
    display: inline-block;
    background: #166534;
    color: #fff;
    border-radius: 999px;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 4px 12px;
    text-transform: uppercase;
  }
  .sv-cert-official .sv-cert-card-body {
    padding: 10px 12px 8px 12px;
    flex: 1 1 auto;
  }
  .sv-cert-official .sv-cert-field {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .sv-cert-official .sv-cert-field-icon {
    width: 16px;
    flex-shrink: 0;
    margin-top: 2px;
    color: #64748b;
    font-size: 11pt;
    line-height: 1;
    text-align: center;
  }
  .sv-cert-official .sv-cert-field-label {
    display: block;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 1px;
  }
  .sv-cert-official .sv-cert-field-value {
    display: block;
    font-size: 9pt;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.35;
  }
  .sv-cert-official .sv-cert-card-foot {
    margin-top: auto;
    padding: 7px 10px;
    background: #166534;
    text-align: center;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #fff;
  }
  .sv-cert-official .sv-cert-validation {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    padding: 12px;
    display: flex;
    flex-direction: row;
    gap: 14px;
    align-items: flex-start;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-cert-official .sv-cert-qr {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 3px;
    background: #fff;
    display: block;
  }
  .sv-cert-official .sv-cert-validation-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .sv-cert-official .sv-cert-validation-title {
    margin: 0 0 8px 0;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #14532d;
  }
  .sv-cert-official .sv-cert-validation-row {
    margin: 0 0 5px 0;
    font-size: 7.5pt;
    line-height: 1.45;
  }
  .sv-cert-official .sv-cert-validation-row strong {
    display: block;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 1px;
  }
  .sv-cert-official .sv-cert-validation-row code,
  .sv-cert-official .sv-cert-validation-row span.value {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 7pt;
    color: #0f172a;
    word-break: break-all;
  }
  .sv-cert-official .sv-cert-validation-row .status-validado {
    display: inline-block;
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
    border-radius: 4px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    text-transform: uppercase;
  }
  .sv-cert-official .sv-cert-legal {
    margin: 10px 0 0 0;
    font-size: 7pt;
    line-height: 1.5;
    color: #64748b;
    text-align: center;
  }
</style>`;

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSignedDateTimeBr(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatSignatureDateBr(iso);
  const time = formatSignatureTimeBr(iso);
  if (date === '—') return '—';
  return `${date} ${time} (BRT)`;
}

function hasRealIp(ip?: string | null): boolean {
  const value = String(ip ?? '').trim();
  return Boolean(value && value !== '—');
}

function buildCertField(icon: string, label: string, value: string): string {
  return `
    <div class="sv-cert-field">
      <span class="sv-cert-field-icon">${icon}</span>
      <div>
        <span class="sv-cert-field-label">${escapeHtml(label)}</span>
        <span class="sv-cert-field-value">${escapeHtml(value || '—')}</span>
      </div>
    </div>`;
}

function buildOfficialSignatureCard(params: {
  role: string;
  fields: Array<{ icon: string; label: string; value: string }>;
}): string {
  const fieldsHtml = params.fields.map((f) => buildCertField(f.icon, f.label, f.value)).join('');

  return `
    <div class="sv-cert-card">
      <div class="sv-cert-card-head">
        <p class="sv-cert-card-role">${escapeHtml(params.role)}</p>
        <span class="sv-cert-card-badge">✓ ASSINADO ELETRONICAMENTE</span>
      </div>
      <div class="sv-cert-card-body">${fieldsHtml}</div>
      <div class="sv-cert-card-foot">✓ DOCUMENTO ASSINADO ELETRONICAMENTE COM VALIDADE JURÍDICA</div>
    </div>`;
}

function buildVendorCard(input: SaleContractSignatureCertificateInput): string {
  const vendorDoc = input.representativeCpf
    ? formatCpfCnpj(input.representativeCpf) || input.representativeCpf
    : formatCpfCnpj(input.companyCnpj || '') || input.companyCnpj || '—';

  const docLabel = input.representativeCpf
    ? 'CPF'
    : input.vendorDocumentLabel === 'CPF'
      ? 'CPF'
      : 'CNPJ';

  const fields: Array<{ icon: string; label: string; value: string }> = [
    { icon: '🏢', label: 'Empresa', value: String(input.companyName || '—') },
  ];

  const rep = String(input.representativeName || '').trim();
  if (rep && rep.toLowerCase() !== 'não informado') {
    fields.push({ icon: '👤', label: 'Representante', value: rep });
  }

  fields.push({ icon: '🪪', label: docLabel, value: vendorDoc });

  if (hasRealIp(input.vendorIpAddress)) {
    fields.push({
      icon: '🌐',
      label: 'IP da assinatura',
      value: String(input.vendorIpAddress).trim(),
    });
  }

  fields.push({
    icon: '📅',
    label: 'Data e hora da assinatura',
    value: formatSignedDateTimeBr(input.vendorSignedAt || input.signedAt),
  });

  return buildOfficialSignatureCard({
    role: 'PROMITENTE VENDEDOR',
    fields,
  });
}

function buildBuyerCard(input: SaleContractSignatureCertificateInput): string {
  const buyerDoc =
    formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—';

  const fields: Array<{ icon: string; label: string; value: string }> = [
    { icon: '👤', label: 'Nome', value: String(input.buyerName || '—') },
    { icon: '🪪', label: 'CPF', value: buyerDoc },
  ];

  if (hasRealIp(input.ipAddress)) {
    fields.push({
      icon: '🌐',
      label: 'IP da assinatura',
      value: String(input.ipAddress).trim(),
    });
  }

  fields.push({
    icon: '📅',
    label: 'Data e hora da assinatura',
    value: formatSignedDateTimeBr(input.signedAt),
  });

  return buildOfficialSignatureCard({
    role: 'PROMISSÁRIO COMPRADOR',
    fields,
  });
}

/** @deprecated Cartões integrados ao certificado oficial — retorna vazio para evitar duplicação. */
export function buildSaleContractElectronicSignaturesPageHtml(
  _input: SaleContractElectronicSignaturesInput,
): string {
  return '';
}

/** Substitui o bloco `.contract-signatures` no HTML do contrato (somente PDF assinado). */
export function replaceContractSignaturesBlock(html: string, replacement: string): string {
  const marker = 'class="contract-signatures';
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) return html;

  const divStart = html.lastIndexOf('<div', markerIdx);
  if (divStart < 0) return html;

  let depth = 1;
  let pos = divStart + 4;

  while (pos < html.length) {
    const openAt = html.indexOf('<div', pos);
    const closeAt = html.indexOf('</div>', pos);
    if (closeAt === -1) break;

    if (openAt !== -1 && openAt < closeAt) {
      depth += 1;
      pos = openAt + 4;
      continue;
    }

    pos = closeAt + 6;
    depth -= 1;
    if (depth === 0) {
      return html.slice(0, divStart) + replacement + html.slice(pos);
    }
  }

  return html;
}

export async function buildSaleContractSignatureCertificateHtmlWithQr(
  input: SaleContractSignatureCertificateInput,
): Promise<string> {
  const {
    resolveSaleContractCertificatePublicUrl,
    resolveSaleContractCertificateQrUrl,
  } = await import('@/lib/saleContractSignatureVerify');

  let qrCodeDataUrl = input.qrCodeDataUrl || null;
  const token = String(input.signatureToken || '').trim();
  const publicUrl = resolveSaleContractCertificatePublicUrl(
    token,
    input.signatureUrl || input.publicUrl || input.verifyUrl,
  );

  if (!qrCodeDataUrl && (token || publicUrl)) {
    const QRCode = await import('qrcode');
    const qrUrl = resolveSaleContractCertificateQrUrl(token, publicUrl);
    qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 160 });
  }

  return buildSaleContractSignatureCertificateHtml({
    ...input,
    publicUrl: publicUrl || input.publicUrl,
    qrCodeDataUrl,
  });
}

export function buildSaleContractSignatureCertificateHtml(
  input: SaleContractSignatureCertificateInput,
): string {
  const title =
    String(input.certificateTitle || '').trim() ||
    SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE;

  const publicUrl = String(
    input.publicUrl || input.verifyUrl || input.signatureUrl || '',
  ).trim();
  const tokenFull = String(input.signatureToken || input.uniqueId || '').trim() || '—';
  const hashFull = String(input.signatureHash || '').trim() || '—';
  const issuedAt = formatSignedDateTimeBr(input.signedAt || input.issuedAt);

  const qrBlock = input.qrCodeDataUrl
    ? `<img src="${escapeHtml(input.qrCodeDataUrl)}" alt="QR Code" class="sv-cert-qr" />`
    : '';

  return `
    ${CERT_STYLES}
    <div class="contract-clause contract-clause--tight sv-cert-official">
      <div class="sv-cert-cards">
        ${buildVendorCard(input)}
        ${buildBuyerCard(input)}
      </div>

      <div class="sv-cert-validation">
        ${qrBlock}
        <div class="sv-cert-validation-body">
          <h3 class="sv-cert-validation-title">${escapeHtml(title)}</h3>
          <div class="sv-cert-validation-row">
            <strong>Hash do documento (SHA-256)</strong>
            <code>${escapeHtml(hashFull)}</code>
          </div>
          <div class="sv-cert-validation-row">
            <strong>Token de assinatura</strong>
            <code>${escapeHtml(tokenFull)}</code>
          </div>
          <div class="sv-cert-validation-row">
            <strong>URL pública</strong>
            <span class="value">${escapeHtml(publicUrl || '—')}</span>
          </div>
          <div class="sv-cert-validation-row">
            <strong>Emitido em</strong>
            <span class="value">${escapeHtml(issuedAt)}</span>
          </div>
          <div class="sv-cert-validation-row">
            <strong>Status</strong>
            <span class="status-validado">VALIDADO</span>
          </div>
          <div class="sv-cert-validation-row">
            <strong>Tipo de certificado</strong>
            <span class="value">Assinatura Eletrônica SV LOTES — MP 2.200-2/2001</span>
          </div>
        </div>
      </div>

      <p class="sv-cert-legal">
        Este documento foi assinado eletronicamente com certificado digital conforme MP 2.200-2/2001 e Lei 14.063/2020.
        A autenticidade pode ser verificada através do QR Code ou dos dados acima.
      </p>
    </div>`;
}
