/**
 * Persistência e operações dos participantes (contract_signature_parties).
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSaleSignUrl, resolvePartySignatureUrl } from '@/lib/saleContractUrls';
import { signatureExpiresAt } from '@/lib/saasContractSignatureService';
import { maskCpfPublic } from '@/lib/signaturePrivacy';
import {
  createSaleSignaturePartyToken,
  hashSaleSignaturePartyToken,
} from '@/lib/saleContractSignaturePartyTokens';
import type {
  ContractSignaturePartyRow,
  SaleSignaturePartyPublicView,
  SaleSignaturePartyRole,
  SaleSignaturePartyStatus,
} from '@/lib/saleContractSignaturePartyTypes';
import {
  isPublicPartyRole,
  saleSignaturePartyRoleLabel,
  saleSignaturePartyStatusLabel,
} from '@/lib/saleContractSignaturePartyTypes';

/**
 * Garante UUID individual da assinatura da party em `signature_data`
 * (mesmo padrão de `signature_event_id` do processo / evidências).
 */
export function ensurePartySignatureEventData(
  base?: Record<string, unknown> | null,
): Record<string, unknown> {
  const existing = base && typeof base === 'object' ? { ...base } : {};
  const fromData = String(
    existing.signature_event_id || existing.signature_id || '',
  ).trim();
  const id = fromData || randomUUID();
  return {
    ...existing,
    signature_event_id: id,
    signature_id: id,
  };
}

/** Lê o ID único persistido da party (metadata ou fallback ao party.id). */
export function readPartySignatureEventId(
  party: {
    id?: string | null;
    signature_data?: Record<string, unknown> | null;
  } | null | undefined,
): string | null {
  if (!party) return null;
  const data =
    party.signature_data && typeof party.signature_data === 'object'
      ? party.signature_data
      : {};
  const fromData = String(
    data.signature_event_id || data.signature_id || '',
  ).trim();
  if (fromData) return fromData;
  const partyId = String(party.id || '').trim();
  return partyId || null;
}

export type CreatePartyInput = {
  companyId: string;
  contractSignatureId: string;
  contractId: string;
  saleId?: string | null;
  role: SaleSignaturePartyRole;
  signerName?: string | null;
  signerCpf?: string | null;
  signerPhone?: string | null;
  signerEmail?: string | null;
  /** Gera token público (BUYER/SPOUSE). VENDOR = false. INTERVENIENT = false. */
  withPublicToken?: boolean;
  /** Reutilizar token já gerado (ex.: espelhar BUYER no processo). */
  existingToken?: string | null;
  expiresAt?: string | null;
  /** Metadados iniciais (ex.: PJ INTERVENIENT: company/representative). */
  signatureData?: Record<string, unknown> | null;
};

export type CreatedPartyWithToken = {
  party: ContractSignaturePartyRow;
  /** Token plaintext — só retornado na criação; não logar. */
  token: string | null;
  signUrl: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function listSignatureParties(
  supabaseAdmin: SupabaseClient,
  contractSignatureId: string,
): Promise<ContractSignaturePartyRow[]> {
  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .select('*')
    .eq('contract_signature_id', contractSignatureId)
    .order('created_at', { ascending: true });

  if (error) {
    if (/contract_signature_parties|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    console.warn('[signature-parties] list', error.message);
    return [];
  }
  return (data || []) as ContractSignaturePartyRow[];
}

export async function listSignaturePartiesByContract(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  contractSignatureId?: string | null,
): Promise<ContractSignaturePartyRow[]> {
  if (contractSignatureId) {
    return listSignatureParties(supabaseAdmin, contractSignatureId);
  }
  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });

  if (error) {
    if (/contract_signature_parties|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    return [];
  }
  return (data || []) as ContractSignaturePartyRow[];
}

export async function getPartyByTokenHash(
  supabaseAdmin: SupabaseClient,
  tokenHash: string,
): Promise<ContractSignaturePartyRow | null> {
  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .select('*')
    .eq('signature_token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  return data as ContractSignaturePartyRow;
}

export async function getPartyByPublicToken(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<ContractSignaturePartyRow | null> {
  const hash = hashSaleSignaturePartyToken(token);
  return getPartyByTokenHash(supabaseAdmin, hash);
}

export async function insertSignatureParty(
  supabaseAdmin: SupabaseClient,
  input: CreatePartyInput,
): Promise<CreatedPartyWithToken> {
  // withPublicToken: true força token (ex.: VENDOR ARAGUAIA).
  // false impede token. undefined → token só se role público (BUYER/SPOUSE).
  const withToken =
    input.withPublicToken === true ||
    (input.withPublicToken !== false && isPublicPartyRole(input.role));

  let token: string | null = null;
  let tokenHash: string | null = null;
  let signUrl: string | null = null;

  if (withToken) {
    if (input.existingToken) {
      token = input.existingToken;
      tokenHash = hashSaleSignaturePartyToken(token);
    } else {
      const created = createSaleSignaturePartyToken();
      token = created.token;
      tokenHash = created.tokenHash;
    }
    signUrl = buildSaleSignUrl(token);
  }

  const expiresAt = input.expiresAt || (withToken ? signatureExpiresAt() : null);
  const sentAt = nowIso();

  const payload = {
    company_id: input.companyId,
    contract_signature_id: input.contractSignatureId,
    contract_id: input.contractId,
    sale_id: input.saleId || null,
    role: input.role,
    signer_name: input.signerName || null,
    signer_cpf: input.signerCpf || null,
    signer_phone: input.signerPhone || null,
    signer_email: input.signerEmail || null,
    signature_token_hash: tokenHash,
    signature_url: signUrl,
    status: 'PENDING' as SaleSignaturePartyStatus,
    sent_at: sentAt,
    expires_at: expiresAt,
    signature_data: input.signatureData
      ? { ...input.signatureData }
      : {},
    created_at: sentAt,
    updated_at: sentAt,
  };

  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Falha ao criar participante ${input.role}: ${error?.message || 'sem retorno'}`,
    );
  }

  return {
    party: data as ContractSignaturePartyRow,
    token,
    signUrl,
  };
}

export async function createPartiesForSignatureProcess(
  supabaseAdmin: SupabaseClient,
  params: {
    companyId: string;
    contractSignatureId: string;
    contractId: string;
    saleId?: string | null;
    buyer: {
      name?: string | null;
      cpf?: string | null;
      phone?: string | null;
      email?: string | null;
      token: string;
    };
    spouse?: {
      name: string;
      cpf: string;
      phone?: string | null;
      email?: string | null;
    } | null;
    /** Um VENDOR (modelos clássicos). Ignorado se `vendors` for informado. */
    vendor?: {
      name?: string | null;
      cpf?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
    /** N VENDORs (ARAGUAIA). Cada um com token público próprio. */
    vendors?: Array<{
      name?: string | null;
      cpf?: string | null;
      phone?: string | null;
      email?: string | null;
      withPublicToken?: boolean;
    }> | null;
    /**
     * INTERVENIENT (ARAGUAIA V2 — PJ). Só persistir quando o schema aceitar o role
     * e o caller passar o objeto (ver ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT).
     */
    intervenient?: {
      name?: string | null;
      cnpj?: string | null;
      phone?: string | null;
      email?: string | null;
      signatureData?: Record<string, unknown> | null;
    } | null;
    expiresAt: string;
  },
): Promise<{
  parties: ContractSignaturePartyRow[];
  buyerToken: string;
  spouseToken: string | null;
  buyerSignUrl: string;
  spouseSignUrl: string | null;
  vendorTokens: Array<{ partyId: string; token: string | null; signUrl: string | null }>;
  intervenientPartyId: string | null;
}> {
  const buyerCreated = await insertSignatureParty(supabaseAdmin, {
    companyId: params.companyId,
    contractSignatureId: params.contractSignatureId,
    contractId: params.contractId,
    saleId: params.saleId,
    role: 'BUYER',
    signerName: params.buyer.name,
    signerCpf: params.buyer.cpf,
    signerPhone: params.buyer.phone,
    signerEmail: params.buyer.email,
    existingToken: params.buyer.token,
    expiresAt: params.expiresAt,
  });

  let spouseToken: string | null = null;
  let spouseSignUrl: string | null = null;
  const parties: ContractSignaturePartyRow[] = [buyerCreated.party];

  if (params.spouse) {
    const spouseCreated = await insertSignatureParty(supabaseAdmin, {
      companyId: params.companyId,
      contractSignatureId: params.contractSignatureId,
      contractId: params.contractId,
      saleId: params.saleId,
      role: 'SPOUSE',
      signerName: params.spouse.name,
      signerCpf: params.spouse.cpf,
      signerPhone: params.spouse.phone,
      signerEmail: params.spouse.email,
      expiresAt: params.expiresAt,
    });
    parties.push(spouseCreated.party);
    spouseToken = spouseCreated.token;
    spouseSignUrl = spouseCreated.signUrl;
  }

  type VendorPartyInput = {
    name?: string | null;
    cpf?: string | null;
    phone?: string | null;
    email?: string | null;
    withPublicToken?: boolean;
  };

  const vendorInputs: VendorPartyInput[] =
    params.vendors && params.vendors.length > 0
      ? params.vendors
      : params.vendor
        ? [params.vendor]
        : [{ name: null, cpf: null, phone: null, email: null }];

  const vendorTokens: Array<{
    partyId: string;
    token: string | null;
    signUrl: string | null;
  }> = [];

  for (const vendor of vendorInputs) {
    const multiPublic = Boolean(params.vendors && params.vendors.length > 0);
    const vendorCreated = await insertSignatureParty(supabaseAdmin, {
      companyId: params.companyId,
      contractSignatureId: params.contractSignatureId,
      contractId: params.contractId,
      saleId: params.saleId,
      role: 'VENDOR',
      signerName: vendor.name,
      signerCpf: vendor.cpf,
      signerPhone: vendor.phone,
      signerEmail: vendor.email,
      withPublicToken:
        vendor.withPublicToken === true
          ? true
          : multiPublic
            ? true
            : false,
      expiresAt: params.expiresAt,
    });
    parties.push(vendorCreated.party);
    vendorTokens.push({
      partyId: vendorCreated.party.id,
      token: vendorCreated.token,
      signUrl: vendorCreated.signUrl,
    });
  }

  let intervenientPartyId: string | null = null;
  if (params.intervenient) {
    const intervenientCreated = await insertSignatureParty(supabaseAdmin, {
      companyId: params.companyId,
      contractSignatureId: params.contractSignatureId,
      contractId: params.contractId,
      saleId: params.saleId,
      role: 'INTERVENIENT',
      signerName: params.intervenient.name,
      signerCpf: params.intervenient.cnpj,
      signerPhone: params.intervenient.phone,
      signerEmail: params.intervenient.email,
      withPublicToken: false,
      expiresAt: params.expiresAt,
      signatureData: params.intervenient.signatureData || null,
    });
    parties.push(intervenientCreated.party);
    intervenientPartyId = intervenientCreated.party.id;
  }

  return {
    parties,
    buyerToken: params.buyer.token,
    spouseToken,
    buyerSignUrl: buyerCreated.signUrl || buildSaleSignUrl(params.buyer.token),
    spouseSignUrl,
    vendorTokens,
    intervenientPartyId,
  };
}

export async function markPartyViewed(
  supabaseAdmin: SupabaseClient,
  party: ContractSignaturePartyRow,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ContractSignaturePartyRow> {
  if (String(party.status).toUpperCase() !== 'PENDING') {
    return party;
  }
  const now = nowIso();
  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .update({
      status: 'VIEWED',
      viewed_at: now,
      ip_address: meta.ipAddress || party.ip_address,
      user_agent: meta.userAgent || party.user_agent,
      updated_at: now,
    })
    .eq('id', party.id)
    .eq('status', 'PENDING')
    .select('*')
    .maybeSingle();

  if (error || !data) return party;
  return data as ContractSignaturePartyRow;
}

export async function markPartySigned(
  supabaseAdmin: SupabaseClient,
  partyId: string,
  patch: {
    signerName: string;
    signerCpf: string;
    signerEmail?: string | null;
    signerPhone?: string | null;
    signatureHash: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    signatureData?: Record<string, unknown>;
    signedAt?: string;
  },
): Promise<ContractSignaturePartyRow> {
  const signedAt = patch.signedAt || nowIso();
  const signatureData = ensurePartySignatureEventData(patch.signatureData);
  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .update({
      status: 'SIGNED',
      signed_at: signedAt,
      signer_name: patch.signerName,
      signer_cpf: patch.signerCpf,
      signer_email: patch.signerEmail ?? null,
      signer_phone: patch.signerPhone ?? null,
      signature_hash: patch.signatureHash,
      ip_address: patch.ipAddress || null,
      user_agent: patch.userAgent || null,
      signature_data: signatureData,
      updated_at: signedAt,
    })
    .eq('id', partyId)
    .in('status', ['PENDING', 'VIEWED'])
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Falha ao registrar assinatura do participante: ${error?.message || 'já assinado ou indisponível'}`,
    );
  }
  return data as ContractSignaturePartyRow;
}

/**
 * Reemite link para BUYER, SPOUSE ou VENDOR (com token público) ainda não assinados.
 */
export async function reissuePartyPublicLink(
  supabaseAdmin: SupabaseClient,
  party: ContractSignaturePartyRow,
): Promise<CreatedPartyWithToken> {
  const role = String(party.role).toUpperCase();
  const isVendorWithLink =
    role === 'VENDOR' &&
    Boolean(party.signature_url || party.signature_token_hash);
  if (role !== 'BUYER' && role !== 'SPOUSE' && !isVendorWithLink) {
    throw new Error(
      'Somente comprador, cônjuge ou vendedor com link público podem reemitir.',
    );
  }
  if (String(party.status).toUpperCase() === 'SIGNED') {
    throw new Error(
      'Este participante já assinou. Não é possível gerar novo link sem reabertura administrativa.',
    );
  }
  if (['CANCELLED', 'EXPIRED'].includes(String(party.status).toUpperCase())) {
    throw new Error('Participante cancelado ou expirado. Envie o contrato novamente.');
  }

  const { token, tokenHash } = createSaleSignaturePartyToken();
  const signUrl = buildSaleSignUrl(token);
  const now = nowIso();
  const expiresAt = signatureExpiresAt();

  const { data, error } = await supabaseAdmin
    .from('contract_signature_parties')
    .update({
      signature_token_hash: tokenHash,
      signature_url: signUrl,
      status: 'PENDING',
      sent_at: now,
      viewed_at: null,
      cancelled_at: null,
      expires_at: expiresAt,
      updated_at: now,
    })
    .eq('id', party.id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao reemitir link.');
  }

  return {
    party: data as ContractSignaturePartyRow,
    token,
    signUrl,
  };
}

export function toPublicPartyViews(
  parties: ContractSignaturePartyRow[],
  options?: { includeUrls?: boolean },
): SaleSignaturePartyPublicView[] {
  const includeUrls = options?.includeUrls !== false;
  const order: Record<string, number> = {
    BUYER: 1,
    SPOUSE: 2,
    VENDOR: 3,
    INTERVENIENT: 4,
    WITNESS_1: 5,
    WITNESS_2: 6,
  };

  const views = parties.map((party) => {
    const status = String(party.status).toUpperCase() as SaleSignaturePartyStatus;
    const role = party.role;
    const roleKey = String(role).toUpperCase();
    const resolvedUrl = resolvePartySignatureUrl(party.signature_url);
    const hasPublicLink = Boolean(resolvedUrl || party.signature_url);
    // BUYER/SPOUSE sempre públicos; VENDOR compartilhável quando tem token/URL (ARAGUAIA).
    // INTERVENIENT: assinatura administrativa — sem compartilhamento público.
    const shareableRole =
      isPublicPartyRole(role) ||
      (roleKey === 'VENDOR' && hasPublicLink);
    const canShare =
      shareableRole &&
      ['PENDING', 'VIEWED'].includes(status) &&
      hasPublicLink;
    const canResend = canShare;
    const publicUrl = includeUrls && shareableRole ? resolvedUrl || party.signature_url || null : null;

    const sigData =
      party.signature_data && typeof party.signature_data === 'object'
        ? party.signature_data
        : {};
    const representativeName =
      roleKey === 'INTERVENIENT'
        ? String(sigData.representative_name || '').trim() || null
        : null;
    const representativeCpf =
      roleKey === 'INTERVENIENT'
        ? String(sigData.representative_cpf || '').trim() || null
        : null;
    const companyCnpj =
      roleKey === 'INTERVENIENT'
        ? String(sigData.company_cnpj || party.signer_cpf || '').trim() || null
        : null;

    return {
      id: party.id,
      role,
      roleLabel: saleSignaturePartyRoleLabel(role),
      signer_name: party.signer_name,
      name: party.signer_name,
      signer_cpf: includeUrls ? party.signer_cpf : undefined,
      signer_cpf_masked: party.signer_cpf
        ? maskCpfPublic(party.signer_cpf)
        : null,
      signer_phone: party.signer_phone,
      phone: party.signer_phone,
      signer_email: party.signer_email,
      email: party.signer_email,
      status,
      statusLabel: saleSignaturePartyStatusLabel(status),
      sent_at: party.sent_at,
      viewed_at: party.viewed_at,
      signed_at: party.signed_at,
      expires_at: party.expires_at,
      signature_url: includeUrls && shareableRole ? publicUrl : undefined,
      signatureUrl: includeUrls
        ? shareableRole
          ? publicUrl
          : null
        : undefined,
      canResend,
      canShare,
      missingPublicUrl:
        includeUrls &&
        shareableRole &&
        ['PENDING', 'VIEWED'].includes(status) &&
        !publicUrl,
      representativeName,
      representativeCpfMasked: representativeCpf
        ? maskCpfPublic(representativeCpf)
        : null,
      companyCnpjMasked: companyCnpj ? maskCpfPublic(companyCnpj) : null,
    };
  });

  return views.sort(
    (a, b) => (order[a.role] || 9) - (order[b.role] || 9),
  );
}
