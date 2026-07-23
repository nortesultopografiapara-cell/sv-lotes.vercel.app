/**
 * Status agregado do processo a partir dos participantes obrigatórios.
 */

import type { SaleSignatureStatus } from '@/lib/saleContractSignatureStatus';
import type {
  ContractSignaturePartyRow,
  SaleSignaturePartyRole,
  SaleSignaturePartyStatus,
} from '@/lib/saleContractSignaturePartyTypes';

export type PartyStatusSnapshot = {
  role: SaleSignaturePartyRole;
  status: SaleSignaturePartyStatus | string;
  signed_at?: string | null;
};

function partyByRole(
  parties: PartyStatusSnapshot[],
  role: SaleSignaturePartyRole,
): PartyStatusSnapshot | undefined {
  return parties.find((p) => String(p.role).toUpperCase() === role);
}

function isSigned(party?: PartyStatusSnapshot | null): boolean {
  return String(party?.status || '').toUpperCase() === 'SIGNED';
}

function isViewed(party?: PartyStatusSnapshot | null): boolean {
  return String(party?.status || '').toUpperCase() === 'VIEWED';
}

function isTerminalCancelled(party?: PartyStatusSnapshot | null): boolean {
  const s = String(party?.status || '').toUpperCase();
  return s === 'CANCELLED' || s === 'EXPIRED';
}

/**
 * Calcula o status do documento (contract_signatures) a partir das parties.
 * Sem parties → null (usar fluxo legado).
 */
export function computeAggregateSaleSignatureStatus(
  parties: PartyStatusSnapshot[] | null | undefined,
): SaleSignatureStatus | null {
  if (!parties || parties.length === 0) return null;

  const buyer = partyByRole(parties, 'BUYER');
  const spouse = partyByRole(parties, 'SPOUSE');
  const vendor = partyByRole(parties, 'VENDOR');
  const hasSpouse = Boolean(spouse);

  if (!buyer || !vendor) return null;

  const allCancelled =
    isTerminalCancelled(buyer) &&
    isTerminalCancelled(vendor) &&
    (!hasSpouse || isTerminalCancelled(spouse));
  if (allCancelled) {
    const anyExpired = [buyer, spouse, vendor].some(
      (p) => String(p?.status || '').toUpperCase() === 'EXPIRED',
    );
    return anyExpired ? 'EXPIRED' : 'CANCELLED';
  }

  const externalComplete =
    isSigned(buyer) && (!hasSpouse || isSigned(spouse));

  if (externalComplete && isSigned(vendor)) {
    return 'SIGNED';
  }

  if (externalComplete) {
    return 'CLIENT_SIGNED';
  }

  const anyExternalSigned =
    isSigned(buyer) || (hasSpouse && isSigned(spouse));

  if (anyExternalSigned) {
    return 'PARTIALLY_SIGNED';
  }

  if (isViewed(buyer) || (hasSpouse && isViewed(spouse))) {
    return 'VIEWED';
  }

  return 'PENDING';
}

export function areExternalPartiesComplete(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  const status = computeAggregateSaleSignatureStatus(parties);
  return status === 'CLIENT_SIGNED' || status === 'SIGNED';
}

export function isSpousePartyRequired(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  return Boolean(partyByRole(parties || [], 'SPOUSE'));
}

export function canVendorSignFromParties(
  parties: PartyStatusSnapshot[] | null | undefined,
): { ok: boolean; reason?: string } {
  if (!parties || parties.length === 0) {
    return { ok: false, reason: 'legacy' };
  }

  const aggregate = computeAggregateSaleSignatureStatus(parties);
  if (aggregate === 'SIGNED') {
    return { ok: false, reason: 'Este contrato já foi assinado pelo vendedor.' };
  }
  if (aggregate === 'CLIENT_SIGNED') {
    return { ok: true };
  }

  const spouse = partyByRole(parties, 'SPOUSE');
  const buyer = partyByRole(parties, 'BUYER');

  if (spouse && !isSigned(spouse) && isSigned(buyer)) {
    return {
      ok: false,
      reason: 'O contrato ainda aguarda a assinatura do cônjuge anuente.',
    };
  }

  if (!isSigned(buyer)) {
    return {
      ok: false,
      reason: 'O vendedor só pode assinar após a assinatura do comprador.',
    };
  }

  return {
    ok: false,
    reason: 'Aguardando assinatura de todos os compradores.',
  };
}

export function countSignedParties(
  parties: PartyStatusSnapshot[] | null | undefined,
): { signed: number; total: number } {
  const list = (parties || []).filter(
    (p) => !['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase()),
  );
  const total = list.length;
  const signed = list.filter((p) => isSigned(p)).length;
  return { signed, total };
}

export function toPartyStatusSnapshots(
  rows: Array<Pick<ContractSignaturePartyRow, 'role' | 'status' | 'signed_at'>>,
): PartyStatusSnapshot[] {
  return rows.map((row) => ({
    role: row.role,
    status: row.status,
    signed_at: row.signed_at,
  }));
}
