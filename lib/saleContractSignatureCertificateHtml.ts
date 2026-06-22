/**
 * Página de assinaturas eletrônicas e certificado HTML anexo ao PDF de venda assinado.
 * Apenas apresentação visual — não altera tokens, hash nem fluxo jurídico.
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
  representativeCpf?: string | null;
  signatureStatus: string;
  signedAt?: string | null;
  viewedAt?: string | null;
  ipAddress?: string | null;
  signatureToken?: string | null;
  signatureHash?: string | null;
  /** Título do certificado final (ex.: SV LOTES 2.0). */
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

const E_SIGN_STYLES = `
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
  .sv-contract-document .e-cert-page {
    page-break-before: always;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 2px solid #2d3748;
  }
  .sv-contract-document .e-cert-title {
    text-align: center;
    font-size: 13pt;
    margin: 0 0 14px 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1a202c;
  }
  .sv-contract-document .e-cert-summary {
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
    margin-bottom: 18px;
    font-size: 10pt;
    font-weight: bold;
    color: #167848;
  }
  .sv-contract-document .e-cert-party {
    border: 1px solid #cbd5e0;
    border-radius: 8px;
    background: #fff;
    padding: 14px 16px;
    margin-bottom: 14px;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-document .e-cert-party-title {
    margin: 0 0 10px 0;
    font-size: 10pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #2d3748;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
  }
  .sv-contract-document .e-cert-table {
    width: 100%;
    font-size: 9.5pt;
    border-collapse: collapse;
  }
  .sv-contract-document .e-cert-table td {
    padding: 4px 0;
    vertical-align: top;
  }
  .sv-contract-document .e-cert-table td:first-child {
    width: 34%;
    font-weight: bold;
    color: #4a5568;
    padding-right: 10px;
  }
  .sv-contract-document .e-cert-declaration {
    font-size: 10pt;
    margin: 16px 0 0 0;
    line-height: 1.55;
    color: #2d3748;
  }
  .sv-contract-document .e-cert-meta {
    font-size: 8pt;
    color: #4a5568;
    margin-top: 12px;
    word-break: break-all;
  }
</style>`;

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

function formatSignedDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatSignatureDateBr(iso);
  const time = formatSignatureTimeBr(iso);
  if (date === '—') return '—';
  return `${date} ${time}`;
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
    vendorDocLabel === 'CPF'
      ? formatCpfCnpj(input.vendorDocument || '') || input.vendorDocument || '—'
      : formatCpfCnpj(input.vendorDocument || '') || input.vendorDocument || '—';

  return `
    ${E_SIGN_STYLES}
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

function buildCertificatePartyRows(
  label: string,
  rows: Array<{ label: string; value: string }>,
): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value || '—')}</td></tr>`,
    )
    .join('\n');

  return `
    <div class="e-cert-party">
      <p class="e-cert-party-title">✓ ${escapeHtml(label)}</p>
      <table class="e-cert-table"><tbody>${body}</tbody></table>
    </div>`;
}

export function buildSaleContractSignatureCertificateHtml(
  input: SaleContractSignatureCertificateInput,
): string {
  const signedDateTime = formatSignedDateTime(input.signedAt);
  const lotLabel = `QD ${input.quadra || '—'} · LT ${input.lote || '—'}`;
  const status = input.signatureStatus || 'ASSINADO ELETRONICAMENTE';

  const vendorDoc = input.representativeCpf
    ? formatCpfCnpj(input.representativeCpf) || input.representativeCpf
    : formatCpfCnpj(input.companyCnpj || '') || input.companyCnpj || '—';

  const vendorRows = [
    { label: 'Empresa', value: input.companyName || '—' },
    { label: 'Representante', value: input.representativeName || '—' },
    { label: input.representativeCpf ? 'CPF' : 'CNPJ', value: vendorDoc },
    { label: 'Data/Hora', value: signedDateTime },
    { label: 'Status', value: status },
  ];

  const buyerRows = [
    { label: 'Nome', value: input.buyerName || '—' },
    { label: 'CPF', value: formatCpfCnpj(input.buyerDocument) || input.buyerDocument || '—' },
    { label: 'E-mail', value: input.signerEmail || '—' },
    { label: 'IP', value: input.ipAddress || '—' },
    { label: 'Data/Hora', value: signedDateTime },
    { label: 'Token', value: maskToken(input.signatureToken) },
    { label: 'Status', value: status },
  ];

  const hashBlock = input.signatureHash
    ? `<p class="e-cert-meta"><strong>Hash de integridade (SHA-256) — comprador:</strong> ${escapeHtml(input.signatureHash)}</p>`
    : '';

  const title =
    String(input.certificateTitle || '').trim() ||
    'Certificado de Assinatura Eletrônica';

  return `
    ${E_SIGN_STYLES}
    <div class="contract-clause contract-clause--tight e-cert-page">
      <h3 class="e-cert-title">${escapeHtml(title)}</h3>
      <div class="e-cert-summary">
        <span>✓ Promitente Vendedor</span>
        <span>✓ Promissário Comprador</span>
      </div>
      <table class="e-cert-table" style="margin-bottom: 16px;">
        <tbody>
          <tr><td>Contrato</td><td>${escapeHtml(input.contractNumber)}</td></tr>
          <tr><td>Empreendimento</td><td>${escapeHtml(input.projectName || '—')}</td></tr>
          <tr><td>Lote</td><td>${escapeHtml(lotLabel)}</td></tr>
        </tbody>
      </table>
      <p style="font-size: 10pt; font-weight: bold; margin: 0 0 8px 0; color: #2d3748;">Dados da assinatura</p>
      ${buildCertificatePartyRows('Promitente Vendedor', vendorRows)}
      ${buildCertificatePartyRows('Promissário Comprador', buyerRows)}
      <p style="font-size: 10pt; margin: 14px 0 6px 0; font-weight: bold; color: #2d3748;">Declaração jurídica</p>
      <p class="e-cert-declaration">
        Este contrato foi assinado eletronicamente através da plataforma SV LOTES, com registro de identificação
        do signatário, endereço IP, data, hora, token de autenticação e demais evidências eletrônicas armazenadas
        pelo sistema, produzindo plenos efeitos jurídicos nos termos da Medida Provisória nº 2.200-2/2001 e da
        Lei nº 14.063/2020.
      </p>
      ${hashBlock}
    </div>`;
}
