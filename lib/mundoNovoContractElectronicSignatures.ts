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
  if (key === 'BUYER') return 2;
  if (key === 'INTERVENIENT') return 3;
  if (key === 'WITNESS_1') return 4;
  if (key === 'WITNESS_2') return 5;
  return 9;
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
        roleLabel: 'PROMITENTE COMPRADOR',
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
 * O script de medição remove `sv-pagination-force-break` se o certificado
 * ainda couber no resto da página. Esta classe não é tocada — o certificado
 * eletrônico MUNDO_NOVO fica sempre na última página, sozinho.
 */
export function applyMundoNovoElectronicCertificateNewPage(html: string): string {
  if (
    !html.includes('sv-contract-mundo-novo') ||
    !html.includes('data-signature-mode="ELECTRONIC_SIGNED"')
  ) {
    return html;
  }
  let next = html;
  if (!next.includes('class="sv-cert-official-block sv-mundo-novo-cert-new-page"')) {
    next = next.replace(
      /class="sv-cert-official-block"/,
      'class="sv-cert-official-block sv-mundo-novo-cert-new-page"',
    );
  }
  if (!next.includes('class="sv-mundo-novo-cert-page-break"')) {
    next = next.replace(
      /<div class="sv-cert-official-block sv-mundo-novo-cert-new-page"/,
      '<div class="sv-mundo-novo-cert-page-break" aria-hidden="true" style="page-break-after:always;break-after:page;display:block;min-height:12px;line-height:12px;">&nbsp;</div><div class="sv-cert-official-block sv-mundo-novo-cert-new-page" style="page-break-before:always;break-before:page;overflow:visible;"',
    );
  }
  if (!next.includes('id="mundo-novo-cert-new-page-css"')) {
    next += `<style id="mundo-novo-cert-new-page-css">
.sv-mundo-novo-cert-page-break {
  display: block !important;
  min-height: 12px !important;
  height: 12px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  page-break-after: always !important;
  break-after: page !important;
}
.sv-cert-official-block.sv-mundo-novo-cert-new-page,
.sv-cert-official-block.sv-mundo-novo-cert-new-page .sv-cert-official-inner,
.sv-cert-official-block.sv-mundo-novo-cert-new-page .sv-cert-official {
  overflow: visible !important;
  page-break-inside: auto !important;
  break-inside: auto !important;
}
.sv-cert-official-block.sv-mundo-novo-cert-new-page {
  page-break-before: always !important;
  break-before: page !important;
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
