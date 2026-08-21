/**
 * HTML puro do bloco eletrônico ARAGUAIA — sem node:crypto / fs / PDF.
 * Usado por araguaiaContractParties (pode entrar em path de geração HTML client).
 */

import { formatCpfCnpj } from '@/lib/inputMasks';

const SLOT_STYLE =
  'text-align: center; margin-bottom: 10px; min-width: 0; width: 100%; page-break-inside: avoid; break-inside: avoid-page; -webkit-column-break-inside: avoid;';
const BADGE_STYLE =
  'margin: 0 0 6px 0; font-weight: bold; font-size: 9pt; letter-spacing: 0.04em; text-transform: uppercase; color: #14532d;';
const ROLE_STYLE =
  'margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase; font-size: 10.5pt; text-align: center;';
const NAME_STYLE =
  'margin: 0 0 2px 0; font-weight: bold; font-size: 10.5pt; overflow-wrap: break-word; text-align: center;';
const META_STYLE =
  'margin: 0; font-size: 9.5pt; font-weight: normal; overflow-wrap: break-word; text-align: center;';
const RULE_STYLE =
  'border-top: 1px solid #166534; margin: 0 auto 8px auto; width: 72%; max-width: 260px;';

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
      second: '2-digit',
      hour12: false,
    });
    return `${date} às ${time}`;
  } catch {
    return '—';
  }
}

export type AraguaiaElectronicSignatureSlotInput = {
  role: string;
  roleLabel: string;
  name: string;
  documentLabel?: 'CPF' | 'CNPJ' | string;
  document?: string | null;
  extraMeta?: string[];
  signedAt?: string | null;
  signatureEventId?: string | null;
  dataRole?: string;
  extraClass?: string;
};

export function buildAraguaiaElectronicSignatureSlotHtml(
  input: AraguaiaElectronicSignatureSlotInput,
): string {
  const doc = input.document
    ? formatCpfCnpj(input.document) || input.document
    : null;
  const meta: string[] = [];
  if (doc && input.documentLabel) {
    meta.push(`${input.documentLabel}: ${doc}`);
  } else if (doc) {
    meta.push(doc);
  }
  for (const line of input.extraMeta || []) {
    if (String(line || '').trim()) meta.push(String(line).trim());
  }
  meta.push(`Assinado em: ${formatSignedAtBr(input.signedAt)}`);
  meta.push(
    `ID da assinatura: ${String(input.signatureEventId || '').trim() || '—'}`,
  );

  const metaHtml = meta
    .map((line) => `<p style="${META_STYLE}">${esc(line)}</p>`)
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
    } style="${SLOT_STYLE}">
      <div style="${RULE_STYLE}"></div>
      <p style="${BADGE_STYLE}">ASSINADO ELETRONICAMENTE</p>
      <p style="${ROLE_STYLE}">${esc(input.roleLabel)}</p>
      <p style="${NAME_STYLE}">${esc(input.name)}</p>
      ${metaHtml}
    </div>`;
}

export function buildAraguaiaElectronicSignaturesBlockHtml(
  slots: AraguaiaElectronicSignatureSlotInput[],
): string {
  const slotsHtml = slots
    .map((s) => buildAraguaiaElectronicSignatureSlotHtml(s))
    .join('\n');
  return `
      <div class="contract-signatures contract-signatures--araguaia contract-signatures--electronic" data-signature-mode="ELECTRONIC_SIGNED">
        <div class="signature-grid signature-grid--araguaia">
          ${slotsHtml}
        </div>
      </div>`;
}
