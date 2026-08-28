/**
 * Bloco de assinaturas eletrônicas resumidas — modelo MUNDO_NOVO.
 * Representação documental (sem rubrica falsa). Certificado detalhado fica à parte.
 * NÃO altera o HTML físico gerado por generateMundoNovoContract.
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import {
  readMundoNovoIntervenientFromSignatureData,
  sortMundoNovoVendorParties,
} from '@/lib/mundoNovoContractEsign';
import {
  buildMundoNovoElectronicSignaturesBlockHtml,
  type MundoNovoElectronicSignatureSlotInput,
} from '@/lib/mundoNovoContractElectronicSignaturesUi';
import { readPartySignatureEventId } from '@/lib/saleContractSignaturePartyMeta';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import { replaceContractSignaturesBlock } from '@/lib/saleContractSignatureHtmlBlocks';

export type { MundoNovoElectronicSignatureSlotInput };
export {
  buildMundoNovoElectronicSignatureSlotHtml,
  buildMundoNovoElectronicSignaturesBlockHtml,
} from '@/lib/mundoNovoContractElectronicSignaturesUi';

function roleOrder(role: string): number {
  const key = String(role || '').toUpperCase();
  if (key === 'VENDOR') return 1;
  if (key === 'INTERVENIENT') return 2;
  if (key === 'BUYER') return 3;
  if (key === 'WITNESS_1') return 4;
  if (key === 'WITNESS_2') return 5;
  return 9;
}

/** Remove um bloco `<div>` cujo `class` contém o marcador — só apresentação do PDF. */
function removeDivByClassMarker(html: string, classMarker: string): string {
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

export function buildMundoNovoElectronicSignatureSlotsFromParties(
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
      | 'ip_address'
    >
  >,
): MundoNovoElectronicSignatureSlotInput[] {
  const signed = parties.filter(
    (p) => String(p.status || '').toUpperCase() === 'SIGNED',
  );
  const vendors = sortMundoNovoVendorParties(
    signed.filter((p) => String(p.role).toUpperCase() === 'VENDOR'),
  );
  const others = signed
    .filter((p) => String(p.role).toUpperCase() !== 'VENDOR')
    .sort(
      (a, b) => roleOrder(String(a.role)) - roleOrder(String(b.role)),
    );

  const ordered = [...vendors, ...others];
  const slots: MundoNovoElectronicSignatureSlotInput[] = [];
  let vendorIndex = 0;

  for (const party of ordered) {
    const role = String(party.role || '').toUpperCase();
    const eventId = readPartySignatureEventId(party);
    const ipAddress = party.ip_address || null;

    if (role === 'VENDOR') {
      vendorIndex += 1;
      slots.push({
        role,
        roleLabel: `PROMITENTE VENDEDOR ${vendorIndex}`,
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        ipAddress,
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
        roleLabel: 'PROMITENTE COMPRADOR',
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        ipAddress,
        signedAt: party.signed_at,
        signatureEventId: eventId,
        dataRole: 'BUYER',
        extraClass: 'signature-slot-buyer-electronic',
      });
      continue;
    }

    if (role === 'INTERVENIENT') {
      const meta = readMundoNovoIntervenientFromSignatureData(
        party.signature_data,
      );
      const company =
        meta?.company_name ||
        String(party.signer_name || '').trim() ||
        '—';
      const cnpj =
        meta?.company_cnpj || onlyDigits(party.signer_cpf || '') || '';
      const repName = String(meta?.representative_name || '').trim();
      const repCpf = meta?.representative_cpf || '';
      const extraMeta: string[] = [];
      if (repName) {
        extraMeta.push(`Representada por ${repName}`);
      }
      if (repCpf) {
        extraMeta.push(`CPF: ${formatCpfCnpj(repCpf) || repCpf}`);
      }
      slots.push({
        role,
        roleLabel: 'INTERVENIENTE',
        name: company,
        documentLabel: 'CNPJ',
        document: cnpj,
        extraMeta,
        ipAddress,
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
        roleLabel: role === 'WITNESS_2' ? 'TESTEMUNHA 2' : 'TESTEMUNHA 1',
        name: String(party.signer_name || '').trim() || '—',
        documentLabel: 'CPF',
        document: party.signer_cpf,
        ipAddress,
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
 * Preserva fecho/data fora desse bloco. Não altera geração PHYSICAL_UNSIGNED.
 */
export function applyMundoNovoElectronicSignaturesToContractHtml(
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
      | 'ip_address'
    >
  >,
): string {
  const slots = buildMundoNovoElectronicSignatureSlotsFromParties(parties);
  if (slots.length === 0) return html;
  const block = buildMundoNovoElectronicSignaturesBlockHtml(slots);
  const replaced = replaceContractSignaturesBlock(html, block);
  return replaced.replace(
    /class="contract-closing-and-signatures--mundo-novo" data-signature-mode="PHYSICAL_UNSIGNED"/,
    'class="contract-closing-and-signatures--mundo-novo" data-signature-mode="ELECTRONIC_SIGNED"',
  );
}

/**
 * Compacta o certificado na mesma página das 6 rubricas (página 7).
 * Não cria página exclusiva nem fichas extensas. PHYSICAL_UNSIGNED intacto.
 */
export function applyMundoNovoElectronicCertificateNewPage(html: string): string {
  if (
    !html.includes('sv-contract-mundo-novo') ||
    !html.includes('data-signature-mode="ELECTRONIC_SIGNED"')
  ) {
    return html;
  }
  let next = html;
  next = removeDivByClassMarker(next, 'class="sv-cert-cards"');
  next = next.replace(
    /<div class="sv-mundo-novo-cert-page-break"[^>]*>[\s\S]*?<\/div>/,
    '',
  );
  if (!next.includes('class="sv-cert-qr-caption"')) {
    next = next.replace(
      /(<div class="sv-cert-qr">\s*<img[^>]*>)/,
      '$1<p class="sv-cert-qr-caption">Escaneie para validar este documento</p>',
    );
  }
  next = next.replace(
    /class="sv-cert-official-block(?![^"]*\bsv-mundo-novo-cert-compact\b)([^"]*)"/,
    'class="sv-cert-official-block sv-mundo-novo-cert-compact$1"',
  );
  next = next.replace(/\s*sv-mundo-novo-cert-new-page/g, '');
  next = next.replace(/\s*sv-pagination-force-break/g, '');
  if (!next.includes('id="mundo-novo-cert-same-page-css"')) {
    next += `<style id="mundo-novo-cert-same-page-css">
body:has(.sv-contract-mundo-novo [data-signature-mode="ELECTRONIC_SIGNED"]) .sv-cert-official-block,
body:has(.sv-contract-mundo-novo [data-signature-mode="ELECTRONIC_SIGNED"]) .sv-cert-official-block.sv-pagination-force-break,
.sv-cert-official-block.sv-mundo-novo-cert-compact,
.sv-cert-official-block.sv-mundo-novo-cert-compact.sv-pagination-force-break {
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  margin-top: 3px !important;
  overflow: visible !important;
}
.sv-mundo-novo-cert-compact .sv-cert-cards {
  display: none !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.sv-mundo-novo-cert-compact .sv-cert-validation {
  padding: 4px 6px !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 4px !important;
}
.sv-mundo-novo-cert-compact .sv-cert-qr {
  width: 84px !important;
  padding-right: 8px !important;
  text-align: center !important;
  vertical-align: middle !important;
}
.sv-mundo-novo-cert-compact .sv-cert-qr img,
.sv-mundo-novo-cert-compact img.sv-cert-qr {
  width: 76px !important;
  height: 76px !important;
  margin: 0 auto !important;
}
.sv-mundo-novo-cert-compact .sv-cert-qr-caption {
  margin: 2px 0 0 0 !important;
  font-size: 5.5pt !important;
  line-height: 1.15 !important;
  color: #64748b !important;
  text-align: center !important;
}
.sv-mundo-novo-cert-compact .sv-cert-validation-title {
  font-size: 8pt !important;
  margin: 0 0 2px 0 !important;
}
.sv-mundo-novo-cert-compact .sv-cert-validation-row {
  font-size: 6pt !important;
  line-height: 1.15 !important;
  margin: 0 0 1px 0 !important;
}
.sv-mundo-novo-cert-compact .sv-cert-validation-row strong {
  font-size: 5.5pt !important;
  display: inline !important;
  margin: 0 4px 0 0 !important;
}
.sv-mundo-novo-cert-compact .sv-cert-validation-row code,
.sv-mundo-novo-cert-compact .sv-cert-validation-row span.value {
  font-size: 5.5pt !important;
  line-height: 1.15 !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
.sv-mundo-novo-cert-compact .sv-cert-legal {
  font-size: 5.5pt !important;
  line-height: 1.2 !important;
  margin-top: 3px !important;
  text-align: center !important;
}
</style>`;
  }
  return next;
}

export function describeMundoNovoElectronicSlotRoles(
  slots: MundoNovoElectronicSignatureSlotInput[],
): string[] {
  return slots.map((s) => s.roleLabel || saleSignaturePartyRoleLabel(s.role));
}
