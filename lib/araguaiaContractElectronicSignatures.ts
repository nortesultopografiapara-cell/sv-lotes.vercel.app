/**
 * Bloco de assinaturas eletrônicas resumidas — modelo ARAGUAIA.
 * Representação documental (sem rubrica falsa). Certificado detalhado fica à parte.
 *
 * HTML puro: araguaiaContractElectronicSignaturesUi (seguro p/ path de template).
 * Mapeamento party→slots + apply: este módulo (servidor / assinatura).
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
import {
  buildAraguaiaElectronicSignaturesBlockHtml,
  type AraguaiaElectronicSignatureSlotInput,
} from '@/lib/araguaiaContractElectronicSignaturesUi';
import { readPartySignatureEventId } from '@/lib/saleContractSignaturePartyMeta';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import { replaceContractSignaturesBlock } from '@/lib/saleContractSignatureHtmlBlocks';

export type { AraguaiaElectronicSignatureSlotInput };
export {
  buildAraguaiaElectronicSignatureSlotHtml,
  buildAraguaiaElectronicSignaturesBlockHtml,
} from '@/lib/araguaiaContractElectronicSignaturesUi';

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
