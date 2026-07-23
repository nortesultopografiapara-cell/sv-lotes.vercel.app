/**
 * Fluxo de participantes na assinatura eletrônica de venda.
 * Integra parties com o processo contract_signatures (compatível com legado).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { onlyDigits } from '@/lib/inputMasks';
import { normalizeSaleContractModel } from '@/lib/contractModel';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import {
  assertSpouseReadyForSignatureSend,
  shouldCreateSpouseSignatureParty,
} from '@/lib/saleContractSignaturePartyRules';
import {
  createPartiesForSignatureProcess,
  getPartyByPublicToken,
  listSignatureParties,
  markPartySigned,
  markPartyViewed,
  reissuePartyPublicLink,
  type CreatedPartyWithToken,
} from '@/lib/saleContractSignatureParties';
import {
  canVendorSignFromParties,
  computeAggregateSaleSignatureStatus,
  toPartyStatusSnapshots,
} from '@/lib/saleContractSignaturePartyStatus';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import { maskSignatureTokenForLog } from '@/lib/saleContractSignaturePartyTokens';
import {
  buildSignatureHashPayload,
  computeSignatureHash,
} from '@/lib/saasContractSignaturePdf';
import {
  isValidSignerEmail,
  normalizeSignerEmail,
} from '@/lib/saleContractEmailValidation';
import { logSignatureEvent, type SignatureEventType } from '@/lib/signatureEventService';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureErrors';
import type { SaleSignatureStatus } from '@/lib/saleContractSignatureStatus';
import { canPublicSaleSign } from '@/lib/saleContractSignatureStatus';
import { isSignatureExpired } from '@/lib/saasContractSignatureService';

/** Subconjunto do processo — evita import circular com saleContractSignatureService. */
export type SignatureProcessRow = {
  id: string;
  contract_id: string;
  tenant_id: string;
  signature_token: string;
  signature_status: SaleSignatureStatus | string;
  signed_at?: string | null;
  signer_name?: string | null;
  signer_document?: string | null;
  signer_email?: string | null;
  signer_phone?: string | null;
  viewed_at?: string | null;
  signature_hash?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  [key: string]: unknown;
};

export type SendPartiesResult = {
  parties: ContractSignaturePartyRow[];
  spouseSignUrl: string | null;
  spouseRequired: boolean;
};

async function loadSaleAndCompanyForSignature(
  supabaseAdmin: SupabaseClient,
  contractRow: Record<string, unknown>,
): Promise<{
  sale: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  contractModel: string;
  customer: Record<string, unknown> | null;
}> {
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  const saleId = contractRow.sale_id ? String(contractRow.sale_id) : null;
  const customerId = contractRow.customer_id
    ? String(contractRow.customer_id)
    : null;

  let company: Record<string, unknown> | null = null;
  if (tenantId) {
    const { data } = await supabaseAdmin
      .from('companies')
      .select('id, contract_model, fantasy_name, name, cnpj, email, phone, representative_name, representative_cpf, legal_representative_name, legal_representative_cpf')
      .eq('id', tenantId)
      .maybeSingle();
    company = (data as Record<string, unknown>) || null;
  }

  let sale: Record<string, unknown> | null = null;
  if (saleId) {
    const { data } = await supabaseAdmin
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();
    sale = (data as Record<string, unknown>) || null;
  }

  let customer: Record<string, unknown> | null = null;
  if (customerId) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select('id, name, cpf, cpf_cnpj, document, phone, email, contact_email')
      .eq('id', customerId)
      .maybeSingle();
    customer = (data as Record<string, unknown>) || null;
  }

  return {
    sale,
    company,
    contractModel: normalizeSaleContractModel(company?.contract_model),
    customer,
  };
}

/**
 * Valida cônjuge (se aplicável) e cria parties após insert do processo.
 */
export async function createSignaturePartiesAfterSend(
  supabaseAdmin: SupabaseClient,
  params: {
    signature: SignatureProcessRow;
    contractRow: Record<string, unknown>;
    buyerToken: string;
    expiresAt: string;
  },
): Promise<SendPartiesResult> {
  const { sale, company, contractModel, customer } =
    await loadSaleAndCompanyForSignature(supabaseAdmin, params.contractRow);

  const storedHtml = readStoredContractHtml(params.contractRow) || '';
  const spouseCheck = assertSpouseReadyForSignatureSend({
    contractModel,
    sale,
    contractHtml: storedHtml,
  });

  if (!spouseCheck.ok) {
    throw new SaleContractSignatureError(spouseCheck.message, 'validation');
  }

  const spouseRequired = shouldCreateSpouseSignatureParty({
    contractModel,
    sale,
    contractHtml: storedHtml,
  });

  const spouseData =
    spouseRequired && spouseCheck.ok && !('skipped' in spouseCheck)
      ? spouseCheck
      : null;

  const seller = company
    ? normalizeSellerFromCompany(company)
    : { representative: '', representativeCpf: '', email: '', phone: '' };

  const buyerName =
    String(customer?.name || '').trim() ||
    String(params.contractRow.signed_by_name || '').trim() ||
    null;
  const buyerCpf = onlyDigits(
    String(customer?.cpf || customer?.cpf_cnpj || customer?.document || ''),
  );
  const buyerPhone = String(customer?.phone || '').trim() || null;
  const buyerEmail =
    String(customer?.email || customer?.contact_email || '').trim() || null;

  const companyId = String(
    params.contractRow.company_id ||
      params.contractRow.tenant_id ||
      params.signature.tenant_id,
  );

  try {
    const created = await createPartiesForSignatureProcess(supabaseAdmin, {
      companyId,
      contractSignatureId: params.signature.id,
      contractId: params.signature.contract_id,
      saleId: params.contractRow.sale_id
        ? String(params.contractRow.sale_id)
        : null,
      buyer: {
        name: buyerName,
        cpf: buyerCpf || null,
        phone: buyerPhone,
        email: buyerEmail,
        token: params.buyerToken,
      },
      spouse: spouseData
        ? {
            name: spouseData.name,
            cpf: spouseData.cpf,
            phone: spouseData.phone || null,
            email: spouseData.email || null,
          }
        : null,
      vendor: {
        name:
          seller.representative !== 'Não informado'
            ? seller.representative
            : null,
        cpf: seller.representativeCpf || null,
        email: seller.email !== 'Não informado' ? seller.email : null,
      },
      expiresAt: params.expiresAt,
    });

    await logSignatureEvent(supabaseAdmin, {
      signatureToken: params.buyerToken,
      signatureSource: 'SALE',
      signatureRecordId: params.signature.id,
      eventType: 'BUYER_LINK_CREATED',
      personName: buyerName,
      eventDescription: 'Link individual do comprador criado.',
      metadata: {
        role: 'BUYER',
        tokenPreview: maskSignatureTokenForLog(params.buyerToken),
      },
    });

    if (created.spouseToken) {
      await logSignatureEvent(supabaseAdmin, {
        signatureToken: created.spouseToken,
        signatureSource: 'SALE',
        signatureRecordId: params.signature.id,
        eventType: 'SPOUSE_LINK_CREATED',
        personName: spouseData?.name,
        eventDescription: 'Link individual do cônjuge anuente criado.',
        metadata: {
          role: 'SPOUSE',
          tokenPreview: maskSignatureTokenForLog(created.spouseToken),
        },
      });
    }

    return {
      parties: created.parties,
      spouseSignUrl: created.spouseSignUrl,
      spouseRequired,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/contract_signature_parties|does not exist|schema cache/i.test(message)) {
      console.warn(
        '[signature-parties] tabela ausente — fluxo legado sem parties',
      );
      return { parties: [], spouseSignUrl: null, spouseRequired: false };
    }
    throw err;
  }
}

export async function syncAggregateSignatureStatus(
  supabaseAdmin: SupabaseClient,
  signature: SignatureProcessRow,
  parties?: ContractSignaturePartyRow[],
): Promise<{
  aggregate: SaleSignatureStatus | null;
  signature: SignatureProcessRow;
  parties: ContractSignaturePartyRow[];
}> {
  const list =
    parties || (await listSignatureParties(supabaseAdmin, signature.id));
  const aggregate = computeAggregateSaleSignatureStatus(
    toPartyStatusSnapshots(list),
  );

  if (!aggregate) {
    return { aggregate: null, signature, parties: list };
  }

  const now = new Date().toISOString();
  const buyer = list.find((p) => p.role === 'BUYER');
  const patch: Record<string, unknown> = {
    signature_status: aggregate,
    updated_at: now,
  };

  if (buyer?.signed_at && buyer.status === 'SIGNED') {
    patch.signer_name = buyer.signer_name;
    patch.signer_document = buyer.signer_cpf;
    patch.signer_email = buyer.signer_email;
    patch.signer_phone = buyer.signer_phone;
    patch.signed_at = buyer.signed_at;
    patch.signature_hash = buyer.signature_hash;
    patch.ip_address = buyer.ip_address;
    patch.user_agent = buyer.user_agent;
  }

  if (buyer?.viewed_at) {
    patch.viewed_at = buyer.viewed_at;
  }

  const { data } = await supabaseAdmin
    .from('contract_signatures')
    .update(patch)
    .eq('id', signature.id)
    .select('*')
    .single();

  const updated = (data as SignatureProcessRow) || {
    ...signature,
    ...patch,
  };

  const contractPatch: Record<string, unknown> = {
    signature_status: aggregate,
    updated_at: now,
  };

  if (aggregate === 'CLIENT_SIGNED') {
    contractPatch.status = 'client_signed';
    if (buyer?.signed_at) {
      contractPatch.signed_at = buyer.signed_at;
      contractPatch.signed_by_name = buyer.signer_name;
      contractPatch.signed_by_cpf = buyer.signer_cpf;
    }
  } else if (aggregate === 'PARTIALLY_SIGNED' || aggregate === 'VIEWED' || aggregate === 'PENDING') {
    const currentStatus = String(
      (await supabaseAdmin
        .from('contracts')
        .select('status')
        .eq('id', signature.contract_id)
        .maybeSingle()).data?.status || '',
    ).toLowerCase();
    if (!['assinado', 'signed', 'client_signed', 'cancelado'].includes(currentStatus)) {
      contractPatch.status = 'ativo';
    }
  }

  await supabaseAdmin
    .from('contracts')
    .update(contractPatch)
    .eq('id', signature.contract_id);

  return { aggregate, signature: updated, parties: list };
}

export type ResolvedPublicSignContext =
  | {
      mode: 'party';
      party: ContractSignaturePartyRow;
      signature: SignatureProcessRow;
      parties: ContractSignaturePartyRow[];
    }
  | {
      mode: 'legacy';
      signature: SignatureProcessRow;
      parties: ContractSignaturePartyRow[];
    };

export async function resolvePublicSignContext(
  supabaseAdmin: SupabaseClient,
  token: string,
  signature: SignatureProcessRow,
): Promise<ResolvedPublicSignContext> {
  const party = await getPartyByPublicToken(supabaseAdmin, token);
  const parties = await listSignatureParties(supabaseAdmin, signature.id);

  if (party && party.contract_signature_id === signature.id) {
    return { mode: 'party', party, signature, parties };
  }

  return { mode: 'legacy', signature, parties };
}

export async function markPartyOrLegacyViewed(
  supabaseAdmin: SupabaseClient,
  token: string,
  signature: SignatureProcessRow,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{
  signature: SignatureProcessRow;
  party: ContractSignaturePartyRow | null;
  role: string | null;
}> {
  const ctx = await resolvePublicSignContext(supabaseAdmin, token, signature);

  if (ctx.mode === 'party') {
    const party = await markPartyViewed(supabaseAdmin, ctx.party, meta);
    const synced = await syncAggregateSignatureStatus(
      supabaseAdmin,
      signature,
      ctx.parties.map((p) => (p.id === party.id ? party : p)),
    );

    const eventType: SignatureEventType =
      party.role === 'SPOUSE' ? 'SPOUSE_VIEWED' : 'BUYER_VIEWED';

    await logSignatureEvent(supabaseAdmin, {
      signatureToken: token,
      signatureSource: 'SALE',
      signatureRecordId: signature.id,
      eventType,
      personName: party.signer_name,
      ipAddress: meta.ipAddress || undefined,
      userAgent: meta.userAgent || undefined,
      eventDescription: `${saleSignaturePartyRoleLabel(party.role)} visualizou o contrato.`,
      metadata: {
        role: party.role,
        partyId: party.id,
        tokenPreview: maskSignatureTokenForLog(token),
      },
    });

    return {
      signature: synced.signature,
      party,
      role: party.role,
    };
  }

  return { signature, party: null, role: null };
}

export async function signPartyElectronically(
  supabaseAdmin: SupabaseClient,
  token: string,
  signature: SignatureProcessRow,
  input: {
    signerName: string;
    signerDocument: string;
    signerEmail: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<{
  signature: SignatureProcessRow;
  party: ContractSignaturePartyRow;
  aggregate: SaleSignatureStatus | null;
  awaitingVendor: boolean;
  awaitingOtherBuyers: boolean;
}> {
  const party = await getPartyByPublicToken(supabaseAdmin, token);
  if (!party || party.contract_signature_id !== signature.id) {
    throw new SaleContractSignatureError('Link de assinatura inválido.');
  }

  if (party.role !== 'BUYER' && party.role !== 'SPOUSE') {
    throw new SaleContractSignatureError(
      'Este link não é válido para assinatura pública.',
    );
  }

  const partyStatus = String(party.status).toUpperCase();
  if (partyStatus === 'SIGNED') {
    throw new SaleContractSignatureError(
      'Você já assinou este contrato com este link.',
    );
  }
  if (['CANCELLED', 'EXPIRED', 'ERROR'].includes(partyStatus)) {
    throw new SaleContractSignatureError(
      'O link de assinatura não está mais disponível.',
    );
  }
  if (!canPublicSaleSign(partyStatus === 'VIEWED' ? 'VIEWED' : 'PENDING')) {
    throw new SaleContractSignatureError(
      'O link de assinatura não está disponível para assinatura.',
    );
  }

  if (party.expires_at && isSignatureExpired(party.expires_at)) {
    await supabaseAdmin
      .from('contract_signature_parties')
      .update({
        status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', party.id);
    throw new SaleContractSignatureError('O link de assinatura expirou.');
  }

  const signerName = String(input.signerName || '').trim();
  const signerDocument = onlyDigits(input.signerDocument);
  const signerEmailRaw = normalizeSignerEmail(input.signerEmail);
  const hasEmail = isValidSignerEmail(signerEmailRaw);
  const partyPhone = String(party.signer_phone || '').trim();

  if (!signerName || signerDocument.length < 11) {
    throw new SaleContractSignatureError(
      'Informe nome completo e CPF válidos para assinar.',
    );
  }

  if (!hasEmail && !partyPhone) {
    throw new SaleContractSignatureError(
      'Informe um e-mail válido para assinar.',
    );
  }

  if (
    party.signer_cpf &&
    onlyDigits(party.signer_cpf) &&
    onlyDigits(party.signer_cpf) !== signerDocument
  ) {
    throw new SaleContractSignatureError(
      `O CPF informado não corresponde ao ${saleSignaturePartyRoleLabel(party.role).toLowerCase()} deste link.`,
    );
  }

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .select('id, contract_number, status, tenant_id, company_id')
    .eq('id', signature.contract_id)
    .single();

  if (contractErr || !contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const contractStatus = String(contractRow.status || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled'].includes(contractStatus)) {
    throw new SaleContractSignatureError(
      'Contrato cancelado. Assinatura não permitida.',
    );
  }
  if (['assinado', 'signed'].includes(contractStatus)) {
    throw new SaleContractSignatureError(
      'Este contrato já possui assinatura registrada.',
    );
  }

  const signedAt = new Date().toISOString();
  const hashPayload = buildSignatureHashPayload({
    contractId: String(contractRow.id),
    contractNumber: String(contractRow.contract_number || ''),
    signerName,
    signerDocument,
    signerEmail: hasEmail ? signerEmailRaw : '',
    signedAt,
    ipAddress: input.ipAddress || '',
    party: party.role === 'SPOUSE' ? 'CLIENT' : 'CLIENT',
  });
  const signatureHash = await computeSignatureHash(
    `${party.role}|${hashPayload}`,
  );

  const signedParty = await markPartySigned(supabaseAdmin, party.id, {
    signerName,
    signerCpf: signerDocument,
    signerEmail: hasEmail ? signerEmailRaw : party.signer_email,
    signerPhone: party.signer_phone,
    signatureHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt,
    signatureData: { role: party.role },
  });

  const parties = await listSignatureParties(supabaseAdmin, signature.id);
  const synced = await syncAggregateSignatureStatus(
    supabaseAdmin,
    signature,
    parties,
  );

  const eventType: SignatureEventType =
    party.role === 'SPOUSE' ? 'SPOUSE_SIGNED' : 'BUYER_SIGNED';

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SALE',
    signatureRecordId: signature.id,
    eventType,
    personName: signerName,
    personEmail: hasEmail ? signerEmailRaw : undefined,
    ipAddress: input.ipAddress || undefined,
    userAgent: input.userAgent || undefined,
    eventDescription: `Assinatura eletrônica do ${saleSignaturePartyRoleLabel(party.role).toLowerCase()}.`,
    occurredAt: signedAt,
    metadata: {
      role: party.role,
      partyId: party.id,
      aggregate: synced.aggregate,
      tokenPreview: maskSignatureTokenForLog(token),
    },
  });

  const aggregate = synced.aggregate;
  return {
    signature: synced.signature,
    party: signedParty,
    aggregate,
    awaitingVendor: aggregate === 'CLIENT_SIGNED',
    awaitingOtherBuyers: aggregate === 'PARTIALLY_SIGNED',
  };
}

export async function assertVendorCanSignWithParties(
  supabaseAdmin: SupabaseClient,
  signature: SignatureProcessRow,
): Promise<ContractSignaturePartyRow[]> {
  const parties = await listSignatureParties(supabaseAdmin, signature.id);
  if (parties.length === 0) {
    return [];
  }

  const gate = canVendorSignFromParties(toPartyStatusSnapshots(parties));
  if (gate.reason === 'legacy') {
    return [];
  }
  if (!gate.ok) {
    throw new SaleContractSignatureError(
      gate.reason || 'Aguardando assinaturas dos compradores.',
    );
  }
  return parties;
}

export async function markVendorPartySigned(
  supabaseAdmin: SupabaseClient,
  parties: ContractSignaturePartyRow[],
  input: {
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    signatureHash: string;
    signedAt: string;
  },
): Promise<void> {
  const vendor = parties.find((p) => p.role === 'VENDOR');
  if (!vendor) return;

  await markPartySigned(supabaseAdmin, vendor.id, {
    signerName: input.vendorName,
    signerCpf: onlyDigits(input.vendorDocument),
    signerEmail: input.vendorEmail,
    signatureHash: input.signatureHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: input.signedAt,
    signatureData: { role: 'VENDOR' },
  });
}

export async function reissueExternalPartyLink(
  supabaseAdmin: SupabaseClient,
  params: {
    contractId: string;
    signatureId: string;
    partyId: string;
    actorUserId?: string | null;
  },
): Promise<CreatedPartyWithToken> {
  const parties = await listSignatureParties(supabaseAdmin, params.signatureId);
  const party = parties.find((p) => p.id === params.partyId);
  if (!party || party.contract_id !== params.contractId) {
    throw new SaleContractSignatureError('Participante não encontrado.');
  }

  const result = await reissuePartyPublicLink(supabaseAdmin, party);

  if (result.token) {
    await logSignatureEvent(supabaseAdmin, {
      signatureToken: result.token,
      signatureSource: 'SALE',
      signatureRecordId: params.signatureId,
      eventType: 'PARTY_LINK_REISSUED',
      personName: party.signer_name,
      eventDescription: `Novo link gerado para ${saleSignaturePartyRoleLabel(party.role)}.`,
      metadata: {
        role: party.role,
        partyId: party.id,
        actorUserId: params.actorUserId || null,
        tokenPreview: maskSignatureTokenForLog(result.token),
      },
    });
  }

  // Espelha token do comprador no processo para portal/legado
  if (party.role === 'BUYER' && result.token && result.signUrl) {
    await supabaseAdmin
      .from('contract_signatures')
      .update({
        signature_token: result.token,
        signature_url: result.signUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.signatureId);

    await supabaseAdmin
      .from('contracts')
      .update({
        signature_token: result.token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.contractId);
  }

  return result;
}
