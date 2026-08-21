/**
 * Bloco de assinaturas eletrônicas resumidas — modelo ARAGUAIA.
 * Representação documental (sem rubrica falsa). Certificado detalhado fica à parte.
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import {
  ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
  readAraguaiaIntervenientFromSignatureData,
  sortAraguaiaVendorParties,
} from '@/lib/araguaiaContractEsign';
import { readPartySignatureEventId } from '@/lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import { replaceContractSignaturesBlock } from '@/lib/saleContractSignatureCertificateHtml';

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

function roleOrder(role: string): number {
  const key = String(role || '').toUpperCase();
  if (key === 'VENDOR') return 1;
  if (key === 'BUYER') return 2;
  if (key === 'INTERVENIENT') return 3;
  if (key === 'WITNESS_1') return 4;
  if (key === 'WITNESS_2') return 5;
  return 9;
}

export function buildAraguaiaElectronicSignatureSlotsFromParties(
  parties: Array<
    Pick<
      ContractSignaturePartyRow,
      | 'id'
      | 'role'
      | 'signer_name'
      | 'signer_cpf'
      | 'signed_at'
      | 'status'
      | 'signature_data'
    >
  >,
): AraguaiaElectronicSignatureSlotInput[] {
  const signed = parties.filter(
    (p) => String(p.status || '').toUpperCase() === 'SIGNED',
  );
  const vendors = sortAraguaiaVendorParties(
    signed.filter((p) => String(p.role).toUpperCase() === 'VENDOR'),
  );
  const others = signed
    .filter((p) => String(p.role).toUpperCase() !== 'VENDOR')
    .sort(
      (a, b) =>
        roleOrder(String(a.role)) - roleOrder(String(b.role)),
    );

  const ordered = [...vendors, ...others];
  const slots: AraguaiaElectronicSignatureSlotInput[] = [];

  for (const party of ordered) {
    const role = String(party.role || '').toUpperCase();
    const eventId = readPartySignatureEventId(party);

    if (role === 'VENDOR') {
      slots.push({
        role,
        roleLabel: 'PROMITENTE VENDEDOR',
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        signedAt: party.signed_at,
        signatureEventId: eventId,
        dataRole: 'VENDOR',
        extraClass: 'signature-slot-vendor-electronic',
      });
      continue;
    }

    if (role === 'BUYER') {
      slots.push({
        role,
        roleLabel: 'PROMITENTE COMPRADOR(A)',
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        signedAt: party.signed_at,
        signatureEventId: eventId,
        dataRole: 'BUYER',
        extraClass: 'signature-slot-buyer-electronic',
      });
      continue;
    }

    if (role === 'INTERVENIENT') {
      const meta = readAraguaiaIntervenientFromSignatureData(
        party.signature_data,
      );
      const company =
        meta?.company_name ||
        String(party.signer_name || '').trim() ||
        ARAGUAIA_INTERVENIENT_COMPANY_NAME;
      const cnpj =
        meta?.company_cnpj ||
        onlyDigits(party.signer_cpf || '') ||
        onlyDigits(ARAGUAIA_INTERVENIENT_COMPANY_CNPJ);
      const repName =
        meta?.representative_name ||
        ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME;
      const repCpf =
        meta?.representative_cpf ||
        onlyDigits(ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF);
      slots.push({
        role,
        roleLabel: 'INTERVENIENTE',
        name: company,
        documentLabel: 'CNPJ',
        document: cnpj,
        extraMeta: [
          'Representada por:',
          repName,
          `CPF: ${formatCpfCnpj(repCpf) || repCpf}`,
        ],
        signedAt: party.signed_at,
        signatureEventId: eventId,
        dataRole: 'INTERVENIENT',
        extraClass: 'signature-slot-intervenient-electronic',
      });
      continue;
    }

    if (role === 'WITNESS_1' || role === 'WITNESS_2') {
      slots.push({
        role,
        roleLabel:
          role === 'WITNESS_2' ? 'TESTEMUNHA 2' : 'TESTEMUNHA 1',
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        signedAt: party.signed_at,
        signatureEventId: eventId,
        dataRole: role,
        extraClass:
          role === 'WITNESS_2'
            ? 'signature-slot-witness-2-electronic'
            : 'signature-slot-witness-1-electronic',
      });
    }
  }

  return slots;
}

/**
 * Substitui o bloco físico `.contract-signatures` pela representação eletrônica.
 * Preserva fecho/data fora desse bloco.
 */
export function applyAraguaiaElectronicSignaturesToContractHtml(
  html: string,
  parties: Array<
    Pick<
      ContractSignaturePartyRow,
      | 'id'
      | 'role'
      | 'signer_name'
      | 'signer_cpf'
      | 'signed_at'
      | 'status'
      | 'signature_data'
    >
  >,
): string {
  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(parties);
  if (slots.length === 0) return html;
  const block = buildAraguaiaElectronicSignaturesBlockHtml(slots);
  return replaceContractSignaturesBlock(html, block);
}

export function araguaiaElectronicSignaturesBlockHasPhysicalBlankLines(
  html: string,
): boolean {
  return /class="signature-line"/i.test(html);
}

export function describeAraguaiaElectronicSlotRoles(
  slots: AraguaiaElectronicSignatureSlotInput[],
): string[] {
  return slots.map((s) => s.roleLabel || saleSignaturePartyRoleLabel(s.role));
}
