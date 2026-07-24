/**
 * Resolução única do status de assinatura por papel no contrato PDF.
 * Não deduplica por CPF/e-mail — mesma pessoa em dois papéis = dois selos.
 */

export type ContractPartySignatureDisplayRole =
  | 'SELLER'
  | 'BUYER'
  | 'SPOUSE'
  | 'WITNESS'
  | 'COMPANY_REPRESENTATIVE';

export type ContractPartySignatureRecord = {
  id?: string | null;
  role?: string | null;
  status?: string | null;
  signer_name?: string | null;
  signer_cpf?: string | null;
  signed_at?: string | null;
};

export type ResolvedContractPartySignature = {
  signed: boolean;
  signerName?: string;
  signedAt?: string;
  role: ContractPartySignatureDisplayRole;
};

export function onlyDigitsCpf(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

/** Normaliza papéis do banco (VENDOR) e sinônimos para o papel de exibição. */
export function normalizeContractPartyDisplayRole(
  role?: string | null,
): ContractPartySignatureDisplayRole | null {
  const key = String(role || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (
    key === 'SELLER' ||
    key === 'VENDOR' ||
    key === 'COMPANY' ||
    key === 'COMPANY_REPRESENTATIVE'
  ) {
    return key === 'COMPANY_REPRESENTATIVE' ? 'COMPANY_REPRESENTATIVE' : 'SELLER';
  }
  if (key === 'BUYER' || key === 'PURCHASER') return 'BUYER';
  if (key === 'SPOUSE' || key === 'CONJUGE' || key === 'CÔNJUGE') return 'SPOUSE';
  if (key === 'WITNESS' || key === 'TESTEMUNHA') return 'WITNESS';
  return null;
}

function dbRolesForDisplay(
  displayRole: ContractPartySignatureDisplayRole,
): string[] {
  if (displayRole === 'SELLER' || displayRole === 'COMPANY_REPRESENTATIVE') {
    return ['SELLER', 'VENDOR', 'COMPANY', 'COMPANY_REPRESENTATIVE'];
  }
  if (displayRole === 'BUYER') return ['BUYER', 'PURCHASER'];
  if (displayRole === 'SPOUSE') return ['SPOUSE', 'CONJUGE'];
  if (displayRole === 'WITNESS') return ['WITNESS', 'TESTEMUNHA'];
  return [displayRole];
}

function isSignedStatus(status?: string | null): boolean {
  return String(status || '')
    .trim()
    .toUpperCase() === 'SIGNED';
}

function fromRecord(
  row: ContractPartySignatureRecord,
  role: ContractPartySignatureDisplayRole,
): ResolvedContractPartySignature {
  const name = String(row.signer_name || '').trim();
  const signed = isSignedStatus(row.status);
  return {
    signed,
    signerName: name || undefined,
    signedAt: row.signed_at || undefined,
    role,
  };
}

/**
 * Associa assinatura ao bloco do contrato por papel (e partyId), nunca só por CPF.
 *
 * Ordem:
 * 1. partyId
 * 2. papel (VENDOR/SELLER/BUYER/SPOUSE) — todos os matches do mesmo papel
 * 3. fallback papel + CPF normalizado (somente dentro do mesmo papel)
 * 4. legacyFallback (linha principal do processo, ex.: vendor_signed_at)
 */
export function resolveContractPartySignature(input: {
  role: ContractPartySignatureDisplayRole | 'VENDOR' | string;
  partyId?: string | null;
  cpf?: string | null;
  signatures: ContractPartySignatureRecord[];
  legacyFallback?: {
    signed?: boolean;
    signerName?: string | null;
    signedAt?: string | null;
  };
}): ResolvedContractPartySignature {
  const displayRole =
    normalizeContractPartyDisplayRole(input.role) ||
    (String(input.role).toUpperCase() === 'VENDOR'
      ? 'SELLER'
      : ('BUYER' as ContractPartySignatureDisplayRole));

  const safeRole: ContractPartySignatureDisplayRole =
    displayRole === 'COMPANY_REPRESENTATIVE' ? 'SELLER' : displayRole;

  const rows = Array.isArray(input.signatures) ? input.signatures : [];

  if (input.partyId) {
    const byId = rows.find((r) => String(r.id || '') === String(input.partyId));
    if (byId) return fromRecord(byId, safeRole);
  }

  const allowed = new Set(
    dbRolesForDisplay(safeRole).map((r) => r.toUpperCase()),
  );
  const byRole = rows.filter((r) =>
    allowed.has(
      String(r.role || '')
        .trim()
        .toUpperCase(),
    ),
  );

  const signedByRole = byRole.find((r) => isSignedStatus(r.status));
  if (signedByRole) return fromRecord(signedByRole, safeRole);

  const cpfDigits = onlyDigitsCpf(input.cpf);
  if (cpfDigits && byRole.length > 0) {
    const byRoleAndCpf = byRole.find(
      (r) => onlyDigitsCpf(r.signer_cpf) === cpfDigits,
    );
    if (byRoleAndCpf) return fromRecord(byRoleAndCpf, safeRole);
  }

  if (byRole.length > 0) {
    return fromRecord(byRole[0], safeRole);
  }

  const legacy = input.legacyFallback;
  if (legacy?.signed) {
    const name = String(legacy.signerName || '').trim();
    return {
      signed: true,
      signerName: name || undefined,
      signedAt: legacy.signedAt || undefined,
      role: safeRole,
    };
  }

  return { signed: false, role: safeRole };
}

/** Marcadores de texto no HTML do slot de assinatura (modelos Recanto / Meneses / SV2). */
export const CONTRACT_PARTY_SLOT_MARKERS: Record<
  ContractPartySignatureDisplayRole,
  string[]
> = {
  SELLER: [
    'VENDEDOR(A)',
    'PROMITENTE VENDEDOR(A)',
    'PROMITENTE VENDEDOR',
  ],
  BUYER: [
    'COMPRADOR(A)',
    'PROMISSÁRIO(A) COMPRADOR(A)',
    'PROMISSÁRIO COMPRADOR',
  ],
  SPOUSE: ['CÔNJUGE ANUENTE'],
  WITNESS: ['TESTEMUNHA', 'Testemunhas'],
  COMPANY_REPRESENTATIVE: [
    'VENDEDOR(A)',
    'PROMITENTE VENDEDOR',
    'REPRESENTANTE',
  ],
};
