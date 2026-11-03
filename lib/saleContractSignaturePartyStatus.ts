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
 * Se existirem INTERVENIENT / WITNESS_* (ARAGUAIA V2), são obrigatórias para SIGNED.
 */
export function computeAggregateSaleSignatureStatus(
  parties: PartyStatusSnapshot[] | null | undefined,
): SaleSignatureStatus | null {
  if (!parties || parties.length === 0) return null;

  const buyer = partyByRole(parties, 'BUYER');
  const spouse = partyByRole(parties, 'SPOUSE');
  const intervenient = partyByRole(parties, 'INTERVENIENT');
  const witnesses = parties.filter((p) => {
    const role = String(p.role).toUpperCase();
    return role === 'WITNESS_1' || role === 'WITNESS_2';
  });
  const legalReps = parties.filter(
    (p) => String(p.role).toUpperCase() === 'LEGAL_REPRESENTATIVE',
  );
  const hasLegalReps = legalReps.length > 0;
  const legalRepsAllSigned = !hasLegalReps || legalReps.every(isSigned);
  const vendors = parties.filter(
    (p) => String(p.role).toUpperCase() === 'VENDOR',
  );
  const hasSpouse = Boolean(spouse);
  const hasIntervenient = Boolean(intervenient);
  const hasWitnesses = witnesses.length > 0;

  if (!buyer || vendors.length === 0) return null;

  const allVendorsCancelled = vendors.every(isTerminalCancelled);
  const allWitnessesCancelled =
    !hasWitnesses || witnesses.every(isTerminalCancelled);
  const allCancelled =
    isTerminalCancelled(buyer) &&
    allVendorsCancelled &&
    (!hasSpouse || isTerminalCancelled(spouse)) &&
    (!hasIntervenient || isTerminalCancelled(intervenient)) &&
    allWitnessesCancelled;
  if (allCancelled) {
    const anyExpired = [
      buyer,
      spouse,
      intervenient,
      ...vendors,
      ...witnesses,
    ].some((p) => String(p?.status || '').toUpperCase() === 'EXPIRED');
    return anyExpired ? 'EXPIRED' : 'CANCELLED';
  }

  const vendorsAllSigned = vendors.every(isSigned);
  const vendorsAnySigned = vendors.some(isSigned);
  const intervenientSigned = !hasIntervenient || isSigned(intervenient);
  const witnessesAllSigned = !hasWitnesses || witnesses.every(isSigned);
  const witnessesAnySigned = witnesses.some(isSigned);
  const providersComplete =
    vendorsAllSigned && intervenientSigned && witnessesAllSigned;
  const externalComplete = hasLegalReps
    ? legalRepsAllSigned && (!hasSpouse || isSigned(spouse))
    : isSigned(buyer) && (!hasSpouse || isSigned(spouse));

  if (externalComplete && providersComplete) {
    return 'SIGNED';
  }

  if (externalComplete) {
    return 'CLIENT_SIGNED';
  }

  const anyExternalSigned =
    isSigned(buyer) ||
    (hasSpouse && isSigned(spouse)) ||
    legalReps.some(isSigned);
  const anyProviderSigned =
    vendorsAnySigned ||
    (hasIntervenient && isSigned(intervenient)) ||
    witnessesAnySigned;

  if (anyExternalSigned || anyProviderSigned) {
    return 'PARTIALLY_SIGNED';
  }

  if (
    isViewed(buyer) ||
    (hasSpouse && isViewed(spouse)) ||
    legalReps.some(isViewed) ||
    witnesses.some(isViewed)
  ) {
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
    const pendingWitness = listPendingWitnessParties(parties).length > 0;
    // Ainda há providers/testemunhas: admin pode assinar VENDOR/INTERVENIENT.
    if (pendingVendor || pendingIntervenient) return { ok: true };
    if (pendingWitness) {
      return {
        ok: false,
        reason:
          'Aguardando assinatura das testemunhas para concluir o contrato.',
      };
    }
    return {
      ok: false,
      reason: 'Este contrato já foi assinado pelo vendedor.',
    };
  }

  const spouse = partyByRole(parties, 'SPOUSE');
  const buyer = partyByRole(parties, 'BUYER');
  const legalReps = parties.filter(
    (p) => String(p.role).toUpperCase() === 'LEGAL_REPRESENTATIVE',
  );
  if (legalReps.length > 0) {
    if (!legalReps.every(isSigned)) {
      return {
        ok: false,
        reason:
          'O vendedor só pode assinar após a assinatura dos representantes legais.',
      };
    }
    if (spouse && !isSigned(spouse)) {
      return {
        ok: false,
        reason: 'O contrato ainda aguarda a assinatura do cônjuge anuente.',
      };
    }
    return { ok: true };
  }

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

export function listPendingWitnessParties<
  T extends { role: string; status: string },
>(parties: T[] | null | undefined): T[] {
  return (parties || []).filter((p) => {
    const role = String(p.role).toUpperCase();
    return (
      (role === 'WITNESS_1' || role === 'WITNESS_2') &&
      String(p.status).toUpperCase() !== 'SIGNED' &&
      !['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase())
    );
  });
}

export function allWitnessPartiesSigned(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  const witnesses = (parties || []).filter((p) => {
    const role = String(p.role).toUpperCase();
    return role === 'WITNESS_1' || role === 'WITNESS_2';
  });
  if (witnesses.length === 0) return true;
  return witnesses.every(isSigned);
}

/** Destino ARAGUAIA V2 completo: VENDORs + INTERVENIENT + testemunhas. */
export function allAraguaiaV2RequiredPartiesSigned(
  parties: PartyStatusSnapshot[] | null | undefined,
): boolean {
  const legalReps = (parties || []).filter(
    (p) => String(p.role).toUpperCase() === 'LEGAL_REPRESENTATIVE',
  );
  const buyerSideSigned =
    legalReps.length > 0
      ? legalReps.every(isSigned)
      : isSigned(partyByRole(parties || [], 'BUYER'));
  return (
    allAraguaiaProviderPartiesSigned(parties) &&
    allWitnessPartiesSigned(parties) &&
    buyerSideSigned
  );
}

export type LegalEntityBuyerProcessEvidence = {
  signerName: string;
  signerDocument: string;
  signedAt: string;
};

/**
 * Evidência do processo quando a PJ é a parte BUYER e os signatários são os
 * representantes. Não altera a party BUYER.
 */
export function buyerProcessEvidenceFromLegalRepresentatives(
  parties: Array<{
    role: string;
    status?: string | null;
    signer_name?: string | null;
    signer_cpf?: string | null;
    signed_at?: string | null;
  }> | null | undefined,
): LegalEntityBuyerProcessEvidence | null {
  const list = parties || [];
  const reps = list.filter(
    (p) => String(p.role).toUpperCase() === 'LEGAL_REPRESENTATIVE',
  );
  if (reps.length === 0) return null;
  const complete = reps.every(
    (p) =>
      String(p.status || '').toUpperCase() === 'SIGNED' &&
      String(p.signed_at || '').trim(),
  );
  if (!complete) return null;

  const buyer = list.find((p) => String(p.role).toUpperCase() === 'BUYER');
  const signerName = String(buyer?.signer_name || '').trim();
  const signerDocument = String(buyer?.signer_cpf || '').replace(/\D/g, '');
  if (!signerName || signerDocument.length !== 14) return null;

  const signedAt = reps
    .map((p) => String(p.signed_at || '').trim())
    .sort()
    .at(-1);
  if (!signedAt) return null;
  return { signerName, signerDocument, signedAt };
}

export function countSignedParties(
  parties: PartyStatusSnapshot[] | null | undefined,
): { signed: number; total: number } {
  const hasLegalReps = (parties || []).some(
    (p) => String(p.role).toUpperCase() === 'LEGAL_REPRESENTATIVE',
  );
  const list = (parties || []).filter((p) => {
    if (['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase())) {
      return false;
    }
    if (hasLegalReps && String(p.role).toUpperCase() === 'BUYER') return false;
    return true;
  });
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
