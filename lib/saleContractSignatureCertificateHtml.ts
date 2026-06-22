/**
 * Certificado digital de assinatura — contratos de compra e venda.
 * Camada visual profissional; preserva tokens, hash, IP, histórico e demais evidências.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';
import { formatSignatureDateBr, formatSignatureTimeBr } from '@/lib/saasContractSignaturePdf';
import type { SignatureHistoryEvent } from '@/lib/saleContractSignatureService';
import {
  SALE_CONTRACT_SIGNATURE_CERTIFICATE_SUBTITLE,
  SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE,
} from '@/lib/saleContractSignatureVerify';

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
  /** Data de criação/emissão do contrato. */
  issuedAt?: string | null;
  /** Versão do documento (regenerações). */
  documentVersion?: number | string | null;
  /** Identificador único da assinatura (UUID). */
  uniqueId?: string | null;
  /** URL pública de validação (/sign/sale/{token}). */
  publicUrl?: string | null;
  /** @deprecated Use publicUrl */
  verifyUrl?: string | null;
  /** Link público de assinatura (fallback enquanto /verify não existir). */
  signatureUrl?: string | null;
  /** Data URL do QR Code (PNG). */
  qrCodeDataUrl?: string | null;
  /** Logo da empresa (base64 data URL ou URL pública). */
  logoSrc?: string | null;
  /** Histórico de eventos da assinatura. */
  historyEvents?: SignatureHistoryEvent[];
  /** IP do vendedor, quando disponível. */
  vendorIpAddress?: string | null;
  /** Data/hora da assinatura do vendedor, quando disponível. */
  vendorSignedAt?: string | null;
  /** @deprecated Título unificado — ignorado se vazio; mantido por compatibilidade. */
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
  .sv-contract-document .e-signatures-page {
    page-break-inside: avoid;
    break-inside: avoid-page;
    margin-top: 20px;
    margin-bottom: 0;
  }
  .sv-contract-document .e-signatures-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 14px;
  }
  .sv-contract-document .e-sign-card {
    border: 1px solid #c5d0dc;
    border-radius: 8px;
    background: #f7fafc;
    padding: 16px 18px;
    page-break-inside: avoid;
    break-inside: avoid-page;
    text-align: left;
  }
  .sv-contract-document .e-sign-badge {
    display: inline-block;
    background: #e8f5ee;
    color: #167848;
    border: 1px solid #b8dfc8;
    border-radius: 999px;
    font-size: 8.5pt;
    font-weight: bold;
    letter-spacing: 0.03em;
    padding: 4px 10px;
    margin-bottom: 12px;
  }
  .sv-contract-document .e-sign-role {
    margin: 0 0 6px 0;
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #4a5568;
    letter-spacing: 0.04em;
  }
  .sv-contract-document .e-sign-name {
    margin: 0 0 10px 0;
    font-size: 12pt;
    font-weight: bold;
    color: #1a202c;
    line-height: 1.3;
  }
  .sv-contract-document .e-sign-field {
    margin: 0 0 6px 0;
    font-size: 10pt;
    line-height: 1.45;
    color: #2d3748;
  }
  .sv-contract-document .e-sign-field strong {
    color: #1a202c;
  }
  .sv-contract-document .e-sign-status {
    margin: 10px 0 0 0;
    font-size: 9.5pt;
    font-weight: bold;
    color: #167848;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sv-contract-document .sv-cert-compact {
    margin-top: 16px;
    padding: 12px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 8.5pt;
    line-height: 1.4;
    color: #1e293b;
    page-break-inside: avoid;
    break-inside: avoid-page;
    page-break-before: avoid;
    break-before: avoid-page;
  }
  .sv-contract-document .sv-cert-compact-title {
    margin: 0 0 2px 0;
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1e40af;
    text-align: center;
  }
  .sv-contract-document .sv-cert-compact-subtitle {
    margin: 0 0 10px 0;
    font-size: 8pt;
    color: #64748b;
    text-align: center;
  }
  .sv-contract-document .sv-cert-compact-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }
  .sv-contract-document .sv-cert-compact-party {
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #fff;
    padding: 8px 10px;
  }
  .sv-contract-document .sv-cert-compact-party-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-weight: 700;
    font-size: 8pt;
    text-transform: uppercase;
    color: #334155;
  }
  .sv-contract-document .sv-cert-compact-status {
    font-size: 7.5pt;
    font-weight: 700;
    color: #166534;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sv-contract-document .sv-cert-compact-status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    margin-right: 3px;
    vertical-align: middle;
  }
  .sv-contract-document .sv-cert-compact-line {
    margin: 0 0 3px 0;
    font-size: 8pt;
    color: #475569;
  }
  .sv-contract-document .sv-cert-compact-line strong {
    color: #334155;
  }
  .sv-contract-document .sv-cert-compact-meta {
    margin: 0 0 8px 0;
    padding: 6px 8px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 8pt;
  }
  .sv-contract-document .sv-cert-compact-meta span {
    display: inline-block;
    margin-right: 12px;
  }
  .sv-contract-document .sv-cert-compact-security {
    margin: 0 0 8px 0;
    font-size: 7.5pt;
    word-break: break-all;
  }
  .sv-contract-document .sv-cert-compact-security p {
    margin: 0 0 4px 0;
  }
  .sv-contract-document .sv-cert-compact-security code {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 7pt;
    color: #1e293b;
  }
  .sv-contract-document .sv-cert-compact-qr-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .sv-contract-document .sv-cert-compact-qr {
    width: 68px;
    height: 68px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 2px;
    background: #fff;
    display: block;
  }
  .sv-contract-document .sv-cert-compact-url-label {
    margin: 0 0 2px 0;
    font-size: 7.5pt;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
  }
  .sv-contract-document .sv-cert-compact-url {
    margin: 0;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 7pt;
    word-break: break-all;
    color: #1e293b;
  }
  .sv-contract-document .sv-cert-compact-footer {
    margin: 0;
    padding-top: 6px;
    border-top: 1px solid #e2e8f0;
    font-size: 7.5pt;
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

function formatSignedDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatSignatureDateBr(iso);
  const time = formatSignatureTimeBr(iso);
  if (date === '—') return '—';
  return `${date} ${time}`;
}

function buildCompactPartyBlock(params: {
  role: string;
  name: string;
  documentLabel: string;
  document: string;
  ip?: string | null;
  signedAt?: string | null;
}): string {
  return `
    <div class="sv-cert-compact-party">
      <div class="sv-cert-compact-party-head">
        <span>${escapeHtml(params.role)}</span>
        <span class="sv-cert-compact-status"><span class="sv-cert-compact-status-dot"></span>ASSINADO</span>
      </div>
      <p class="sv-cert-compact-line"><strong>Nome:</strong> ${escapeHtml(params.name)}</p>
      <p class="sv-cert-compact-line"><strong>${escapeHtml(params.documentLabel)}:</strong> ${escapeHtml(params.document)}</p>
      <p class="sv-cert-compact-line"><strong>IP:</strong> ${escapeHtml(params.ip || '—')}</p>
      <p class="sv-cert-compact-line"><strong>Data/Hora:</strong> ${escapeHtml(formatSignedDateTime(params.signedAt))}</p>
    </div>`;
}

function buildElectronicSignatureCard(params: {
  role: string;
  name: string;
  representative?: string | null;
  documentLabel: string;
  document: string;
  signedAt?: string | null;
  status: string;
}): string {
  const repBlock = params.representative
    ? `<p class="e-sign-field"><strong>Representante:</strong><br/>${escapeHtml(params.representative)}</p>`
    : '';

  return `
    <div class="e-sign-card">
      <div class="e-sign-badge">✓ ASSINADO ELETRONICAMENTE</div>
      <p class="e-sign-role">${escapeHtml(params.role)}</p>
      <p class="e-sign-name">${escapeHtml(params.name)}</p>
      ${repBlock}
      <p class="e-sign-field"><strong>${escapeHtml(params.documentLabel)}:</strong> ${escapeHtml(params.document || '—')}</p>
      <p class="e-sign-field"><strong>Data/Hora da assinatura:</strong><br/>${escapeHtml(formatSignedDateTime(params.signedAt))}</p>
      <p class="e-sign-status">Status: ${escapeHtml(params.status)}</p>
    </div>`;
}

export function buildSaleContractElectronicSignaturesPageHtml(
  input: SaleContractElectronicSignaturesInput,
): string {
  const status = input.signatureStatus || 'ASSINADO ELETRONICAMENTE';
  const vendorDocLabel = input.vendorDocumentLabel || 'CNPJ';
  const vendorDoc =
    formatCpfCnpj(input.vendorDocument || '') || input.vendorDocument || '—';

  return `
    ${CERT_STYLES}
    <div class="contract-clause contract-clause--tight e-signatures-page">
      <div class="e-signatures-grid">
        ${buildElectronicSignatureCard({
          role: 'PROMITENTE VENDEDOR',
          name: input.vendorName,
          representative: input.vendorRepresentative,
          documentLabel: vendorDocLabel,
          document: vendorDoc,
          signedAt: input.signedAt,
          status,
        })}
        ${buildElectronicSignatureCard({
          role: 'PROMISSÁRIO COMPRADOR',
          name: input.buyerName,
          documentLabel: 'CPF',
          document: formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—',
          signedAt: input.signedAt,
          status,
        })}
      </div>
    </div>`;
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

/** Gera certificado com QR Code (data URL) para PDF assinado. */
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
    qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 140 });
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

  const vendorDoc = input.representativeCpf
    ? formatCpfCnpj(input.representativeCpf) || input.representativeCpf
    : formatCpfCnpj(input.companyCnpj || '') || input.companyCnpj || '—';

  const vendorName = input.representativeName
    ? `${input.companyName || '—'} — ${input.representativeName}`
    : input.companyName || '—';

  const vendorDocLabel = input.representativeCpf ? 'CPF' : 'CNPJ';
  const buyerDoc = formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—';
  const publicUrl = String(
    input.publicUrl || input.verifyUrl || input.signatureUrl || '',
  ).trim();
  const tokenFull = String(input.signatureToken || '').trim() || '—';
  const hashFull = String(input.signatureHash || '').trim() || '—';

  const qrBlock = input.qrCodeDataUrl
    ? `<img src="${escapeHtml(input.qrCodeDataUrl)}" alt="QR Code" class="sv-cert-compact-qr" />`
    : '';

  return `
    ${CERT_STYLES}
    <div class="contract-clause contract-clause--tight sv-cert-compact">
      <h3 class="sv-cert-compact-title">${escapeHtml(title)}</h3>
      <p class="sv-cert-compact-subtitle">${escapeHtml(SALE_CONTRACT_SIGNATURE_CERTIFICATE_SUBTITLE)}</p>

      <div class="sv-cert-compact-parties">
        ${buildCompactPartyBlock({
          role: 'Vendedor',
          name: vendorName,
          documentLabel: vendorDocLabel,
          document: vendorDoc,
          ip: input.vendorIpAddress,
          signedAt: input.vendorSignedAt || input.signedAt,
        })}
        ${buildCompactPartyBlock({
          role: 'Comprador',
          name: input.buyerName || '—',
          documentLabel: 'CPF',
          document: buyerDoc,
          ip: input.ipAddress,
          signedAt: input.signedAt,
        })}
      </div>

      <div class="sv-cert-compact-meta">
        <span><strong>Contrato nº</strong> ${escapeHtml(input.contractNumber)}</span>
        <span><strong>Empreendimento</strong> ${escapeHtml(input.projectName || '—')}</span>
        <span><strong>Quadra</strong> ${escapeHtml(input.quadra || '—')}</span>
        <span><strong>Lote</strong> ${escapeHtml(input.lote || '—')}</span>
      </div>

      <div class="sv-cert-compact-security">
        <p><strong>Hash SHA-256</strong><br/><code>${escapeHtml(hashFull)}</code></p>
        <p><strong>Token</strong><br/><code>${escapeHtml(tokenFull)}</code></p>
      </div>

      <div class="sv-cert-compact-qr-row">
        ${qrBlock}
        <div>
          <p class="sv-cert-compact-url-label">URL pública</p>
          <p class="sv-cert-compact-url">${escapeHtml(publicUrl || '—')}</p>
        </div>
      </div>

      <p class="sv-cert-compact-footer">
        A autenticidade deste documento pode ser confirmada pelo QR Code ou pela URL acima.
      </p>
    </div>`;
}
