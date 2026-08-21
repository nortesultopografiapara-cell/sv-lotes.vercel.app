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
 * Compatível com 1 VENDOR (modelos clássicos) e N VENDOR (ARAGUAIA).
 * Se existir INTERVENIENT (ARAGUAIA V2), ela é obrigatória para SIGNED.
 */
export function computeAggregateSaleSignatureStatus(
  parties: PartyStatusSnapshot[] | null | undefined,
): SaleSignatureStatus | null {
  if (!parties || parties.length === 0) return null;

  const buyer = partyByRole(parties, 'BUYER');
  const spouse = partyByRole(parties, 'SPOUSE');
  const intervenient = partyByRole(parties, 'INTERVENIENT');
  const vendors = parties.filter(
    (p) => String(p.role).toUpperCase() === 'VENDOR',
  );
  const hasSpouse = Boolean(spouse);
  const hasIntervenient = Boolean(intervenient);

  if (!buyer || vendors.length === 0) return null;

  const allVendorsCancelled = vendors.every(isTerminalCancelled);
  const allCancelled =
    isTerminalCancelled(buyer) &&
    allVendorsCancelled &&
    (!hasSpouse || isTerminalCancelled(spouse)) &&
    (!hasIntervenient || isTerminalCancelled(intervenient));
  if (allCancelled) {
    const anyExpired = [buyer, spouse, intervenient, ...vendors].some(
      (p) => String(p?.status || '').toUpperCase() === 'EXPIRED',
    );
    return anyExpired ? 'EXPIRED' : 'CANCELLED';
  }

  const vendorsAllSigned = vendors.every(isSigned);
  const vendorsAnySigned = vendors.some(isSigned);
  const intervenientSigned = !hasIntervenient || isSigned(intervenient);
  const providersComplete = vendorsAllSigned && intervenientSigned;
  const externalComplete =
    isSigned(buyer) && (!hasSpouse || isSigned(spouse));

  if (externalComplete && providersComplete) {
    return 'SIGNED';
  }

  if (externalComplete) {
    return 'CLIENT_SIGNED';
  }

  const anyExternalSigned =
    isSigned(buyer) || (hasSpouse && isSigned(spouse));
  const anyProviderSigned =
    vendorsAnySigned || (hasIntervenient && isSigned(intervenient));

  if (anyExternalSigned || anyProviderSigned) {
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
    const vendors = parties.filter(
      (p) => String(p.role).toUpperCase() === 'VENDOR',
    );
    const pendingVendor = vendors.some((p) => !isSigned(p));
    const intervenient = partyByRole(parties, 'INTERVENIENT');
    const pendingIntervenient =
      Boolean(intervenient) && !isSigned(intervenient);
    if (pendingVendor || pendingIntervenient) return { ok: true };
    return {
      ok: false,
      reason: 'Este contrato já foi assinado pelo vendedor.',
    };
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

/** Parties VENDOR ainda pendentes. */
export function listPendingVendorParties<
  T extends { role: string; status: string },
>(parties: T[] | null | undefined): T[] {
  return (parties || []).filter(
    (p) =>
      String(p.role).toUpperCase() === 'VENDOR' &&
      String(p.status).toUpperCase() !== 'SIGNED' &&
      !['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase()),
  );
}

export function allVendorPartiesSigned(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  const vendors = (parties || []).filter(
    (p) => String(p.role).toUpperCase() === 'VENDOR',
  );
  return vendors.length > 0 && vendors.every(isSigned);
}

/** INTERVENIENT presente e ainda não SIGNED (ARAGUAIA V2). */
export function listPendingIntervenientParties<
  T extends { role: string; status: string },
>(parties: T[] | null | undefined): T[] {
  return (parties || []).filter(
    (p) =>
      String(p.role).toUpperCase() === 'INTERVENIENT' &&
      String(p.status).toUpperCase() !== 'SIGNED' &&
      !['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase()),
  );
}

export function isIntervenientPartySigned(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  const intervenient = partyByRole(parties || [], 'INTERVENIENT');
  if (!intervenient) return true;
  return isSigned(intervenient);
}

/** Providers ARAGUAIA: todos VENDOR + INTERVENIENT (se houver). */
export function allAraguaiaProviderPartiesSigned(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  return allVendorPartiesSigned(parties) && isIntervenientPartySigned(parties);
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
