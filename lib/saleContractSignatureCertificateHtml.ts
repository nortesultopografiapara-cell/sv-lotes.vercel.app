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
  signerPhone?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  approxLocation?: string | null;
  signatureEventId?: string | null;
  validationPublicUrl?: string | null;
  vendorIpAddress?: string | null;
  vendorSignedAt?: string | null;
  vendorEmail?: string | null;
  vendorPhone?: string | null;
  vendorBrowser?: string | null;
  vendorOs?: string | null;
  vendorDevice?: string | null;
  vendorApproxLocation?: string | null;
  vendorSignatureEventId?: string | null;
  vendorSignatureHash?: string | null;
  legacyAutoVendor?: boolean;
  vendorDocumentLabel?: 'CPF' | 'CNPJ';
  certificateTitle?: string | null;
  spouseName?: string | null;
  spouseDocument?: string | null;
  spouseEmail?: string | null;
  spousePhone?: string | null;
  spouseSignedAt?: string | null;
  spouseIpAddress?: string | null;
  spouseSignatureHash?: string | null;
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
  /* Paginação: engine única (contractPaginationEngine) — sem page-break-before: always. */
  .sv-cert-official-block {
    display: block !important;
    width: 100%;
    overflow: hidden;
    margin-top: 4px !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
    page-break-before: auto !important;
    break-before: auto !important;
  }
  .sv-cert-official-block.sv-pagination-force-break {
    page-break-before: always !important;
    break-before: page !important;
  }
  .sv-cert-official-inner {
    display: block !important;
    width: 100%;
    overflow: hidden;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
  }
  .sv-cert-official {
    margin-top: 2px;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 7.5pt;
    line-height: 1.25;
    color: #1a202c;
    display: block !important;
    width: 100%;
    overflow: hidden;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
    margin-bottom: 0 !important;
  }
  .sv-cert-official .sv-cert-cards {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
    margin: 0 0 4px 0;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .sv-cert-official .sv-cert-card {
    display: block !important;
    width: auto;
    min-width: 0;
    border: 1px solid #86efac;
    border-radius: 3px;
    background: #f0fff4;
    padding: 0;
    overflow: hidden;
    box-sizing: border-box;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .sv-cert-official .sv-cert-card--full {
    grid-column: 1 / -1;
  }
  .sv-cert-official .sv-cert-card-head {
    padding: 2px 5px 1px 5px;
    text-align: center;
    border-bottom: 1px solid #bbf7d0;
  }
  .sv-cert-official .sv-cert-card-role {
    margin: 0 0 1px 0;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #14532d;
  }
  .sv-cert-official .sv-cert-card-badge {
    display: inline-block;
    background: #166534;
    color: #fff;
    border-radius: 999px;
    font-size: 5pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 1px 5px;
    text-transform: uppercase;
  }
  .sv-cert-official .sv-cert-card-body {
    padding: 2px 5px 1px 5px;
  }
  .sv-cert-official .sv-cert-field {
    display: flex;
    flex-direction: row;
    gap: 3px;
    align-items: flex-start;
    margin-bottom: 0;
  }
  .sv-cert-official .sv-cert-field-icon {
    width: 10px;
    flex-shrink: 0;
    margin-top: 0;
    color: #64748b;
    font-size: 7pt;
    line-height: 1.2;
    text-align: center;
  }
  .sv-cert-official .sv-cert-field-label {
    display: inline;
    font-size: 5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #64748b;
    margin-right: 2px;
  }
  .sv-cert-official .sv-cert-field-value {
    display: inline;
    font-size: 6.5pt;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.2;
    word-break: break-word;
  }
  .sv-cert-official .sv-cert-card-foot {
    padding: 1px 3px;
    background: #166534;
    text-align: center;
    font-size: 4.5pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #fff;
  }
  .sv-cert-official .sv-cert-validation {
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    background: #fff;
    padding: 3px 5px;
    display: block !important;
    width: 100%;
    overflow: hidden;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
  }
  .sv-cert-official .sv-cert-validation-inner {
    display: table;
    width: 100%;
    table-layout: fixed;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .sv-cert-official .sv-cert-qr {
    display: table-cell;
    vertical-align: middle;
    width: 50px;
    padding-right: 5px;
  }
  .sv-cert-official .sv-cert-qr img,
  .sv-cert-official img.sv-cert-qr {
    width: 46px;
    height: 46px;
    border: 1px solid #cbd5e1;
    border-radius: 2px;
    padding: 1px;
    background: #fff;
    display: block;
  }
  .sv-cert-official .sv-cert-validation-body {
    display: table-cell;
    vertical-align: top;
    width: auto;
  }
  .sv-cert-official .sv-cert-validation-title {
    margin: 0 0 1px 0;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #14532d;
  }
  .sv-cert-official .sv-cert-validation-row {
    margin: 0;
    font-size: 6pt;
    line-height: 1.25;
  }
  .sv-cert-official .sv-cert-validation-row strong {
    display: inline;
    font-size: 5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #64748b;
    margin-right: 3px;
  }
  .sv-cert-official .sv-cert-validation-row code,
  .sv-cert-official .sv-cert-validation-row span.value {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 5.5pt;
    color: #0f172a;
    word-break: break-all;
  }
  .sv-cert-official .sv-cert-validation-row .status-validado {
    display: inline-block;
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
    border-radius: 2px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 5.5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 0 4px;
    text-transform: uppercase;
  }
  .sv-cert-official .sv-cert-legal {
    margin: 2px 0 0 0;
    font-size: 5pt;
    line-height: 1.3;
    color: #64748b;
    text-align: center;
  }
  .contract-institutional-footer {
    margin-top: 5px !important;
    margin-bottom: 0 !important;
    padding-top: 3px;
    border-top: 1px solid #ccc;
    font-size: 7.5pt;
    color: #444;
    text-align: center;
    page-break-before: avoid;
    break-before: avoid-page;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .contract-institutional-footer p {
    margin: 0;
    line-height: 1.2;
  }
  .contract-institutional-footer p + p {
    margin-top: 1px;
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
        <span class="sv-cert-field-label">${escapeHtml(label)}:</span>
        <span class="sv-cert-field-value">${escapeHtml(value || '—')}</span>
      </div>
    </div>`;
}

function buildOfficialSignatureCard(params: {
  role: string;
  fields: Array<{ icon: string; label: string; value: string }>;
  signed?: boolean;
  fullWidth?: boolean;
}): string {
  const fieldsHtml = params.fields.map((f) => buildCertField(f.icon, f.label, f.value)).join('');
  const badge = params.signed !== false
    ? '<span class="sv-cert-card-badge">✓ ASSINADO ELETRONICAMENTE</span>'
    : '<span class="sv-cert-card-badge" style="background:#92400e;">⏳ AGUARDANDO ASSINATURA</span>';
  const fullClass = params.fullWidth ? ' sv-cert-card--full' : '';

  return `
    <div class="sv-cert-card${fullClass}">
      <div class="sv-cert-card-head">
        <p class="sv-cert-card-role">${escapeHtml(params.role)}</p>
        ${badge}
      </div>
      <div class="sv-cert-card-body">${fieldsHtml}</div>
      <div class="sv-cert-card-foot">✓ DOCUMENTO ASSINADO ELETRONICAMENTE COM VALIDADE JURÍDICA</div>
    </div>`;
}

function buildVendorCard(input: SaleContractSignatureCertificateInput): string {
  const legacyAutoVendor = Boolean(input.legacyAutoVendor);
  const vendorSigned = Boolean(input.vendorSignedAt || legacyAutoVendor);

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

  if (legacyAutoVendor) {
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
  } else {
    fields.push(
      ...buildEvidenceFields({
        email: input.vendorEmail,
        phone: input.vendorPhone,
        ipAddress: input.vendorIpAddress,
        signedAt: input.vendorSignedAt,
        browser: input.vendorBrowser,
        os: input.vendorOs,
        device: input.vendorDevice,
        approxLocation: input.vendorApproxLocation,
        signatureEventId: input.vendorSignatureEventId,
      }),
    );
  }

  return buildOfficialSignatureCard({
    role: 'PROMITENTE VENDEDOR',
    fields,
    signed: vendorSigned,
  });
}

function buildEvidenceFields(input: {
  email?: string | null;
  phone?: string | null;
  ipAddress?: string | null;
  signedAt?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  approxLocation?: string | null;
  signatureEventId?: string | null;
}): Array<{ icon: string; label: string; value: string }> {
  const fields: Array<{ icon: string; label: string; value: string }> = [];
  const email = String(input.email || '').trim();
  if (email) fields.push({ icon: '✉️', label: 'E-mail', value: email });
  const phone = String(input.phone || '').trim();
  if (phone && phone !== 'Não informado') {
    fields.push({ icon: '📱', label: 'Telefone', value: phone });
  }
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
  const browser = String(input.browser || '').trim();
  if (browser && browser !== 'Não informado') {
    fields.push({ icon: '🧭', label: 'Navegador', value: browser });
  }
  const os = String(input.os || '').trim();
  if (os && os !== 'Não informado') {
    fields.push({ icon: '💻', label: 'Sistema operacional', value: os });
  }
  const device = String(input.device || '').trim();
  if (device && device !== 'Não informado') {
    fields.push({ icon: '📲', label: 'Dispositivo', value: device });
  }
  const location = String(input.approxLocation || '').trim();
  fields.push({
    icon: '📍',
    label: 'Localização aproximada',
    value: location || 'Não identificado',
  });
  const eventId = String(input.signatureEventId || '').trim();
  fields.push({
    icon: '🔑',
    label: 'ID único da assinatura',
    value: eventId || 'Não informado',
  });
  return fields;
}

function buildSpouseCard(input: SaleContractSignatureCertificateInput): string {
  const spouseName = String(input.spouseName || '').trim();
  if (!spouseName) return '';

  const spouseDoc =
    formatCpfCnpj(input.spouseDocument || '') ||
    input.spouseDocument ||
    '—';

  const fields: Array<{ icon: string; label: string; value: string }> = [
    { icon: '👤', label: 'Nome', value: spouseName },
    { icon: '🪪', label: 'CPF', value: spouseDoc },
    ...buildEvidenceFields({
      email: input.spouseEmail,
      phone: input.spousePhone,
      ipAddress: input.spouseIpAddress,
      signedAt: input.spouseSignedAt,
      signatureEventId: null,
    }),
  ];

  return buildOfficialSignatureCard({
    role: 'CÔNJUGE ANUENTE',
    fields,
  });
}

function buildBuyerCard(input: SaleContractSignatureCertificateInput): string {
  const buyerDoc =
    formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—';

  const fields: Array<{ icon: string; label: string; value: string }> = [
    { icon: '👤', label: 'Nome', value: String(input.buyerName || '—') },
    { icon: '🪪', label: 'CPF', value: buyerDoc },
    ...buildEvidenceFields({
      email: input.signerEmail,
      phone: input.signerPhone,
      ipAddress: input.ipAddress,
      signedAt: input.signedAt,
      browser: input.browser,
      os: input.os,
      device: input.device,
      approxLocation: input.approxLocation,
      signatureEventId: input.signatureEventId || input.uniqueId,
    }),
  ];

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

/** Remove um bloco `<div>` cujo atributo `class` contém o marcador informado. */
function removeHtmlDivBlockByClassMarker(html: string, classMarker: string): string {
  const markerIdx = html.indexOf(classMarker);
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
      return html.slice(0, divStart) + html.slice(pos);
    }
  }

  return html;
}

/**
 * Extrai o rodapé institucional do corpo do contrato para reposicionar
 * após o certificado no PDF assinado (evita ficar entre assinaturas e evidências).
 */
export function extractContractInstitutionalFooter(html: string): {
  html: string;
  footerHtml: string;
} {
  for (const marker of [
    'class="contract-institutional-footer"',
    'class="contract-footer"',
  ]) {
    const markerIdx = html.indexOf(marker);
    if (markerIdx < 0) continue;
    const divStart = html.lastIndexOf('<div', markerIdx);
    if (divStart < 0) continue;

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
        const footerHtml = html.slice(divStart, pos);
        // Normaliza classe legada para o seletor institucional.
        const normalized = footerHtml.includes('contract-institutional-footer')
          ? footerHtml
          : footerHtml.replace(
              'class="contract-footer"',
              'class="contract-institutional-footer"',
            );
        return {
          html: html.slice(0, divStart) + html.slice(pos),
          footerHtml: normalized,
        };
      }
    }
  }
  return { html, footerHtml: '' };
}

/** Remove blocos de assinatura manual de todos os modelos (PDF assinado eletronicamente). */
export function stripManualContractSignaturesForSignedPdf(html: string): string {
  let result = html;
  for (const marker of ['class="contract-signatures', 'class="sv2-signatures']) {
    result = removeHtmlDivBlockByClassMarker(result, marker);
  }
  return result;
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
    input.validationPublicUrl,
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
    ? `<div class="sv-cert-qr"><img src="${escapeHtml(input.qrCodeDataUrl)}" alt="QR Code" class="sv-cert-qr" /></div>`
    : '';

  return `
    ${CERT_STYLES}
    <div class="sv-cert-official-block">
    <div class="sv-cert-official-inner">
    <div class="sv-cert-official">
      <div class="sv-cert-cards">
        ${buildVendorCard(input)}
        ${buildBuyerCard(input)}
        ${input.spouseName ? buildSpouseCard(input) : ''}
      </div>

      <div class="sv-cert-validation">
        <div class="sv-cert-validation-inner">
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
            &nbsp;·&nbsp;
            <strong>Status</strong>
            <span class="status-validado">VALIDADO</span>
            &nbsp;·&nbsp;
            <strong>Tipo de certificado</strong>
            <span class="value">Assinatura Eletrônica SV LOTES — MP 2.200-2/2001</span>
          </div>
        </div>
        </div>
      </div>

      <p class="sv-cert-legal">
        Documento assinado eletronicamente conforme MP 2.200-2/2001 e Lei 14.063/2020. Autenticidade verificável pelo QR Code ou pelos dados acima.
      </p>
    </div>
    </div>
    </div>`;
}
