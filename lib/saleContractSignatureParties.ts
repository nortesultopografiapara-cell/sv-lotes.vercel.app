/**
 * Persistência e operações dos participantes (contract_signature_parties).
 */

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
  /** Gera token público (BUYER/SPOUSE). VENDOR = false. */
  withPublicToken?: boolean;
  /** Reutilizar token já gerado (ex.: espelhar BUYER no processo). */
  existingToken?: string | null;
  expiresAt?: string | null;
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
  const withToken =
    input.withPublicToken !== false && isPublicPartyRole(input.role);

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
    signature_data: {},
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
    vendor?: {
      name?: string | null;
      cpf?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
    expiresAt: string;
  },
): Promise<{
  parties: ContractSignaturePartyRow[];
  buyerToken: string;
  spouseToken: string | null;
  buyerSignUrl: string;
  spouseSignUrl: string | null;
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

  const vendorCreated = await insertSignatureParty(supabaseAdmin, {
    companyId: params.companyId,
    contractSignatureId: params.contractSignatureId,
    contractId: params.contractId,
    saleId: params.saleId,
    role: 'VENDOR',
    signerName: params.vendor?.name,
    signerCpf: params.vendor?.cpf,
    signerPhone: params.vendor?.phone,
    signerEmail: params.vendor?.email,
    withPublicToken: false,
    expiresAt: params.expiresAt,
  });
  parties.push(vendorCreated.party);

  return {
    parties,
    buyerToken: params.buyer.token,
    spouseToken,
    buyerSignUrl: buyerCreated.signUrl || buildSaleSignUrl(params.buyer.token),
    spouseSignUrl,
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
      signature_data: patch.signatureData || {},
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
 * Reemite link apenas para BUYER ou SPOUSE ainda não assinados.
 */
export async function reissuePartyPublicLink(
  supabaseAdmin: SupabaseClient,
  party: ContractSignaturePartyRow,
): Promise<CreatedPartyWithToken> {
  const role = String(party.role).toUpperCase();
  if (role !== 'BUYER' && role !== 'SPOUSE') {
    throw new Error('Somente comprador ou cônjuge possuem link público.');
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
  return parties.map((party) => {
    const status = String(party.status).toUpperCase() as SaleSignaturePartyStatus;
    const role = party.role;
    const resolvedUrl = resolvePartySignatureUrl(party.signature_url);
    const canShare =
      isPublicPartyRole(role) &&
      ['PENDING', 'VIEWED'].includes(status) &&
      Boolean(resolvedUrl || party.signature_url);
    const canResend = canShare;
    const publicUrl =
      includeUrls && isPublicPartyRole(role) ? resolvedUrl || party.signature_url : null;

    return {
      id: party.id,
      role,
      roleLabel: saleSignaturePartyRoleLabel(role),
      signer_name: party.signer_name,
      name: party.signer_name,
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
      signature_url: includeUrls && isPublicPartyRole(role) ? publicUrl : undefined,
      signatureUrl: includeUrls
        ? isPublicPartyRole(role)
          ? publicUrl
          : null
        : undefined,
      canResend,
      canShare,
    };
  });
}
