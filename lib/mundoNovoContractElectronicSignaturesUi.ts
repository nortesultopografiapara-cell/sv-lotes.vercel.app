/**
 * HTML puro do bloco eletrônico compacto MUNDO_NOVO — sem node:crypto / fs / PDF.
 * Só ELECTRONIC_SIGNED. O contrato físico (PHYSICAL_UNSIGNED) não usa este módulo.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';

function esc(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSignedAtBr(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const date = d.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const time = d.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${date} ${time} (BRT)`;
  } catch {
    return '—';
  }
}

export const MUNDO_NOVO_ELECTRONIC_SIGNATURES_CSS = `
<style id="mundo-novo-electronic-signatures-css">
.sv-contract-mundo-novo .contract-closing-and-signatures--mundo-novo[data-signature-mode="ELECTRONIC_SIGNED"] {
  page-break-inside: auto !important;
  break-inside: auto !important;
  -webkit-column-break-inside: auto !important;
  margin-top: 2px !important;
}
.sv-contract-mundo-novo .contract-closing-and-signatures--mundo-novo[data-signature-mode="ELECTRONIC_SIGNED"] .mundo-novo-closing-statement {
  margin-bottom: 6px !important;
}
.sv-contract-mundo-novo .contract-closing-and-signatures--mundo-novo[data-signature-mode="ELECTRONIC_SIGNED"] .contract-closing-date {
  margin-bottom: 6px !important;
}
.sv-contract-mundo-novo .contract-signatures--mundo-novo.contract-signatures--electronic {
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  margin: 0 !important;
  padding: 0 !important;
}
.sv-contract-mundo-novo .mundo-novo-esign-title {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 0 6px 0 !important;
  font-size: 8pt !important;
  font-weight: bold !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
  text-align: center !important;
  color: #14532d !important;
}
.sv-contract-mundo-novo .mundo-novo-esign-title::before,
.sv-contract-mundo-novo .mundo-novo-esign-title::after {
  content: '' !important;
  flex: 1 1 auto !important;
  border-top: 1px solid #86efac !important;
}
.sv-contract-mundo-novo .signature-grid--mundo-novo-electronic {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  column-gap: 6px !important;
  row-gap: 6px !important;
  align-items: stretch !important;
  justify-items: stretch !important;
  width: 100% !important;
}
.sv-contract-mundo-novo .signature-slot--electronic {
  text-align: left !important;
  margin: 0 !important;
  min-width: 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fafafa !important;
  padding: 4px 6px 3px 6px !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-mundo-novo .signature-slot--electronic .mundo-novo-esign-role {
  margin: 0 0 1px 0 !important;
  font-size: 6pt !important;
  font-weight: 700 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  color: #6b7280 !important;
}
.sv-contract-mundo-novo .signature-slot--electronic .mundo-novo-esign-status {
  margin: 0 0 1px 0 !important;
  font-size: 6.5pt !important;
  font-weight: 700 !important;
  color: #166534 !important;
}
.sv-contract-mundo-novo .signature-slot--electronic .mundo-novo-esign-name {
  margin: 0 0 1px 0 !important;
  font-weight: bold !important;
  font-size: 7.5pt !important;
  line-height: 1.2 !important;
  color: #111 !important;
  overflow-wrap: break-word !important;
}
.sv-contract-mundo-novo .signature-slot--electronic .mundo-novo-esign-meta {
  margin: 0 !important;
  font-size: 6pt !important;
  font-weight: normal !important;
  line-height: 1.2 !important;
  color: #4b5563 !important;
  overflow-wrap: anywhere !important;
}
body:has(.sv-contract-mundo-novo [data-signature-mode="ELECTRONIC_SIGNED"]) .sv-cert-official-block,
.sv-cert-official-block.sv-mundo-novo-cert-new-page {
  page-break-before: always !important;
  break-before: page !important;
}
</style>
`;

export type MundoNovoElectronicSignatureSlotInput = {
  role: string;
  roleLabel: string;
  name: string;
  documentLabel?: 'CPF' | 'CNPJ' | string;
  document?: string | null;
  extraMeta?: string[];
  ipAddress?: string | null;
  signedAt?: string | null;
  signatureEventId?: string | null;
  dataRole?: string;
  extraClass?: string;
};

export function buildMundoNovoElectronicSignatureSlotHtml(
  input: MundoNovoElectronicSignatureSlotInput,
): string {
  const extra = (input.extraMeta || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  const eventId = String(input.signatureEventId || '').trim() || '—';
  const documentLine = formatMundoNovoElectronicDocumentLine(input);
  const ip = String(input.ipAddress || '').trim();
  const metaLines = [
    documentLine,
    ...extra,
    ip ? `IP: ${ip}` : 'IP: —',
    formatSignedAtBr(input.signedAt),
    `ID: ${eventId}`,
  ].filter(Boolean);

  const extraHtml = metaLines
    .map((line) => `<p class="mundo-novo-esign-meta">${esc(String(line))}</p>`)
    .join('\n');

  const className = [
    'signature-slot',
    'signature-slot--electronic',
    input.extraClass || '',
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <div class="${className}" ${
      input.dataRole ? `data-party-role="${esc(input.dataRole)}"` : ''
    }>
      <p class="mundo-novo-esign-role">${esc(input.roleLabel)}</p>
      <p class="mundo-novo-esign-status">✓ Assinado eletronicamente</p>
      <p class="mundo-novo-esign-name">${esc(input.name)}</p>
      ${extraHtml}
    </div>`;
}

export function buildMundoNovoElectronicSignaturesBlockHtml(
  slots: MundoNovoElectronicSignatureSlotInput[],
): string {
  const slotsHtml = slots
    .map((s) => buildMundoNovoElectronicSignatureSlotHtml(s))
    .join('\n');
  return `
      ${MUNDO_NOVO_ELECTRONIC_SIGNATURES_CSS}
      <div class="contract-signatures contract-signatures--mundo-novo contract-signatures--electronic" data-signature-mode="ELECTRONIC_SIGNED">
        <p class="mundo-novo-esign-title">ASSINATURAS ELETRÔNICAS</p>
        <div class="signature-grid signature-grid--mundo-novo signature-grid--mundo-novo-electronic">
          ${slotsHtml}
        </div>
      </div>`;
}

export function formatMundoNovoElectronicDocumentLine(
  input: Pick<MundoNovoElectronicSignatureSlotInput, 'document' | 'documentLabel'>,
): string | null {
  const doc = input.document
    ? formatCpfCnpj(input.document) || input.document
    : null;
  if (!doc) return null;
  return input.documentLabel ? `${input.documentLabel}: ${doc}` : doc;
}
