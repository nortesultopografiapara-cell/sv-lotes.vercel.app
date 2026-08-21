/**
 * Fluxo de participantes na assinatura eletrônica de venda.
 * Integra parties com o processo contract_signatures (compatível com legado).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { onlyDigits } from '@/lib/inputMasks';
import {
  resolveSaleContractModelFromContext,
} from '@/lib/contractModel';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import {
  buildAraguaiaEsignVendorPartyInputs,
  buildAraguaiaIntervenientPartyInput,
  buildAraguaiaWitnessPartyInputs,
  isAraguaiaSaleContractModel,
  isAraguaiaWitnessPartyRole,
  resolveAraguaiaVendorSignerEmail,
  shouldPersistAraguaiaIntervenientParty,
  shouldPersistAraguaiaWitnessParties,
  validateAraguaiaWitnessIdentity,
} from '@/lib/araguaiaContractEsign';
import {
  assertSpouseReadyForSignatureSend,
  hasRecantoSpouse,
  contractHtmlHasSpouseAnuenteSlot,
  contractHtmlLooksLikeRecanto,
  shouldCreateSpouseSignatureParty,
  SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE,
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
import { pickCustomerPhoneForSignature } from '@/lib/saleContractPublicSignUi';
import {
  buildSignatureHashPayload,
  computeSignatureHash,
} from '@/lib/saasContractSignaturePdf';
import {  isValidSignerEmail,
  normalizeSignerEmail,
} from '@/lib/saleContractEmailValidation';
import { logSignatureEvent, type SignatureEventType } from '@/lib/signatureEventService';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureErrors';
import type { SaleSignatureStatus } from '@/lib/saleContractSignatureStatus';
import { canPublicSaleSign } from '@/lib/saleContractSignatureStatus';
import { isSignatureExpired } from '@/lib/saasContractSignatureService';
import { resolveIpGeoApprox, formatApproxLocation, parseUserAgent } from '@/lib/signatureEvidence';

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

const SPOUSE_PARTY_NOT_CREATED_MESSAGE =
  'O contrato possui cônjuge anuente, mas o participante eletrônico do cônjuge não foi criado. Verifique os dados e tente novamente.';

export async function loadSaleAndCompanyForSignature(
  supabaseAdmin: SupabaseClient,
  contractRow: Record<string, unknown>,
): Promise<{
  sale: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  project: Record<string, unknown> | null;
  contractModel: string;
  rawContractModel: string | null;
  customer: Record<string, unknown> | null;
  companyLoadError: string | null;
  saleLoadError: string | null;
}> {
  // Preferir company_id da venda/contrato (mesma regra da regeneração).
  const companyId = String(
    contractRow.company_id || contractRow.tenant_id || '',
  ).trim();
  const saleId = contractRow.sale_id ? String(contractRow.sale_id) : null;
  const customerId = contractRow.customer_id
    ? String(contractRow.customer_id)
    : null;

  let company: Record<string, unknown> | null = null;
  let companyLoadError: string | null = null;
  if (companyId) {
    // select('*') — select enxuto com colunas inexistentes (ex.: legal_representative_name)
    // falhava em silêncio e o modelo caía em PADRAO.
    const { data, error } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();
    if (error) {
      companyLoadError = error.message.slice(0, 160);
      console.warn('[signature-parties] company_load_failed', {
        companyId: companyId.slice(0, 8),
        message: companyLoadError,
      });
    }
    company = (data as Record<string, unknown>) || null;
  }

  let sale: Record<string, unknown> | null = null;
  let saleLoadError: string | null = null;
  if (saleId) {
    // Colunas de cônjuge explícitas + project_id para resolver modelo ARAGUAIA.
    const spouseCols =
      'id, company_id, tenant_id, customer_id, project_id, contract_model, has_spouse, sale_spouse_name, sale_spouse_cpf, sale_spouse_phone, sale_spouse_email, sale_spouse_nationality, sale_spouse_marital_status, sale_spouse_profession, sale_spouse_rg, sale_spouse_rg_issuer, sale_spouse_address, status';
    let { data, error } = await supabaseAdmin
      .from('sales')
      .select(spouseCols)
      .eq('id', saleId)
      .maybeSingle();
    if (error) {
      const retry = await supabaseAdmin
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      saleLoadError = error.message.slice(0, 160);
      console.warn('[signature-parties] sale_load_failed', {
        saleId: saleId.slice(0, 8),
        message: saleLoadError,
      });
    }
    sale = (data as Record<string, unknown>) || null;
  }

  let project: Record<string, unknown> | null = null;
  const projectId = String(
    contractRow.project_id || sale?.project_id || '',
  ).trim();
  if (projectId) {
    const { data: projectData } = await supabaseAdmin
      .from('projects')
      .select('id, name, contract_model, company_id')
      .eq('id', projectId)
      .maybeSingle();
    project = (projectData as Record<string, unknown>) || null;
  }

  let customer: Record<string, unknown> | null = null;
  if (customerId) {
    const first = await supabaseAdmin
      .from('customers')
      .select(
        'id, name, cpf, cpf_cnpj, document, phone, whatsapp, mobile, celular, contact_phone, telefone, email, contact_email',
      )
      .eq('id', customerId)
      .maybeSingle();
    if (!first.error && first.data) {
      customer = first.data as Record<string, unknown>;
    } else {
      // Colunas opcionais (whatsapp/mobile…) podem falhar em schemas antigos.
      const retry = await supabaseAdmin
        .from('customers')
        .select('id, name, cpf, cpf_cnpj, document, phone, email, contact_email')
        .eq('id', customerId)
        .maybeSingle();
      customer = (retry.data as Record<string, unknown>) || null;
    }
  }

  const resolved = resolveSaleContractModelFromContext({
    saleModel: sale?.contract_model,
    contractModel: contractRow.contract_model,
    projectModel: project?.contract_model,
    companyModel: company?.contract_model,
    projectName: project?.name,
  });
  const rawContractModel =
    resolved.source !== 'fallback'
      ? String(
          sale?.contract_model ||
            contractRow.contract_model ||
            project?.contract_model ||
            company?.contract_model ||
            resolved.model,
        )
      : company?.contract_model != null
        ? String(company.contract_model)
        : null;

  console.log('[signature-parties] contract_model_resolved', {
    model: resolved.model,
    source: resolved.source,
    projectName: String(project?.name || '').slice(0, 40),
  });

  return {
    sale,
    company,
    project,
    contractModel: resolved.model,
    rawContractModel,
    customer,
    companyLoadError,
    saleLoadError,
  };
}

/**
 * Modelo efetivo para criação de parties.
 * Heurística Recanto (HTML com cônjuge) NÃO pode sobrescrever ARAGUAIA/MENESES/SV2.
 */
export function resolveEffectiveSaleContractModel(
  loadedModel: string,
  storedHtml: string,
): string {
  const key = String(loadedModel || '')
    .trim()
    .toUpperCase();
  if (key === 'ARAGUAIA' || key.includes('ARAGUAIA')) {
    return 'ARAGUAIA';
  }
  if (key === 'MENESES') return 'MENESES';
  if (key === 'SV_LOTES_2' || key.includes('SV_LOTES_2')) return 'SV_LOTES_2';
  if (key === 'CUSTOM') return 'CUSTOM';

  const htmlLooksRecanto = contractHtmlLooksLikeRecanto(storedHtml);
  return key === 'RECANTO_PRIMAVERA' || htmlLooksRecanto
    ? 'RECANTO_PRIMAVERA'
    : loadedModel;
}

/**
 * Valida signatários ANTES de criar o processo em contract_signatures.
 * Falha aqui não gera token, link, evento LINK_CREATED nem registro PENDING.
 */
export async function assertSaleSignaturePartiesReadyBeforeSend(
  supabaseAdmin: SupabaseClient,
  contractRow: Record<string, unknown>,
): Promise<void> {
  const loaded = await loadSaleAndCompanyForSignature(
    supabaseAdmin,
    contractRow,
  );
  const storedHtml = readStoredContractHtml(contractRow) || '';
  const contractModel = resolveEffectiveSaleContractModel(
    loaded.contractModel,
    storedHtml,
  );
  const spouseCheck = assertSpouseReadyForSignatureSend({
    contractModel,
    sale: loaded.sale,
    contractHtml: storedHtml,
  });
  if (!spouseCheck.ok) {
    throw new SaleContractSignatureError(spouseCheck.message, 'validation');
  }
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
  const loaded = await loadSaleAndCompanyForSignature(
    supabaseAdmin,
    params.contractRow,
  );
  const { sale, company, customer, rawContractModel, companyLoadError, saleLoadError } =
    loaded;

  const storedHtml = readStoredContractHtml(params.contractRow) || '';
  const htmlLooksRecanto = contractHtmlLooksLikeRecanto(storedHtml);
  const contractModel = resolveEffectiveSaleContractModel(
    loaded.contractModel,
    storedHtml,
  );

  const spouseNamePresent = Boolean(
    sale && String(sale.sale_spouse_name || '').trim(),
  );
  const spouseCpfPresent = Boolean(
    sale && String(sale.sale_spouse_cpf || '').trim(),
  );
  const spousePhonePresent = Boolean(
    sale && String(sale.sale_spouse_phone || '').trim(),
  );
  const spouseEmailPresent = Boolean(
    sale && String(sale.sale_spouse_email || '').trim(),
  );
  const hasSpouse = hasRecantoSpouse(sale);
  const htmlHasSpouseSlot = contractHtmlHasSpouseAnuenteSlot(storedHtml);

  const spouseRequired = shouldCreateSpouseSignatureParty({
    contractModel,
    sale,
    contractHtml: storedHtml,
  });
  const spouseCheck = assertSpouseReadyForSignatureSend({
    contractModel,
    sale,
    contractHtml: storedHtml,
  });

  const partiesRequested = ['BUYER'];
  if (spouseRequired) partiesRequested.push('SPOUSE');
  const araguaiaEsign = isAraguaiaSaleContractModel(contractModel);
  if (araguaiaEsign) {
    partiesRequested.push('VENDOR', 'VENDOR');
  } else {
    partiesRequested.push('VENDOR');
  }

  console.log('[signature-parties] spouse_gate', {
    contractId: String(params.signature.contract_id || '').slice(0, 8),
    saleId: sale?.id ? String(sale.id).slice(0, 8) : null,
    companyId: company?.id ? String(company.id).slice(0, 8) : null,
    rawContractModel: rawContractModel
      ? String(rawContractModel).slice(0, 40)
      : null,
    normalizedContractModel: loaded.contractModel,
    effectiveContractModel: contractModel,
    isRecantoPrimavera: contractModel === 'RECANTO_PRIMAVERA',
    htmlLooksRecanto,
    saleSpouseNamePresent: spouseNamePresent,
    saleSpouseCpfPresent: spouseCpfPresent,
    saleSpousePhonePresent: spousePhonePresent,
    saleSpouseEmailPresent: spouseEmailPresent,
    hasRecantoSpouse: hasSpouse,
    htmlHasSpouseSlot,
    requiresSpouseSignature: spouseRequired,
    partiesRequested,
    companyLoadError: companyLoadError || null,
    saleLoadError: saleLoadError || null,
    spouseCheckOk: spouseCheck.ok,
    spouseSkipped: 'skipped' in spouseCheck,
  });

  if (!spouseCheck.ok) {
    throw new SaleContractSignatureError(spouseCheck.message, 'validation');
  }

  const spouseData =
    spouseRequired && spouseCheck.ok && !('skipped' in spouseCheck)
      ? spouseCheck
      : null;

  if (spouseRequired && !spouseData) {
    throw new SaleContractSignatureError(
      SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE,
      'validation',
    );
  }

  const seller = company
    ? normalizeSellerFromCompany(company)
    : { representative: '', representativeCpf: '', email: '', phone: '' };

  const araguaiaVendors = araguaiaEsign
    ? buildAraguaiaEsignVendorPartyInputs()
    : null;

  console.log('[signature-parties] araguaia_esign_gate', {
    contractId: String(params.signature.contract_id || '').slice(0, 8),
    araguaiaEsign,
    effectiveContractModel: contractModel,
    loadedContractModel: loaded.contractModel,
    projectName: String(loaded.project?.name || '').slice(0, 40),
    vendorPayloadCount: araguaiaVendors?.length ?? 0,
    vendorPayload: araguaiaVendors?.map((v) => ({
      name: v.name,
      cpf: v.cpf,
      phone: v.phone,
      email: v.email,
    })),
  });

  if (araguaiaEsign && (!araguaiaVendors || araguaiaVendors.length !== 2)) {
    throw new SaleContractSignatureError(
      'ARAGUAIA: buildAraguaiaEsignVendorPartyInputs deve retornar exatamente 2 VENDOR.',
      'validation',
    );
  }

  const buyerName =
    String(customer?.name || '').trim() ||
    String(params.contractRow.signed_by_name || '').trim() ||
    null;
  const buyerCpf = onlyDigits(
    String(customer?.cpf || customer?.cpf_cnpj || customer?.document || ''),
  );
  const buyerPhone =
    pickCustomerPhoneForSignature(customer) || null;
  const buyerEmail =
    String(customer?.email || customer?.contact_email || '').trim() || null;

  const companyId = String(
    params.contractRow.company_id ||
      params.contractRow.tenant_id ||
      company?.id ||
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
      vendor: araguaiaVendors
        ? null
        : {
            name:
              seller.representative !== 'Não informado'
                ? seller.representative
                : null,
            cpf: seller.representativeCpf || null,
            email: seller.email !== 'Não informado' ? seller.email : null,
          },
      vendors: araguaiaVendors
        ? araguaiaVendors.map((v) => ({
            name: v.name,
            cpf: v.cpf,
            phone: v.phone,
            email: v.email,
            withPublicToken: true,
          }))
        : null,
      // Persistência remota: schema V2 + env + ARAGUAIA + allowlist company_id.
      intervenient:
        araguaiaEsign &&
        shouldPersistAraguaiaIntervenientParty({
          companyId,
          contractModel,
        })
          ? (() => {
              const i = buildAraguaiaIntervenientPartyInput();
              return {
                name: i.name,
                cnpj: i.cnpj,
                phone: i.phone,
                email: i.email,
                signatureData: i.signatureData,
              };
            })()
          : null,
      witnesses:
        araguaiaEsign &&
        shouldPersistAraguaiaWitnessParties({
          companyId,
          contractModel,
        })
          ? buildAraguaiaWitnessPartyInputs().map((w) => ({
              role: w.role,
              name: w.name,
              cpf: w.cpf,
              phone: w.phone,
              email: w.email,
              withPublicToken: true,
            }))
          : null,
      expiresAt: params.expiresAt,
    });

    // Confirmar no banco — nunca devolver sucesso bilateral se SPOUSE era obrigatório.
    const persisted = await listSignatureParties(
      supabaseAdmin,
      params.signature.id,
    );
    const createdRoles = persisted.map((p) => String(p.role).toUpperCase());
    if (spouseRequired && !createdRoles.includes('SPOUSE')) {
      throw new SaleContractSignatureError(
        SPOUSE_PARTY_NOT_CREATED_MESSAGE,
        'validation',
      );
    }
    if (araguaiaEsign) {
      const vendorParties = persisted.filter(
        (p) => String(p.role).toUpperCase() === 'VENDOR',
      );
      const vendorCount = vendorParties.length;
      const vendorCpfs = vendorParties
        .map((p) => onlyDigits(p.signer_cpf || ''))
        .filter(Boolean)
        .sort();
      const expectedCpfs = ['82091226220', '85656011291'];
      console.log('[signature-parties] araguaia_vendors_persisted', {
        contractSignatureId: String(params.signature.id).slice(0, 8),
        vendorCount,
        vendorCpfs,
        names: vendorParties.map((p) => p.signer_name),
        partyIds: vendorParties.map((p) => p.id),
      });
      if (vendorCount !== 2) {
        throw new SaleContractSignatureError(
          `ARAGUAIA exige exatamente 2 VENDOR persistidos (recebido ${vendorCount}). Reenvie após correção.`,
          'validation',
        );
      }
      const missingCpf = expectedCpfs.filter((cpf) => !vendorCpfs.includes(cpf));
      if (missingCpf.length > 0) {
        throw new SaleContractSignatureError(
          `ARAGUAIA: CPFs de VENDOR incompletos (faltando ${missingCpf.join(', ')}).`,
          'validation',
        );
      }
      const hasRrAsParty = persisted.some((p) =>
        /R\s*R\s*NEG[OÓ]CIOS/i.test(String(p.signer_name || '')),
      );
      if (hasRrAsParty) {
        throw new SaleContractSignatureError(
          'R R Negócios não deve ser signatária no modelo ARAGUAIA.',
          'validation',
        );
      }
    }

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

    console.log('[signature-parties] parties_created', {
      contractId: String(params.signature.contract_id || '').slice(0, 8),
      roles: createdRoles,
      partyCount: persisted.length,
    });

    return {
      parties: persisted.length > 0 ? persisted : created.parties,
      spouseSignUrl: created.spouseSignUrl,
      spouseRequired,
    };
  } catch (err) {
    if (err instanceof SaleContractSignatureError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    // Só cair no legado se a TABELA não existir. Nunca engolir falha de SPOUSE.
    if (
      /relation ["']?contract_signature_parties["']? does not exist/i.test(
        message,
      )
    ) {
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
  const vendors = list.filter(
    (p) => String(p.role).toUpperCase() === 'VENDOR',
  );
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

  if (aggregate === 'SIGNED') {
    const lastVendor = [...vendors]
      .filter((p) => String(p.status).toUpperCase() === 'SIGNED')
      .sort((a, b) =>
        String(a.signed_at || '').localeCompare(String(b.signed_at || '')),
      )
      .at(-1);
    if (lastVendor) {
      patch.vendor_signer_name = lastVendor.signer_name;
      patch.vendor_signer_document = lastVendor.signer_cpf;
      patch.vendor_signer_email = lastVendor.signer_email;
      patch.vendor_signed_at = lastVendor.signed_at;
      patch.vendor_signature_hash = lastVendor.signature_hash;
      patch.vendor_ip_address = lastVendor.ip_address;
      patch.vendor_user_agent = lastVendor.user_agent;
      patch.certificate_status = 'VALIDADO';
    }
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
  } else if (aggregate === 'SIGNED') {
    contractPatch.status = 'assinado';
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
    signerPhone?: string | null;
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

  const partyRoleKey = String(party.role).toUpperCase();
  const isWitness = isAraguaiaWitnessPartyRole(partyRoleKey);

  if (
    party.role !== 'BUYER' &&
    party.role !== 'SPOUSE' &&
    party.role !== 'VENDOR' &&
    !isWitness
  ) {
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

  let signerName = String(input.signerName || '').trim();
  let signerDocument = onlyDigits(input.signerDocument);
  let resolvedSignerEmail: string | null = null;
  let resolvedPhone: string | null = String(party.signer_phone || '').trim() || null;

  if (isWitness) {
    const validated = validateAraguaiaWitnessIdentity({
      name: input.signerName,
      cpf: input.signerDocument,
      phone: input.signerPhone,
      email: input.signerEmail,
    });
    if (!validated.ok) {
      throw new SaleContractSignatureError(validated.reason);
    }
    signerName = validated.value.name;
    signerDocument = validated.value.cpf;
    resolvedSignerEmail = validated.value.email;
    resolvedPhone = validated.value.phone;
  } else {
    const signerEmailRaw = normalizeSignerEmail(input.signerEmail);
    const hasEmail = isValidSignerEmail(signerEmailRaw);
    const partyPhone = String(party.signer_phone || '').trim();
    const lockedVendorEmail = resolveAraguaiaVendorSignerEmail({
      cpf: party.signer_cpf || signerDocument,
      submittedEmail: hasEmail ? signerEmailRaw : null,
    });
    resolvedSignerEmail =
      lockedVendorEmail !== undefined
        ? lockedVendorEmail
        : hasEmail
          ? signerEmailRaw
          : party.role === 'VENDOR'
            ? null
            : party.signer_email || null;
    const resolvedHasEmail = isValidSignerEmail(
      String(resolvedSignerEmail || ''),
    );

    if (!signerName || signerDocument.length < 11) {
      throw new SaleContractSignatureError(
        'Informe nome completo e CPF válidos para assinar.',
      );
    }

    if (!resolvedHasEmail && !partyPhone) {
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
  }

  const resolvedHasEmail = isValidSignerEmail(
    String(resolvedSignerEmail || ''),
  );

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
    signerEmail: resolvedHasEmail ? String(resolvedSignerEmail) : '',
    signedAt,
    ipAddress: input.ipAddress || '',
    party: 'CLIENT',
  });
  const signatureHash = await computeSignatureHash(
    `${party.role}|${hashPayload}`,
  );

  const ua = parseUserAgent(input.userAgent);
  const geo = await resolveIpGeoApprox(input.ipAddress);
  const signedParty = await markPartySigned(supabaseAdmin, party.id, {
    signerName,
    signerCpf: signerDocument,
    signerEmail: resolvedHasEmail ? String(resolvedSignerEmail) : null,
    signerPhone: resolvedPhone,
    signatureHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt,
    signatureData: {
      role: party.role,
      partyId: party.id,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      approx_location: formatApproxLocation(geo),
    },
  });

  const parties = await listSignatureParties(supabaseAdmin, signature.id);
  const synced = await syncAggregateSignatureStatus(
    supabaseAdmin,
    signature,
    parties,
  );

  const eventType: SignatureEventType =
    party.role === 'SPOUSE'
      ? 'SPOUSE_SIGNED'
      : party.role === 'VENDOR'
        ? 'VENDOR_SIGNED'
        : isWitness
          ? 'CLIENT_SIGNED'
          : 'BUYER_SIGNED';

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SALE',
    signatureRecordId: signature.id,
    eventType,
    personName: signerName,
    personEmail: resolvedHasEmail ? String(resolvedSignerEmail) : undefined,
    personPhone: resolvedPhone || undefined,
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
    /** Quando há N VENDORs, assina a party específica. */
    partyId?: string | null;
  },
): Promise<ContractSignaturePartyRow | null> {
  const vendors = parties.filter(
    (p) => String(p.role).toUpperCase() === 'VENDOR',
  );
  if (vendors.length === 0) return null;

  const docDigits = onlyDigits(input.vendorDocument);
  let vendor =
    (input.partyId
      ? vendors.find((p) => p.id === input.partyId)
      : undefined) ||
    vendors.find(
      (p) =>
        onlyDigits(p.signer_cpf || '') === docDigits &&
        String(p.status).toUpperCase() !== 'SIGNED',
    ) ||
    vendors.find((p) => String(p.status).toUpperCase() !== 'SIGNED') ||
    vendors[0];

  if (!vendor) return null;

  const ua = parseUserAgent(input.userAgent);
  const geo = await resolveIpGeoApprox(input.ipAddress);

  const lockedVendorEmail = resolveAraguaiaVendorSignerEmail({
    cpf: vendor.signer_cpf || docDigits,
    submittedEmail: input.vendorEmail,
  });
  const vendorEmailToPersist =
    lockedVendorEmail !== undefined
      ? lockedVendorEmail
      : String(input.vendorEmail || '').trim() || null;

  return markPartySigned(supabaseAdmin, vendor.id, {
    signerName: input.vendorName,
    signerCpf: docDigits,
    signerEmail: vendorEmailToPersist,
    signerPhone: vendor.signer_phone,
    signatureHash: input.signatureHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: input.signedAt,
    signatureData: {
      role: 'VENDOR',
      partyId: vendor.id,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      approx_location: formatApproxLocation(geo),
    },
  });
}

/**
 * Assina somente a party INTERVENIENT (PJ). Não altera VENDOR Daniel.
 * Evento e signature_event_id distintos do VENDOR PF.
 */
export async function markIntervenientPartySigned(
  supabaseAdmin: SupabaseClient,
  parties: ContractSignaturePartyRow[],
  input: {
    companyName: string;
    companyCnpj: string;
    representativeName: string;
    representativeCpf: string;
    representativeEmail?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    signatureHash: string;
    signedAt: string;
    partyId?: string | null;
  },
): Promise<ContractSignaturePartyRow | null> {
  const intervenients = parties.filter(
    (p) => String(p.role).toUpperCase() === 'INTERVENIENT',
  );
  if (intervenients.length === 0) return null;

  const intervenient =
    (input.partyId
      ? intervenients.find((p) => p.id === input.partyId)
      : undefined) ||
    intervenients.find((p) => String(p.status).toUpperCase() !== 'SIGNED') ||
    intervenients[0];

  if (!intervenient) return null;
  if (String(intervenient.status).toUpperCase() === 'SIGNED') {
    return intervenient;
  }

  const ua = parseUserAgent(input.userAgent);
  const geo = await resolveIpGeoApprox(input.ipAddress);
  const existingData =
    intervenient.signature_data && typeof intervenient.signature_data === 'object'
      ? intervenient.signature_data
      : {};
  const cnpjDigits = onlyDigits(input.companyCnpj);
  const repCpfDigits = onlyDigits(input.representativeCpf);

  return markPartySigned(supabaseAdmin, intervenient.id, {
    signerName: input.companyName,
    signerCpf: cnpjDigits,
    signerEmail: input.representativeEmail || intervenient.signer_email,
    signerPhone: intervenient.signer_phone,
    signatureHash: input.signatureHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: input.signedAt,
    signatureData: {
      ...existingData,
      role: 'INTERVENIENT',
      party_kind: 'LEGAL_ENTITY',
      partyId: intervenient.id,
      company_name: input.companyName,
      company_cnpj: cnpjDigits,
      representative_name: input.representativeName,
      representative_cpf: repCpfDigits,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      approx_location: formatApproxLocation(geo),
    },
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
