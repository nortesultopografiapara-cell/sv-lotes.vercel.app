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
  .sv-contract-document .sv-cert-page {
    page-break-before: always;
    break-before: page;
    margin-top: 0;
    padding: 0;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1a202c;
  }
  .sv-contract-document .sv-cert-frame {
    border: 2px solid #2563eb;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    page-break-inside: avoid;
  }
  .sv-contract-document .sv-cert-header {
    background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
    color: #fff;
    padding: 18px 22px 16px 22px;
    text-align: center;
  }
  .sv-contract-document .sv-cert-header-logo {
    max-height: 48px;
    max-width: 180px;
    margin: 0 auto 10px auto;
    display: block;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }
  .sv-contract-document .sv-cert-header-brand {
    font-size: 8.5pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.9;
    margin: 0 0 6px 0;
  }
  .sv-contract-document .sv-cert-header-title {
    margin: 0;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.35;
  }
  .sv-contract-document .sv-cert-header-subtitle {
    margin: 10px 0 0 0;
    font-size: 9pt;
    line-height: 1.5;
    opacity: 0.95;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  .sv-contract-document .sv-cert-body {
    padding: 18px 22px 20px 22px;
  }
  .sv-contract-document .sv-cert-block {
    border: 1px solid #dbeafe;
    border-radius: 8px;
    margin-bottom: 14px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-document .sv-cert-block-title {
    margin: 0;
    padding: 8px 14px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #1e40af;
    background: #eff6ff;
    border-bottom: 1px solid #dbeafe;
  }
  .sv-contract-document .sv-cert-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .sv-contract-document .sv-cert-table td {
    padding: 7px 14px;
    vertical-align: top;
    border-bottom: 1px solid #f1f5f9;
  }
  .sv-contract-document .sv-cert-table tr:last-child td {
    border-bottom: none;
  }
  .sv-contract-document .sv-cert-table td:first-child {
    width: 36%;
    font-weight: 700;
    color: #475569;
    background: #f8fafc;
  }
  .sv-contract-document .sv-cert-table td:last-child {
    color: #1e293b;
    word-break: break-word;
  }
  .sv-contract-document .sv-cert-status-badge {
    display: inline-block;
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
    border-radius: 4px;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 10px;
    text-transform: uppercase;
  }
  .sv-contract-document .sv-cert-security-value {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 8.5pt;
    word-break: break-all;
    line-height: 1.45;
  }
  .sv-contract-document .sv-cert-validation {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 16px;
    align-items: center;
    padding: 14px;
  }
  .sv-contract-document .sv-cert-qr {
    width: 110px;
    height: 110px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 4px;
    background: #fff;
    display: block;
    margin: 0 auto;
  }
  .sv-contract-document .sv-cert-qr-placeholder {
    width: 110px;
    height: 110px;
    border: 1px dashed #94a3b8;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8pt;
    color: #64748b;
    text-align: center;
    padding: 8px;
    margin: 0 auto;
  }
  .sv-contract-document .sv-cert-history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }
  .sv-contract-document .sv-cert-history-table th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: left;
    padding: 7px 10px;
    border-bottom: 1px solid #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 8pt;
  }
  .sv-contract-document .sv-cert-history-table td {
    padding: 6px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
    color: #334155;
  }
  .sv-contract-document .sv-cert-history-table tr:last-child td {
    border-bottom: none;
  }
  .sv-contract-document .sv-cert-footer-note {
    margin: 14px 0 0 0;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    line-height: 1.55;
    color: #64748b;
    text-align: justify;
  }
  .sv-contract-document .sv-cert-footer-brand {
    margin-top: 10px;
    text-align: center;
    font-size: 8pt;
    color: #94a3b8;
    letter-spacing: 0.04em;
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

function formatHistoryEventLabel(event: string): string {
  const map: Record<string, string> = {
    'Link enviado': 'Contrato enviado',
    'Comprador visualizou': 'Visualizado pelo comprador',
    'CONTRACT_SIGNED_ELECTRONICALLY': 'Assinado pelo comprador',
    Expirado: 'Link expirado',
    Cancelado: 'Assinatura cancelada',
  };
  return map[event] || event;
}

function buildCertRows(
  rows: Array<{ label: string; value: string; mono?: boolean }>,
): string {
  return rows
    .map((row) => {
      const value = row.value || '—';
      const cell = row.mono
        ? `<span class="sv-cert-security-value">${escapeHtml(value)}</span>`
        : escapeHtml(value);
      return `<tr><td>${escapeHtml(row.label)}</td><td>${cell}</td></tr>`;
    })
    .join('');
}

function buildCertBlock(title: string, rowsHtml: string): string {
  return `
    <div class="sv-cert-block">
      <p class="sv-cert-block-title">${escapeHtml(title)}</p>
      <table class="sv-cert-table"><tbody>${rowsHtml}</tbody></table>
    </div>`;
}

function buildHistoryRows(
  historyEvents: SignatureHistoryEvent[] | undefined,
  contractCreatedAt?: string | null,
): string {
  const rows: Array<{ at: string; event: string; ip: string | null }> = [];

  if (contractCreatedAt) {
    rows.push({
      at: contractCreatedAt,
      event: 'Contrato criado',
      ip: null,
    });
  }

  for (const item of historyEvents || []) {
    rows.push({
      at: item.at,
      event: formatHistoryEventLabel(item.event),
      ip: item.ip,
    });
  }

  if (rows.length === 0) {
    return `<tr><td colspan="3" style="padding:10px;text-align:center;color:#64748b;">Nenhum evento registrado</td></tr>`;
  }

  return rows
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .map(
      (row) =>
        `<tr>
          <td>${escapeHtml(formatSignedDateTime(row.at))}</td>
          <td>${escapeHtml(row.event)}</td>
          <td>${escapeHtml(row.ip || '—')}</td>
        </tr>`,
    )
    .join('');
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
    qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 });
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
  const signedDateTime = formatSignedDateTime(input.signedAt);
  const finalSignedAt = input.signedAt || input.issuedAt;
  const documentVersion = input.documentVersion ?? 1;
  const uniqueId = String(input.uniqueId || input.signatureToken || '—').trim() || '—';
  const publicUrl = String(
    input.publicUrl || input.verifyUrl || input.signatureUrl || '',
  ).trim();
  const tokenFull = String(input.signatureToken || '').trim() || '—';
  const hashFull = String(input.signatureHash || '').trim() || '—';

  const logoBlock = input.logoSrc
    ? `<img src="${escapeHtml(input.logoSrc)}" alt="Logo" class="sv-cert-header-logo" />`
    : '';

  const qrBlock = input.qrCodeDataUrl
    ? `<img src="${escapeHtml(input.qrCodeDataUrl)}" alt="QR Code de validação" class="sv-cert-qr" />`
    : `<div class="sv-cert-qr-placeholder">QR Code<br/>de validação</div>`;

  const historyBody = buildHistoryRows(input.historyEvents, input.issuedAt);

  return `
    ${CERT_STYLES}
    <div class="contract-clause contract-clause--tight sv-cert-page">
      <div class="sv-cert-frame">
        <div class="sv-cert-header">
          ${logoBlock}
          <p class="sv-cert-header-brand">SV LOTES — Gestão Imobiliária</p>
          <h3 class="sv-cert-header-title">${escapeHtml(title)}</h3>
          <p class="sv-cert-header-subtitle">${escapeHtml(SALE_CONTRACT_SIGNATURE_CERTIFICATE_SUBTITLE)}</p>
        </div>

        <div class="sv-cert-body">
          ${buildCertBlock(
            'Documento',
            buildCertRows([
              { label: 'Contrato nº', value: input.contractNumber },
              { label: 'Empreendimento', value: input.projectName || '—' },
              { label: 'Quadra', value: input.quadra || '—' },
              { label: 'Lote', value: input.lote || '—' },
              { label: 'Data de emissão', value: formatSignedDateTime(input.issuedAt) },
              { label: 'Data da assinatura final', value: formatSignedDateTime(finalSignedAt) },
            ]),
          )}

          ${buildCertBlock(
            'Vendedor',
            buildCertRows([
              { label: 'Nome', value: vendorName },
              { label: vendorDocLabel, value: vendorDoc },
              { label: 'IP da assinatura', value: input.vendorIpAddress || '—' },
              { label: 'Data/Hora da assinatura', value: formatSignedDateTime(input.vendorSignedAt) },
              { label: 'Status', value: 'VALIDADO' },
            ]),
          )}

          ${buildCertBlock(
            'Comprador',
            buildCertRows([
              { label: 'Nome', value: input.buyerName || '—' },
              { label: 'CPF', value: buyerDoc },
              ...(input.signerEmail
                ? [{ label: 'E-mail', value: input.signerEmail }]
                : []),
              { label: 'IP da assinatura', value: input.ipAddress || '—' },
              { label: 'Data/Hora da assinatura', value: signedDateTime },
              { label: 'Status', value: 'VALIDADO' },
            ]),
          )}

          ${buildCertBlock(
            'Segurança',
            buildCertRows([
              { label: 'Hash SHA-256', value: hashFull, mono: true },
              { label: 'Token da assinatura', value: tokenFull, mono: true },
              { label: 'Identificador único', value: uniqueId, mono: true },
              { label: 'Versão do documento', value: String(documentVersion) },
            ]),
          )}

          <div class="sv-cert-block">
            <p class="sv-cert-block-title">Validação</p>
            <div class="sv-cert-validation">
              ${qrBlock}
              <table class="sv-cert-table">
                <tbody>
                  <tr>
                    <td>URL pública</td>
                    <td><span class="sv-cert-security-value">${escapeHtml(publicUrl || '—')}</span></td>
                  </tr>
                  ${
                    input.signatureUrl && input.signatureUrl !== publicUrl
                      ? `<tr><td>Link de assinatura</td><td><span class="sv-cert-security-value">${escapeHtml(input.signatureUrl)}</span></td></tr>`
                      : ''
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="sv-cert-block">
            <p class="sv-cert-block-title">Histórico</p>
            <table class="sv-cert-history-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Evento</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>${historyBody}</tbody>
            </table>
          </div>

          <p class="sv-cert-footer-note">
            Este contrato foi assinado eletronicamente através da plataforma SV LOTES, com registro de
            identificação do signatário, endereço IP, data, hora, token de autenticação e demais evidências
            eletrônicas armazenadas pelo sistema, produzindo plenos efeitos jurídicos nos termos da Medida
            Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.
          </p>
          <p class="sv-cert-footer-brand">SV LOTES · Certificado digital gerado automaticamente</p>
        </div>
      </div>
    </div>`;
}
