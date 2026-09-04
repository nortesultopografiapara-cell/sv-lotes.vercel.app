/**
 * Assinatura eletrônica do termo de desistência.
 * Reutiliza contract_signatures / parties / tokens / página /sign/sale/[token].
 * Não recalcula settlement, cronograma ou benfeitorias. Não reexecuta a desistência.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
  assertAraguaiaEsignV2LegalRepresentativeReady,
  buildAraguaiaEsignVendorPartyInputs,
  isAraguaiaSaleContractModel,
} from '@/lib/araguaiaContractEsign';
import { shouldEnableAraguaiaEsignV2 } from '@/lib/araguaiaEsignV2Gate';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { onlyDigits } from '@/lib/inputMasks';
import { pickCustomerPhoneForSignature } from '@/lib/saleContractPublicSignUi';
import {
  TERMINATION_SIGNED_DOCUMENT_TYPE,
} from '@/lib/saleContractSignatureDocumentType';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureErrors';
import {
  createPartiesForSignatureProcess,
  listSignatureParties,
  toPublicPartyViews,
} from '@/lib/saleContractSignatureParties';
import { loadSaleAndCompanyForSignature } from '@/lib/saleContractSignaturePartyFlow';
import {
  computeAggregateSaleSignatureStatus,
  toPartyStatusSnapshots,
} from '@/lib/saleContractSignaturePartyStatus';
import type { ContractSignatureRow } from '@/lib/saleContractSignatureService';
import { saleSignatureStatusLabel } from '@/lib/saleContractSignatureStatus';
import { buildSaleSignUrl } from '@/lib/saleContractUrls';
import {
  generateSignatureToken,
  signatureExpiresAt,
} from '@/lib/saasContractSignatureService';
import {
  buildUploadStoragePathForSale,
  createSystemGeneratedSaleDocumentMetadata,
} from '@/lib/saleDocumentService';
import { SALE_DOCUMENTS_STORAGE_BUCKET } from '@/lib/saleDocuments';
import { logSignatureEvent } from '@/lib/signatureEventService';
import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';
import { assertFrozenHtmlUnchanged } from '@/lib/termination-documents/hash';
import { toPartyFacingTerminationHtml } from '@/lib/termination-documents/partyFacingHtml';
import {
  loadTerminationDocumentBySale,
  TerminationDocumentError,
} from '@/lib/termination-documents/persist';
import { renderTerminationHtmlToPdf } from '@/lib/termination-documents/pdf';
import { DESISTENCIA_DOCUMENT_TITLE } from '@/lib/termination-documents/types';
import {
  terminationDocumentFileSlug,
  terminationSignedSaleDocumentType,
} from '@/lib/termination-documents/documentKinds';

export {
  TERMINATION_SIGNED_DOCUMENT_TYPE,
  isTerminationSaleSignature,
} from '@/lib/saleContractSignatureDocumentType';

export const SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO = 'DESISTENCIA_ASSINADO';

const OPEN_TERMINATION_STATUSES = [
  'PENDING',
  'VIEWED',
  'PARTIALLY_SIGNED',
  'CLIENT_SIGNED',
  'SIGNED',
  'EXPIRED',
  'CANCELLED',
] as const;

export function terminationSignatureUiStatus(signatureStatus?: string | null): {
  code: 'GENERATED' | 'SENT' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
  label: string;
} {
  const key = String(signatureStatus || '')
    .trim()
    .toUpperCase();
  if (key === 'SIGNED') return { code: 'SIGNED', label: 'Assinado' };
  if (key === 'PARTIALLY_SIGNED' || key === 'CLIENT_SIGNED') {
    return { code: 'PARTIALLY_SIGNED', label: 'Parcialmente assinado' };
  }
  if (key === 'PENDING' || key === 'VIEWED') {
    return { code: 'SENT', label: 'Enviado para assinatura' };
  }
  if (key === 'EXPIRED') return { code: 'EXPIRED', label: 'Expirado' };
  if (key === 'CANCELLED') return { code: 'CANCELLED', label: 'Cancelado' };
  return { code: 'GENERATED', label: 'Gerado' };
}

export async function loadLatestTerminationSignature(
  admin: SupabaseClient,
  input: { contractId?: string | null; saleId?: string | null },
): Promise<ContractSignatureRow | null> {
  const contractId = String(input.contractId || '').trim();
  if (!contractId) return null;
  const { data, error } = await admin
    .from('contract_signatures')
    .select('*')
    .eq('contract_id', contractId)
    .eq('signed_document_type', TERMINATION_SIGNED_DOCUMENT_TYPE)
    .in('signature_status', [...OPEN_TERMINATION_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ContractSignatureRow;
}

async function cancelOpenTerminationSignatures(
  admin: SupabaseClient,
  contractId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: openRows } = await admin
    .from('contract_signatures')
    .select('id')
    .eq('contract_id', contractId)
    .eq('signed_document_type', TERMINATION_SIGNED_DOCUMENT_TYPE)
    .in('signature_status', ['PENDING', 'VIEWED']);
  const ids = (openRows || []).map((row) => String(row.id));
  if (ids.length === 0) return;
  await admin
    .from('contract_signatures')
    .update({
      signature_status: 'CANCELLED',
      updated_at: now,
    })
    .in('id', ids);
  await admin
    .from('contract_signature_parties')
    .update({
      status: 'CANCELLED',
      cancelled_at: now,
      updated_at: now,
    })
    .in('contract_signature_id', ids)
    .in('status', ['PENDING', 'VIEWED']);
}

export async function sendTerminationDocumentForSignature(
  admin: SupabaseClient,
  input: { saleId: string; companyId: string; operatorUserId: string },
): Promise<{
  signature: ContractSignatureRow;
  signUrl: string;
  parties: ReturnType<typeof toPublicPartyViews>;
  documentNumber: string;
  title: string;
}> {
  const loaded = await loadTerminationDocumentBySale(admin, {
    saleId: input.saleId,
    companyId: input.companyId,
  });
  if (!loaded?.snapshot || !loaded.documentId) {
    throw new TerminationDocumentError(
      'Gere o PDF do termo antes de enviar para assinatura.',
      'DOCUMENT_NOT_READY',
    );
  }
  if (loaded.documentStatus !== 'GENERATED' && loaded.documentStatus !== 'SIGNED') {
    throw new TerminationDocumentError(
      'O termo ainda não está disponível para assinatura.',
      'DOCUMENT_NOT_READY',
    );
  }

  const contractId = String(loaded.snapshot.contractId || '').trim();
  if (!contractId) {
    throw new TerminationDocumentError(
      'Não é possível enviar o termo para assinatura sem o contrato original vinculado.',
      'CONTRACT_REQUIRED',
    );
  }

  const { data: contractRow, error: contractErr } = await admin
    .from('contracts')
    .select(
      'id, contract_number, tenant_id, company_id, customer_id, sale_id, status, signature_status',
    )
    .eq('id', contractId)
    .maybeSingle();
  if (contractErr || !contractRow) {
    throw new TerminationDocumentError(
      'Contrato original não encontrado para reutilizar os signatários.',
      'CONTRACT_REQUIRED',
    );
  }

  const existing = await loadLatestTerminationSignature(admin, { contractId });
  const existingStatus = String(existing?.signature_status || '').toUpperCase();
  if (
    existing &&
    (existingStatus === 'SIGNED' ||
      existingStatus === 'PARTIALLY_SIGNED' ||
      existingStatus === 'CLIENT_SIGNED')
  ) {
    const parties = await listSignatureParties(admin, existing.id);
    return {
      signature: existing,
      signUrl: String(existing.signature_url || ''),
      parties: toPublicPartyViews(parties),
      documentNumber: loaded.snapshot.documentNumber,
      title: loaded.snapshot.title || DESISTENCIA_DOCUMENT_TITLE,
    };
  }

  await cancelOpenTerminationSignatures(admin, contractId);

  const tenantId = String(
    contractRow.tenant_id || contractRow.company_id || loaded.snapshot.companyId || '',
  );
  const token = generateSignatureToken();
  const signUrl = buildSaleSignUrl(token);
  const now = new Date().toISOString();
  const expiresAt = signatureExpiresAt();

  const { data: inserted, error: insertErr } = await admin
    .from('contract_signatures')
    .insert({
      contract_id: contractId,
      tenant_id: tenantId,
      customer_id:
        (contractRow.customer_id as string) || loaded.snapshot.customerId || null,
      signature_status: 'PENDING',
      signature_token: token,
      signature_url: signUrl,
      validation_public_url: buildSignatureVerifyUrl(token),
      signed_document_type: TERMINATION_SIGNED_DOCUMENT_TYPE,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    throw new SaleContractSignatureError(
      `Falha ao registrar envio para assinatura: ${insertErr?.message || 'sem retorno'}`,
      'db_save',
    );
  }

  const signature = inserted as ContractSignatureRow;

  try {
    await createTerminationSignatureParties(admin, {
      signature,
      contractRow: {
        ...contractRow,
        sale_id: contractRow.sale_id || loaded.snapshot.saleId,
        company_id: contractRow.company_id || loaded.snapshot.companyId,
      },
      buyerToken: token,
      expiresAt,
    });
  } catch (err) {
    await admin
      .from('contract_signatures')
      .update({
        signature_status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', signature.id);
    throw err;
  }

  await logSignatureEvent(admin, {
    signatureToken: token,
    signatureSource: 'SALE',
    signatureRecordId: String(signature.id),
    eventType: 'LINK_CREATED',
    eventDescription:
      'Link de assinatura criado para o Termo de Desistência, Rescisão Contratual e Acerto Financeiro.',
    occurredAt: now,
  });

  const parties = await listSignatureParties(admin, signature.id);
  return {
    signature,
    signUrl,
    parties: toPublicPartyViews(parties),
    documentNumber: loaded.snapshot.documentNumber,
    title: loaded.snapshot.title || DESISTENCIA_DOCUMENT_TITLE,
  };
}

async function createTerminationSignatureParties(
  admin: SupabaseClient,
  params: {
    signature: ContractSignatureRow;
    contractRow: Record<string, unknown>;
    buyerToken: string;
    expiresAt: string;
  },
): Promise<void> {
  const loaded = await loadSaleAndCompanyForSignature(admin, params.contractRow);
  const { sale, company, customer, contractModel } = loaded;
  const araguaiaEsign = isAraguaiaSaleContractModel(contractModel);
  const araguaiaEsignV2 = shouldEnableAraguaiaEsignV2({
    companyId: company?.id ? String(company.id) : null,
    contractModel,
  });

  const seller = company
    ? normalizeSellerFromCompany(company)
    : { representative: '', representativeCpf: '', email: '', phone: '' };

  if (araguaiaEsignV2) {
    const legalBlock = assertAraguaiaEsignV2LegalRepresentativeReady({ company });
    if (legalBlock) {
      throw new SaleContractSignatureError(legalBlock, 'validation');
    }
  }

  const araguaiaVendors = araguaiaEsign
    ? buildAraguaiaEsignVendorPartyInputs({
        company,
        project: araguaiaEsignV2 ? null : loaded.project,
        companyId: company?.id ? String(company.id) : null,
        contractModel,
        mode: araguaiaEsignV2 ? 'v2' : 'legacy',
      })
    : null;

  if (araguaiaEsign && (!araguaiaVendors || araguaiaVendors.length < 1)) {
    throw new SaleContractSignatureError(
      ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
      'validation',
    );
  }

  const buyerName =
    String(customer?.name || '').trim() ||
    String(sale?.customer_name || '').trim() ||
    null;
  const buyerCpf = onlyDigits(
    String(customer?.cpf || customer?.cpf_cnpj || customer?.document || ''),
  );
  const buyerPhone = pickCustomerPhoneForSignature(customer) || null;
  const buyerEmail =
    String(customer?.email || customer?.contact_email || '').trim() || null;

  const companyId = String(
    params.contractRow.company_id ||
      params.contractRow.tenant_id ||
      company?.id ||
      params.signature.tenant_id,
  );

  const classicVendor = {
    name: seller.representative !== 'Não informado' ? seller.representative : null,
    cpf: seller.representativeCpf || null,
    phone: seller.phone !== 'Não informado' ? seller.phone : null,
    email: seller.email !== 'Não informado' ? seller.email : null,
    withPublicToken: true,
  };

  await createPartiesForSignatureProcess(admin, {
    companyId,
    contractSignatureId: params.signature.id,
    contractId: params.signature.contract_id,
    saleId: params.contractRow.sale_id ? String(params.contractRow.sale_id) : null,
    buyer: {
      name: buyerName,
      cpf: buyerCpf || null,
      phone: buyerPhone,
      email: buyerEmail,
      token: params.buyerToken,
    },
    spouse: null,
    vendor: null,
    vendors: araguaiaVendors
      ? araguaiaVendors.map((v) => ({
          name: v.name,
          cpf: v.cpf,
          phone: v.phone,
          email: v.email,
          withPublicToken: true,
        }))
      : [classicVendor],
    intervenient: null,
    witnesses: null,
    expiresAt: params.expiresAt,
  });
}

async function resolveSaleIdFromTerminationSignature(
  admin: SupabaseClient,
  signature: ContractSignatureRow,
): Promise<string | null> {
  const parties = await listSignatureParties(admin, signature.id);
  const fromParty = parties.find((p) => p.sale_id)?.sale_id;
  if (fromParty) return String(fromParty);
  const { data: contract } = await admin
    .from('contracts')
    .select('sale_id')
    .eq('id', signature.contract_id)
    .maybeSingle();
  return contract?.sale_id ? String(contract.sale_id) : null;
}

async function loadFrozenTerminationContext(
  admin: SupabaseClient,
  signature: ContractSignatureRow,
) {
  const saleId = await resolveSaleIdFromTerminationSignature(admin, signature);
  if (!saleId) {
    throw new TerminationDocumentError(
      'Termo de desistência não encontrado para este link.',
      'DOCUMENT_NOT_FOUND',
    );
  }
  let loaded = await loadTerminationDocumentBySale(admin, {
    saleId,
    companyId: String(signature.tenant_id || ''),
  });
  if (!loaded) {
    const { data: settlement } = await admin
      .from('sale_release_settlements')
      .select('company_id')
      .eq('sale_id', saleId)
      .eq('status', 'EXECUTED')
      .maybeSingle();
    if (settlement?.company_id) {
      loaded = await loadTerminationDocumentBySale(admin, {
        saleId,
        companyId: String(settlement.company_id),
      });
    }
  }
  if (!loaded?.snapshot?.html) {
    throw new TerminationDocumentError(
      'Snapshot documental ausente. O conteúdo financeiro não será reconstruído.',
      'DOCUMENT_SNAPSHOT_MISSING',
    );
  }
  assertFrozenHtmlUnchanged(loaded.snapshot.html, loaded.snapshot.contentHash);
  return { saleId, loaded };
}

export async function loadFrozenTerminationHtmlForSignature(
  admin: SupabaseClient,
  signature: ContractSignatureRow,
): Promise<{
  html: string;
  documentNumber: string;
  title: string;
  saleId: string | null;
  contractNumber: string | null;
  clauseReference: string | null;
}> {
  const { saleId, loaded } = await loadFrozenTerminationContext(admin, signature);
  return {
    html: toPartyFacingTerminationHtml(loaded.snapshot.html, {
      contractNumber: loaded.snapshot.contractNumber,
      clauseReference: loaded.snapshot.clauseReference,
    }),
    documentNumber: loaded.snapshot.documentNumber,
    title: loaded.snapshot.title || DESISTENCIA_DOCUMENT_TITLE,
    saleId,
    contractNumber: loaded.snapshot.contractNumber,
    clauseReference: loaded.snapshot.clauseReference,
  };
}

async function appendTerminationCertificateHtml(
  admin: SupabaseClient,
  signature: ContractSignatureRow,
  partyHtml: string,
  meta: { documentNumber: string; contractNumber: string | null; title?: string | null },
): Promise<string> {
  if (String(signature.signature_status || '').toUpperCase() !== 'SIGNED') {
    return partyHtml;
  }
  const { buildSaleContractSignatureCertificateHtmlWithQr } = await import(
    '@/lib/saleContractSignatureCertificateHtml'
  );
  const { loadSaleSignPageContext, buildSaleSignatureHistory } = await import(
    '@/lib/saleContractSignatureService'
  );
  const { getCompanyDisplayName } = await import('@/lib/contractCompanyDisplay');
  const { normalizeSellerFromCompany: sellerFromCompany } = await import(
    '@/lib/contractSeller'
  );
  const ctx = await loadSaleSignPageContext(admin, signature);
  const parties = await listSignatureParties(admin, signature.id);
  const buyer = parties.find((p) => String(p.role).toUpperCase() === 'BUYER');
  const vendor = parties.find((p) => String(p.role).toUpperCase() === 'VENDOR');
  const seller = sellerFromCompany((ctx.company || {}) as Record<string, unknown>);
  const cert = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: meta.documentNumber || meta.contractNumber || '',
    projectName: String(ctx.project?.name || ''),
    quadra: String(ctx.block?.quadra || ctx.block?.block_name || '—'),
    lote: String(ctx.block?.lot_number || ctx.block?.lote || '—'),
    buyerName: String(buyer?.signer_name || signature.signer_name || ''),
    buyerDocument: String(buyer?.signer_cpf || signature.signer_document || ''),
    signerEmail: buyer?.signer_email || signature.signer_email,
    companyName: getCompanyDisplayName(ctx.company || {}),
    companyCnpj: ctx.company?.cnpj ? String(ctx.company.cnpj) : null,
    representativeName: vendor?.signer_name || seller.representative,
    representativeCpf: vendor?.signer_cpf || seller.representativeCpf,
    signatureStatus: signature.signature_status,
    signedAt: signature.signed_at,
    viewedAt: signature.viewed_at,
    ipAddress: signature.ip_address,
    signatureToken: signature.signature_token,
    signatureHash: signature.signature_hash,
    publicUrl: signature.validation_public_url || signature.signature_url,
    validationPublicUrl: signature.validation_public_url,
    signatureUrl: signature.signature_url,
    historyEvents: buildSaleSignatureHistory(signature),
    certificateTitle: `CERTIFICADO DE ASSINATURA ELETRÔNICA — ${
      meta.title || DESISTENCIA_DOCUMENT_TITLE
    }`,
    vendorSignedAt: signature.vendor_signed_at || vendor?.signed_at,
    vendorEmail: signature.vendor_signer_email || vendor?.signer_email,
    vendorSignatureHash: signature.vendor_signature_hash || vendor?.signature_hash,
    vendorIpAddress: signature.vendor_ip_address || vendor?.ip_address,
  });
  return `${partyHtml}\n${cert}`;
}

export async function loadTerminationPdfForSign(
  admin: SupabaseClient,
  signature: ContractSignatureRow,
): Promise<{ pdf: Uint8Array; documentNumber: string; html: string }> {
  const { loaded } = await loadFrozenTerminationContext(admin, signature);
  const partyHtml = toPartyFacingTerminationHtml(loaded.snapshot.html, {
    contractNumber: loaded.snapshot.contractNumber,
    clauseReference: loaded.snapshot.clauseReference,
  });
  const html = await appendTerminationCertificateHtml(admin, signature, partyHtml, {
    documentNumber: loaded.snapshot.documentNumber,
    contractNumber: loaded.snapshot.contractNumber,
    title: loaded.snapshot.title,
  });
  const pdf = await renderTerminationHtmlToPdf(html, {
    vendorName: loaded.snapshot.vendor.name || 'SV LOTES',
    documentNumber: loaded.snapshot.documentNumber,
    footerNote:
      String(signature.signature_status || '').toUpperCase() === 'SIGNED'
        ? 'Documento assinado eletronicamente — conteúdo congelado no ato da operação'
        : 'Documento histórico — conteúdo congelado no ato da operação',
  });
  return { pdf, documentNumber: loaded.snapshot.documentNumber, html };
}

async function findExistingSignedTerminationDocument(
  admin: SupabaseClient,
  saleId: string,
  companyId: string,
  operationType?: string | null,
): Promise<{ id: string; storage_path: string } | null> {
  const { data } = await admin
    .from('sale_documents')
    .select('id, storage_path')
    .eq('sale_id', saleId)
    .eq('company_id', companyId)
    .eq('document_type', terminationSignedSaleDocumentType(operationType))
    .is('deleted_at', null)
    .maybeSingle();
  if (!data?.id || !data.storage_path) return null;
  return { id: String(data.id), storage_path: String(data.storage_path) };
}

export async function persistSignedTerminationPdf(
  admin: SupabaseClient,
  signatureRow: ContractSignatureRow,
): Promise<string | null> {
  const { saleId, loaded } = await loadFrozenTerminationContext(admin, signatureRow);
  const existing = await findExistingSignedTerminationDocument(
    admin,
    saleId,
    loaded.snapshot.companyId,
    loaded.snapshot.operationType,
  );
  if (existing) {
    await admin
      .from('sale_release_settlements')
      .update({
        document_status: 'SIGNED',
        updated_at: new Date().toISOString(),
      })
      .eq('sale_id', saleId)
      .eq('company_id', loaded.snapshot.companyId)
      .eq('status', 'EXECUTED');
    return existing.storage_path;
  }

  const { pdf, documentNumber } = await loadTerminationPdfForSign(admin, signatureRow);
  const fileName = `${terminationDocumentFileSlug(loaded.snapshot.operationType)}-assinado-${documentNumber.replace(/\//g, '-')}.pdf`;
  const ctx = {
    tenantId: String(signatureRow.tenant_id || loaded.snapshot.companyId),
    companyId: String(loaded.snapshot.companyId),
    projectId: loaded.snapshot.projectId,
    lotId: loaded.snapshot.blockId,
    buyerId: loaded.snapshot.customerId,
  };
  const storagePath = buildUploadStoragePathForSale({
    ctx,
    saleId,
    category: 'SYSTEM_GENERATED',
    fileName,
  });

  const { error: uploadError } = await admin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadError) {
    throw new TerminationDocumentError(uploadError.message, 'DOCUMENT_PDF_FAILED');
  }

  await createSystemGeneratedSaleDocumentMetadata(admin, {
    saleId,
    ctx,
    userId: String(loaded.snapshot.operatorUserId || signatureRow.tenant_id || ''),
    documentType: terminationSignedSaleDocumentType(loaded.snapshot.operationType),
    description: `${loaded.snapshot.title || DESISTENCIA_DOCUMENT_TITLE} (assinado) nº ${documentNumber}`,
    originalFileName: fileName,
    storagePath,
    mimeType: 'application/pdf',
    fileSize: pdf.byteLength,
  });

  await admin
    .from('sale_release_settlements')
    .update({
      document_status: 'SIGNED',
      updated_at: new Date().toISOString(),
    })
    .eq('sale_id', saleId)
    .eq('company_id', loaded.snapshot.companyId)
    .eq('status', 'EXECUTED');

  return storagePath;
}

export async function getTerminationSignatureView(
  admin: SupabaseClient,
  input: { saleId: string; companyId: string },
): Promise<{
  title: string;
  documentNumber: string | null;
  documentStatus: string | null;
  signatureStatus: string | null;
  signatureStatusLabel: string;
  uiStatus: ReturnType<typeof terminationSignatureUiStatus>;
  canSend: boolean;
  canResend: boolean;
  signedArtifactAvailable: boolean;
  parties: ReturnType<typeof toPublicPartyViews>;
  signUrl: string | null;
  expiresAt: string | null;
  contractNumber: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  companyName: string | null;
}> {
  const loaded = await loadTerminationDocumentBySale(admin, {
    saleId: input.saleId,
    companyId: input.companyId,
  });
  const signature = await loadLatestTerminationSignature(admin, {
    contractId: loaded?.snapshot?.contractId,
  });
  const parties = signature ? await listSignatureParties(admin, signature.id) : [];
  const aggregate = signature
    ? computeAggregateSaleSignatureStatus(toPartyStatusSnapshots(parties)) ||
      String(signature.signature_status)
    : null;
  const ui = terminationSignatureUiStatus(aggregate);
  const generated =
    loaded?.documentStatus === 'GENERATED' || loaded?.documentStatus === 'SIGNED';
  return {
    title: loaded?.snapshot?.title || DESISTENCIA_DOCUMENT_TITLE,
    documentNumber: loaded?.snapshot?.documentNumber || null,
    documentStatus: loaded?.documentStatus || null,
    signatureStatus: aggregate,
    signatureStatusLabel: aggregate ? saleSignatureStatusLabel(aggregate) : 'Gerado',
    uiStatus: generated ? ui : { code: 'GENERATED', label: 'Gerado' },
    canSend: generated && (ui.code === 'GENERATED' || ui.code === 'CANCELLED'),
    canResend:
      generated &&
      (ui.code === 'SENT' || ui.code === 'EXPIRED' || ui.code === 'CANCELLED'),
    signedArtifactAvailable: ui.code === 'SIGNED' || loaded?.documentStatus === 'SIGNED',
    parties: toPublicPartyViews(parties, { includeUrls: true }),
    signUrl: signature?.signature_url || null,
    expiresAt: signature?.expires_at || null,
    contractNumber: loaded?.snapshot?.contractNumber || null,
    projectName: loaded?.snapshot?.projectName || null,
    quadra: loaded?.snapshot?.quadra || null,
    lote: loaded?.snapshot?.lote || null,
    companyName: loaded?.snapshot?.vendor.name || null,
  };
}
