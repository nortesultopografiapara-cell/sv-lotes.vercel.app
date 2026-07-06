/**
 * Assinatura eletrônica de contratos de compra e venda — token, envio, visualização e registro.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildContractViewHtml } from '@/lib/buildContractViewHtml';
import { readStoredContractHtml } from '@/lib/contractRegeneration';
import { onlyDigits } from '@/lib/inputMasks';
import {
  isValidSignerEmail,
  normalizeSignerEmail,
} from '@/lib/saleContractEmailValidation';
import {
  buildSignatureHashPayload,
  computeSignatureHash,
} from '@/lib/saasContractSignaturePdf';
import {
  generateSignatureToken,
  isSignatureExpired,
  resolveClientIp,
  signatureExpiresAt,
} from '@/lib/saasContractSignatureService';
import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';
import {
  canVendorSignSaleContract,
  isSaleLegacyAutoSigned,
  shouldIssueSaleCertificate,
} from '@/lib/saleContractBilateralSignature';
import {
  enrichClientEvidenceForSign,
  enrichVendorEvidenceForSign,
  readClientEvidenceFromRow,
  readVendorEvidenceFromRow,
} from '@/lib/signatureEvidence';
import {
  logSignatureEvent,
} from '@/lib/signatureEventService';
import { buildSaleSignUrl } from '@/lib/saleContractUrls';
import type { SaleSignatureStatus } from '@/lib/saleContractSignatureStatus';
import {
  canPublicSaleSign,
  isSaleSignatureBlocked,
} from '@/lib/saleContractSignatureStatus';

export { resolveClientIp, isSignatureExpired };

const SALE_CONTRACT_BUCKET = 'company-assets';

function sanitizeContractFileName(contractNumber: string): string {
  return contractNumber.replace(/[^\w-]+/g, '_');
}

function buildSignedSaleContractStoragePath(
  tenantId: string,
  contractNumber: string,
): string {
  const safeName = sanitizeContractFileName(contractNumber);
  return `contracts/sale-signed/${tenantId}/${safeName}.pdf`;
}

async function uploadSignedSaleContractPdf(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  contractNumber: string,
  pdfBytes: Uint8Array,
): Promise<string | null> {
  const storagePath = buildSignedSaleContractStoragePath(tenantId, contractNumber);
  const fileBody = Buffer.from(pdfBytes);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SALE_CONTRACT_BUCKET)
    .upload(storagePath, fileBody, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.warn('[SALE_CONTRACT_SIGN] upload signed pdf', uploadError.message);
    return null;
  }

  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from(SALE_CONTRACT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signError || !signedData?.signedUrl) {
    const { data: publicData } = supabaseAdmin.storage
      .from(SALE_CONTRACT_BUCKET)
      .getPublicUrl(storagePath);
    return publicData.publicUrl || null;
  }

  return signedData.signedUrl;
}

async function recordSaleContractSignatureAudit(
  supabaseAdmin: SupabaseClient,
  params: {
    tenantId: string;
    contractId: string;
    contractNumber: string;
    signerName: string;
    signerDocument: string;
    signerEmail: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    signedAt: string;
    token: string;
  },
): Promise<void> {
  const description = [
    `Contrato ${params.contractNumber}`,
    params.signerName,
    params.signerEmail,
    params.signerDocument ? `CPF ${params.signerDocument}` : null,
    params.ipAddress ? `IP ${params.ipAddress}` : null,
    params.userAgent ? `UA ${params.userAgent.slice(0, 120)}` : null,
    `token ${params.token.slice(0, 8)}…`,
    params.signedAt,
  ]
    .filter(Boolean)
    .join(' | ');

  const { error } = await supabaseAdmin.from('audit_logs').insert({
    tenant_id: params.tenantId,
    company_id: params.tenantId,
    user_id: null,
    action: 'CONTRACT_SIGNED_ELECTRONICALLY',
    module: 'CONTRACTS',
    reference_id: params.contractId,
    description,
  });

  if (error) {
    console.warn('[SALE_CONTRACT_SIGN] audit log', error.message);
  }
}

export class SaleContractSignatureError extends Error {
  constructor(
    message: string,
    readonly step: 'validation' | 'db_save' | 'html' = 'validation',
  ) {
    super(message);
    this.name = 'SaleContractSignatureError';
  }
}

export type ContractSignatureRow = {
  id: string;
  contract_id: string;
  tenant_id: string;
  customer_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_document: string | null;
  signature_status: SaleSignatureStatus;
  signature_token: string;
  signature_url: string;
  ip_address: string | null;
  user_agent: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string;
  signature_hash: string | null;
  signer_phone?: string | null;
  signer_browser?: string | null;
  signer_os?: string | null;
  signer_device?: string | null;
  signer_ip_city?: string | null;
  signer_ip_region?: string | null;
  signer_ip_country?: string | null;
  signed_at_iso?: string | null;
  signature_event_id?: string | null;
  signed_document_type?: string | null;
  validation_public_url?: string | null;
  certificate_status?: string | null;
  vendor_signer_name?: string | null;
  vendor_signer_email?: string | null;
  vendor_signer_document?: string | null;
  vendor_signer_role?: string | null;
  vendor_signed_at?: string | null;
  vendor_signature_hash?: string | null;
  vendor_ip_address?: string | null;
  vendor_user_agent?: string | null;
  vendor_phone?: string | null;
  vendor_browser?: string | null;
  vendor_os?: string | null;
  vendor_device?: string | null;
  vendor_ip_city?: string | null;
  vendor_ip_region?: string | null;
  vendor_ip_country?: string | null;
  vendor_signed_at_iso?: string | null;
  vendor_signature_event_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type SignatureHistoryEvent = {
  at: string;
  event: string;
  user: string;
  ip: string | null;
  details?: string | null;
};

export async function getSaleSignatureByToken(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<ContractSignatureRow | null> {
  const { data, error } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('signature_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return data as ContractSignatureRow;
}

export async function listSaleContractSignatures(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<ContractSignatureRow[]> {
  const { data, error } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[SALE_CONTRACT_SIGN] list', error.message);
    return [];
  }
  return (data || []) as ContractSignatureRow[];
}

export function buildSaleSignatureHistory(
  signature: ContractSignatureRow,
): SignatureHistoryEvent[] {
  const events: SignatureHistoryEvent[] = [];

  events.push({
    at: signature.created_at,
    event: 'Link enviado',
    user: 'Sistema',
    ip: null,
  });

  if (signature.viewed_at) {
    events.push({
      at: signature.viewed_at,
      event: 'Comprador visualizou',
      user: signature.signer_name || 'Comprador',
      ip: signature.ip_address,
    });
  }

  if (signature.signed_at) {
    events.push({
      at: signature.signed_at,
      event: 'Comprador assinou',
      user: signature.signer_name || 'Comprador',
      ip: signature.ip_address,
      details: [
        signature.signer_document ? `CPF ${signature.signer_document}` : null,
        signature.signer_email ? `E-mail ${signature.signer_email}` : null,
        signature.signature_token ? `Token ${signature.signature_token.slice(0, 8)}…` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (signature.vendor_signed_at) {
    events.push({
      at: signature.vendor_signed_at,
      event: 'Vendedor assinou',
      user: signature.vendor_signer_name || 'PROMITENTE VENDEDOR',
      ip: signature.vendor_ip_address,
      details: [
        signature.vendor_signer_document
          ? `Doc. ${signature.vendor_signer_document}`
          : null,
        signature.vendor_signer_email ? `E-mail ${signature.vendor_signer_email}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (
    signature.signature_status === 'SIGNED' &&
    shouldIssueSaleCertificate(signature.signature_status, signature.vendor_signed_at)
  ) {
    events.push({
      at: signature.vendor_signed_at || signature.signed_at || signature.updated_at,
      event: 'Certificado emitido',
      user: 'Sistema',
      ip: null,
      details: 'Certificado digital bilateral anexado ao PDF',
    });
  }

  if (signature.signature_status === 'EXPIRED') {
    events.push({
      at: signature.expires_at,
      event: 'Expirado',
      user: 'Sistema',
      ip: null,
      details: 'Link de assinatura expirado',
    });
  }

  if (signature.signature_status === 'CANCELLED') {
    events.push({
      at: signature.updated_at,
      event: 'Cancelado',
      user: 'Sistema',
      ip: null,
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

async function mirrorSignatureToContract(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  signature: ContractSignatureRow,
  extra?: Partial<Record<string, unknown>>,
): Promise<void> {
  const patch: Record<string, unknown> = {
    signature_token: signature.signature_token,
    signature_status: signature.signature_status,
    signature_expires_at: signature.expires_at,
    ...extra,
  };

  if (signature.created_at) patch.signature_sent_at = signature.created_at;
  if (signature.viewed_at) patch.signature_viewed_at = signature.viewed_at;
  if (signature.signed_at) {
    patch.signed_at = signature.signed_at;
    patch.signed_by_name = signature.signer_name;
    patch.signed_by_cpf = signature.signer_document;
    patch.signed_ip = signature.ip_address;
    patch.signed_user_agent = signature.user_agent;
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update(patch)
    .eq('id', contractId);

  if (error) {
    console.warn('[SALE_CONTRACT_SIGN] mirror contract', error.message);
  }
}

export async function cancelOpenSaleSignatures(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('contract_signatures')
    .update({
      signature_status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('contract_id', contractId)
    .in('signature_status', ['PENDING', 'VIEWED']);

  if (error) {
    console.warn('[SALE_CONTRACT_SIGN] cancel open', error.message);
  }
}

function assertContractEligibleForSignature(
  contract: Record<string, unknown>,
): void {
  const status = String(contract.status || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled', 'superseded'].includes(status)) {
    throw new SaleContractSignatureError(
      'Contrato cancelado ou substituído. Não é possível enviar para assinatura.',
    );
  }
  if (['assinado', 'signed'].includes(status)) {
    throw new SaleContractSignatureError('Este contrato já está assinado.');
  }
  if (['client_signed'].includes(status)) {
    throw new SaleContractSignatureError(
      'Aguardando assinatura do vendedor. Não é possível reenviar até concluir a assinatura bilateral.',
    );
  }
  if (!readStoredContractHtml(contract)) {
    throw new SaleContractSignatureError(
      'O contrato não possui conteúdo gerado. Regenerar o contrato antes de enviar.',
    );
  }
}

export async function sendSaleContractForSignature(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<{
  signature: ContractSignatureRow;
  signUrl: string;
}> {
  const startedAt = Date.now();
  const mark = (step: string, extra?: Record<string, unknown>) => {
    console.log('[contracts/signature]', step, {
      ms: Date.now() - startedAt,
      contractId,
      ...extra,
    });
  };

  mark('load_contract');
  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (contractErr || !contract) {
    mark('response', { status: 404 });
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  mark('contract_found', {
    hasHtml: Boolean(readStoredContractHtml(contractRow)),
  });
  assertContractEligibleForSignature(contractRow);

  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  if (!tenantId) {
    throw new SaleContractSignatureError('Contrato sem tenant vinculado.');
  }

  await cancelOpenSaleSignatures(supabaseAdmin, contractId);

  mark('signature_token');
  const token = generateSignatureToken();
  const signUrl = buildSaleSignUrl(token);
  const validationUrl = buildSignatureVerifyUrl(token);
  const now = new Date().toISOString();
  const expiresAt = signatureExpiresAt();

  const { data: signature, error } = await supabaseAdmin
    .from('contract_signatures')
    .insert({
      contract_id: contractId,
      tenant_id: tenantId,
      customer_id: (contractRow.customer_id as string) || null,
      signature_status: 'PENDING',
      signature_token: token,
      signature_url: signUrl,
      validation_public_url: validationUrl,
      signed_document_type: 'CONTRATO_VENDA',
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !signature) {
    mark('response', { status: 500, message: error?.message });
    throw new SaleContractSignatureError(
      `Falha ao registrar envio para assinatura: ${error?.message || 'sem retorno'}`,
      'db_save',
    );
  }

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SALE',
    signatureRecordId: String(signature.id),
    eventType: 'LINK_CREATED',
    eventDescription: 'Link de assinatura criado para contrato de venda.',
    occurredAt: now,
  });

  await mirrorSignatureToContract(supabaseAdmin, contractId, signature as ContractSignatureRow, {
    signature_sent_at: now,
    signature_viewed_at: null,
    signed_at: null,
    signed_by_name: null,
    signed_by_cpf: null,
    signed_ip: null,
    signed_user_agent: null,
  });

  mark('response', { status: 200, signUrl: signUrl.slice(0, 32) + '…' });
  return {
    signature: signature as ContractSignatureRow,
    signUrl,
  };
}

export async function markSaleSignatureViewed(
  supabaseAdmin: SupabaseClient,
  signature: ContractSignatureRow,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ContractSignatureRow> {
  if (isSaleSignatureBlocked(signature.signature_status)) return signature;
  if (signature.signature_status === 'CANCELLED') return signature;

  if (isSignatureExpired(signature.expires_at)) {
    const { data } = await supabaseAdmin
      .from('contract_signatures')
      .update({
        signature_status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', signature.id)
      .select('*')
      .single();
    if (data) {
      await mirrorSignatureToContract(supabaseAdmin, signature.contract_id, data as ContractSignatureRow);
      return data as ContractSignatureRow;
    }
    return signature;
  }

  if (signature.signature_status !== 'PENDING') return signature;

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('contract_signatures')
    .update({
      signature_status: 'VIEWED',
      viewed_at: now,
      ip_address: meta.ipAddress || signature.ip_address,
      user_agent: meta.userAgent || signature.user_agent,
      updated_at: now,
    })
    .eq('id', signature.id)
    .select('*')
    .single();

  if (error || !data) return signature;

  await mirrorSignatureToContract(supabaseAdmin, signature.contract_id, data as ContractSignatureRow, {
    signature_viewed_at: now,
  });

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signature.signature_token,
    signatureSource: 'SALE',
    signatureRecordId: signature.id,
    eventType: 'DOCUMENT_VIEWED',
    personName: signature.signer_name,
    ipAddress: meta.ipAddress || undefined,
    userAgent: meta.userAgent || undefined,
    eventDescription: 'Comprador visualizou o contrato para assinatura.',
    occurredAt: now,
  });

  return data as ContractSignatureRow;
}

export type SignSaleContractInput = {
  signerName: string;
  signerDocument: string;
  signerEmail: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function signSaleContractElectronically(
  supabaseAdmin: SupabaseClient,
  token: string,
  input: SignSaleContractInput,
): Promise<{ signature: ContractSignatureRow }> {
  const signature = await getSaleSignatureByToken(supabaseAdmin, token);
  if (!signature) {
    throw new SaleContractSignatureError('Link de assinatura inválido.');
  }

  if (isSaleSignatureBlocked(signature.signature_status)) {
    const msg =
      signature.signature_status === 'SIGNED'
        ? 'Este contrato já foi assinado. O link está bloqueado.'
        : signature.signature_status === 'CLIENT_SIGNED'
          ? 'Você já assinou este contrato. Aguardando assinatura do vendedor.'
          : signature.signature_status === 'CANCELLED'
            ? 'Esta solicitação de assinatura foi cancelada.'
            : 'O link de assinatura não está mais disponível.';
    throw new SaleContractSignatureError(msg);
  }

  if (!canPublicSaleSign(signature.signature_status)) {
    throw new SaleContractSignatureError('O link de assinatura não está disponível para assinatura.');
  }

  if (isSignatureExpired(signature.expires_at)) {
    await supabaseAdmin
      .from('contract_signatures')
      .update({
        signature_status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', signature.id);
    throw new SaleContractSignatureError('O link de assinatura expirou.');
  }

  const signerName = String(input.signerName || '').trim();
  const signerDocument = onlyDigits(input.signerDocument);
  const signerEmail = normalizeSignerEmail(input.signerEmail);

  if (!signerName || signerDocument.length < 11) {
    throw new SaleContractSignatureError('Informe nome completo e CPF válidos para assinar.');
  }
  if (!isValidSignerEmail(signerEmail)) {
    throw new SaleContractSignatureError('Informe um e-mail válido para assinar.');
  }

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', signature.contract_id)
    .single();

  if (contractErr || !contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  const contractStatus = String(contractRow.status || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled'].includes(contractStatus)) {
    throw new SaleContractSignatureError('Contrato cancelado. Assinatura não permitida.');
  }
  if (['assinado', 'signed'].includes(contractStatus)) {
    throw new SaleContractSignatureError('Este contrato já possui assinatura registrada.');
  }
  if (['client_signed'].includes(contractStatus)) {
    throw new SaleContractSignatureError(
      'Contrato aguardando assinatura do vendedor.',
    );
  }

  const signedAt = new Date().toISOString();
  const hashPayload = buildSignatureHashPayload({
    contractId: String(contractRow.id),
    contractNumber: String(contractRow.contract_number || ''),
    signerName,
    signerDocument,
    signerEmail,
    signedAt,
    ipAddress: input.ipAddress || '',
    party: 'CLIENT',
  });
  const signatureHash = await computeSignatureHash(hashPayload);

  const evidencePatch = await enrichClientEvidenceForSign({
    signerEmail,
    signerPhone: null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt,
    documentType: 'CONTRATO_VENDA',
    validationToken: token,
  });
  // Não marcar certificado como validado até assinatura bilateral completa.
  delete evidencePatch.certificate_status;

  const { data: updatedSignature, error: signErr } = await supabaseAdmin
    .from('contract_signatures')
    .update({
      signer_name: signerName,
      signer_email: signerEmail,
      signer_document: signerDocument,
      signature_status: 'CLIENT_SIGNED',
      signed_at: signedAt,
      signature_hash: signatureHash,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
      ...evidencePatch,
      certificate_status: null,
      updated_at: signedAt,
    })
    .eq('id', signature.id)
    .select('*')
    .single();

  if (signErr || !updatedSignature) {
    throw new SaleContractSignatureError(
      `Falha ao registrar assinatura: ${signErr?.message || 'sem retorno'}`,
      'db_save',
    );
  }

  await supabaseAdmin
    .from('contracts')
    .update({
      status: 'client_signed',
      signature_status: 'CLIENT_SIGNED',
      signed_at: signedAt,
      signed_by_name: signerName,
      signed_by_cpf: signerDocument,
      signed_ip: input.ipAddress || null,
      signed_user_agent: input.userAgent || null,
      updated_at: signedAt,
    })
    .eq('id', signature.contract_id);

  const signedSignature = updatedSignature as ContractSignatureRow;

  await mirrorSignatureToContract(supabaseAdmin, signature.contract_id, signedSignature);

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SALE',
    signatureRecordId: signedSignature.id,
    eventType: 'CLIENT_SIGNED',
    personName: signerName,
    personEmail: signerEmail,
    ipAddress: input.ipAddress || undefined,
    userAgent: input.userAgent || undefined,
    eventDescription: 'Assinatura eletrônica realizada pelo comprador.',
    occurredAt: signedAt,
    metadata: { signature_event_id: evidencePatch.signature_event_id },
  });

  await recordSaleContractSignatureAudit(supabaseAdmin, {
    tenantId,
    contractId: String(contractRow.id),
    contractNumber: String(contractRow.contract_number || ''),
    signerName,
    signerDocument,
    signerEmail,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt,
    token,
  });

  return { signature: signedSignature };
}

export type SignSaleContractByVendorInput = {
  vendorName: string;
  vendorDocument: string;
  vendorEmail: string;
  vendorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function signSaleContractByVendor(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  signatureId: string,
  input: SignSaleContractByVendorInput,
): Promise<{
  signature: ContractSignatureRow;
  pdfSignedUrl: string | null;
}> {
  const { data: signature, error: sigErr } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('id', signatureId)
    .eq('contract_id', contractId)
    .maybeSingle();

  if (sigErr || !signature) {
    throw new SaleContractSignatureError('Solicitação de assinatura não encontrada.');
  }

  const signatureRow = signature as ContractSignatureRow;

  if (!canVendorSignSaleContract(signatureRow.signature_status)) {
    throw new SaleContractSignatureError(
      signatureRow.signature_status === 'SIGNED'
        ? 'Este contrato já foi assinado pelo vendedor.'
        : 'O vendedor só pode assinar após a assinatura do comprador.',
    );
  }

  if (!signatureRow.signed_at || !signatureRow.signer_name) {
    throw new SaleContractSignatureError(
      'Assinatura do comprador incompleta. Aguarde o comprador assinar primeiro.',
    );
  }

  const vendorName = String(input.vendorName || '').trim();
  const vendorDocument = onlyDigits(input.vendorDocument);
  const vendorEmail = normalizeSignerEmail(input.vendorEmail);

  if (!vendorName || vendorDocument.length < 11) {
    throw new SaleContractSignatureError(
      'Informe nome completo e CPF/CNPJ válidos do representante da imobiliária.',
    );
  }
  if (!isValidSignerEmail(vendorEmail)) {
    throw new SaleContractSignatureError('Informe um e-mail válido para assinar.');
  }

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (contractErr || !contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  const contractStatus = String(contractRow.status || '').toLowerCase();

  if (['cancelado', 'cancelled', 'canceled'].includes(contractStatus)) {
    throw new SaleContractSignatureError('Contrato cancelado. Assinatura não permitida.');
  }
  if (['assinado', 'signed'].includes(contractStatus) && contractRow.pdf_signed_url) {
    throw new SaleContractSignatureError('Este contrato já possui PDF assinado final.');
  }

  const clientSignedAt = signatureRow.signed_at!;
  const vendorSignedAt = new Date().toISOString();

  const clientHash =
    signatureRow.signature_hash ||
    (await computeSignatureHash(
      buildSignatureHashPayload({
        contractId: String(contractRow.id),
        contractNumber: String(contractRow.contract_number || ''),
        signerName: signatureRow.signer_name!,
        signerDocument: signatureRow.signer_document || '',
        signerEmail: signatureRow.signer_email || '',
        signedAt: clientSignedAt,
        ipAddress: signatureRow.ip_address || '',
        party: 'CLIENT',
      }),
    ));

  const vendorHashPayload = buildSignatureHashPayload({
    contractId: String(contractRow.id),
    contractNumber: String(contractRow.contract_number || ''),
    signerName: vendorName,
    signerDocument: vendorDocument,
    signerEmail: vendorEmail,
    signedAt: vendorSignedAt,
    ipAddress: input.ipAddress || '',
    party: 'PROVIDER',
  });
  const vendorHash = await computeSignatureHash(vendorHashPayload);

  const vendorEvidencePatch = await enrichVendorEvidenceForSign({
    vendorEmail,
    vendorPhone: null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: vendorSignedAt,
  });

  const previewSignature: ContractSignatureRow = {
    ...signatureRow,
    vendor_signer_name: vendorName,
    vendor_signer_email: vendorEmail,
    vendor_signer_document: vendorDocument,
    vendor_signer_role: input.vendorRole || null,
    vendor_signed_at: vendorSignedAt,
    vendor_signature_hash: vendorHash,
    vendor_ip_address: input.ipAddress || null,
    vendor_user_agent: input.userAgent || null,
    ...vendorEvidencePatch,
    signature_status: 'SIGNED',
    signature_hash: clientHash,
    certificate_status: 'VALIDADO',
  } as ContractSignatureRow;

  const signContext = await loadSaleSignPageContext(supabaseAdmin, previewSignature);
  const { pdf } = await loadSaleContractPdfForSign(
    supabaseAdmin,
    contractId,
    {
      signature: previewSignature,
      signContext,
    },
  );

  const contractNumber = String(contractRow.contract_number || '');
  const pdfSignedUrl = tenantId
    ? await uploadSignedSaleContractPdf(supabaseAdmin, tenantId, contractNumber, pdf)
    : null;

  const { data: updatedSignature, error: signErr } = await supabaseAdmin
    .from('contract_signatures')
    .update({
      vendor_signer_name: vendorName,
      vendor_signer_email: vendorEmail,
      vendor_signer_document: vendorDocument,
      vendor_signer_role: input.vendorRole || null,
      vendor_signed_at: vendorSignedAt,
      vendor_signature_hash: vendorHash,
      vendor_ip_address: input.ipAddress || null,
      vendor_user_agent: input.userAgent || null,
      ...vendorEvidencePatch,
      signature_status: 'SIGNED',
      signature_hash: clientHash,
      certificate_status: 'VALIDADO',
      updated_at: vendorSignedAt,
    })
    .eq('id', signatureRow.id)
    .select('*')
    .single();

  if (signErr || !updatedSignature) {
    throw new SaleContractSignatureError(
      `Falha ao registrar assinatura do vendedor: ${signErr?.message || 'sem retorno'}`,
      'db_save',
    );
  }

  const finalSignature = updatedSignature as ContractSignatureRow;

  await supabaseAdmin
    .from('contracts')
    .update({
      status: 'assinado',
      signature_status: 'SIGNED',
      signed_at: vendorSignedAt,
      pdf_signed_url: pdfSignedUrl,
      updated_at: vendorSignedAt,
    })
    .eq('id', contractId);

  const saleId = contractRow.sale_id as string | undefined;
  if (saleId) {
    await supabaseAdmin.from('sales').update({ status: 'ativo' }).eq('id', saleId);
  }

  await mirrorSignatureToContract(supabaseAdmin, contractId, finalSignature, {
    signed_at: vendorSignedAt,
  });

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signatureRow.signature_token,
    signatureSource: 'SALE',
    signatureRecordId: signatureRow.id,
    eventType: 'PROVIDER_SIGNED',
    personName: vendorName,
    personEmail: vendorEmail,
    ipAddress: input.ipAddress || undefined,
    userAgent: input.userAgent || undefined,
    eventDescription: 'Assinatura eletrônica realizada pelo PROMITENTE VENDEDOR (imobiliária).',
    occurredAt: vendorSignedAt,
    metadata: { signature_event_id: vendorEvidencePatch.vendor_signature_event_id },
  });

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signatureRow.signature_token,
    signatureSource: 'SALE',
    signatureRecordId: signatureRow.id,
    eventType: 'CERTIFICATE_ISSUED',
    personName: vendorName,
    eventDescription: 'Certificado digital bilateral emitido e anexado ao PDF assinado.',
    occurredAt: vendorSignedAt,
  });

  await recordSaleContractSignatureAudit(supabaseAdmin, {
    tenantId,
    contractId,
    contractNumber,
    signerName: vendorName,
    signerDocument: vendorDocument,
    signerEmail: vendorEmail,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: vendorSignedAt,
    token: signatureRow.signature_token,
  });

  return { signature: finalSignature, pdfSignedUrl };
}

export async function loadSaleContractHtmlForSign(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<string> {
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const storedHtml = String(contractRow.generated_html || contractRow.html_content || '').trim();
  if (storedHtml) return storedHtml;

  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  const [{ data: tenant }, { data: customer }, { data: block }, { data: sale }] =
    await Promise.all([
      tenantId
        ? supabaseAdmin.from('companies').select('*').eq('id', tenantId).maybeSingle()
        : Promise.resolve({ data: null }),
      contractRow.customer_id
        ? supabaseAdmin
            .from('customers')
            .select('*')
            .eq('id', contractRow.customer_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      contractRow.block_id
        ? supabaseAdmin
            .from('blocks')
            .select('*')
            .eq('id', contractRow.block_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      contractRow.sale_id
        ? supabaseAdmin
            .from('sales')
            .select('*, finance_receipts(*)')
            .eq('id', contractRow.sale_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  let project = null;
  const projectId =
    contractRow.project_id ||
    (block as Record<string, unknown> | null)?.project_id ||
    (sale as Record<string, unknown> | null)?.project_id;
  if (projectId) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId as string)
      .maybeSingle();
    project = data;
  }

  const receipts =
    (sale as { finance_receipts?: unknown[] } | null)?.finance_receipts || null;

  return buildContractViewHtml(supabaseAdmin, {
    contract: contractRow,
    tenant: (tenant as Record<string, unknown>) || {},
    customer: (customer as Record<string, unknown>) || null,
    block: (block as Record<string, unknown>) || null,
    sale: (sale as Record<string, unknown>) || null,
    project: (project as Record<string, unknown>) || null,
    receipts: receipts as never,
  });
}

export async function loadSaleContractPdfForSign(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  options?: {
    signature?: ContractSignatureRow | null;
    signContext?: Awaited<ReturnType<typeof loadSaleSignPageContext>> | null;
  },
): Promise<{ pdf: Uint8Array; contractNumber: string }> {
  let html = await loadSaleContractHtmlForSign(supabaseAdmin, contractId);

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('contract_number, tenant_id, company_id, created_at, version')
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const contractNumber = String(contractRow.contract_number || '');
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');

  let tenant: Record<string, unknown> = {};
  if (tenantId) {
    const { data } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();
    tenant = (data as Record<string, unknown>) || {};
  }

  const { getCompanyDisplayName } = await import(
    '@/lib/contractCompanyDisplay'
  );
  const { buildSaleContractPdfFromHtml, loadTenantLogoBase64ForPdf } = await import(
    '@/lib/saleContractPdf'
  );

  const logoBase64 = await loadTenantLogoBase64ForPdf(tenant);

  const signature = options?.signature;
  if (
    signature &&
    shouldIssueSaleCertificate(signature.signature_status, signature.vendor_signed_at)
  ) {
    const ctx = options?.signContext;
    const {
      buildSaleContractSignatureCertificateHtmlWithQr,
      stripManualContractSignaturesForSignedPdf,
    } = await import('@/lib/saleContractSignatureCertificateHtml');
    const { normalizeSellerFromCompany } = await import('@/lib/contractSeller');
    const { resolveSaleContractCertificatePublicUrl } = await import(
      '@/lib/saleContractSignatureVerify'
    );

    const block = ctx?.block as Record<string, unknown> | null;
    const project = ctx?.project as Record<string, unknown> | null;
    const company = ctx?.company as Record<string, unknown> | null;
    const customer = ctx?.customer as Record<string, unknown> | null;
    const contractCtx = ctx?.contract as Record<string, unknown> | null;

    const quadra = String(
      block?.quadra || block?.block_name || block?.name || '—',
    );
    const lote = String(
      block?.lot_number ||
        block?.lote ||
        block?.number ||
        contractCtx?.lot_number_snapshot ||
        '—',
    );

    const seller = normalizeSellerFromCompany(tenant);
    const companyName = getCompanyDisplayName(company || tenant);
    const buyerName = String(signature.signer_name || customer?.name || '');
    const buyerDocument = String(signature.signer_document || '');

    html = stripManualContractSignaturesForSignedPdf(html);

    const clientEvidence = readClientEvidenceFromRow(
      signature as unknown as Record<string, unknown>,
    );
    const vendorEvidence = readVendorEvidenceFromRow(
      signature as unknown as Record<string, unknown>,
    );
    const legacyAutoVendor = isSaleLegacyAutoSigned(
      signature.signature_status,
      signature.vendor_signed_at,
    );

    html += await buildSaleContractSignatureCertificateHtmlWithQr({
      contractNumber,
      projectName: String(
        project?.name || contractCtx?.project_name_snapshot || '',
      ),
      quadra,
      lote,
      buyerName,
      buyerDocument,
      signerEmail: signature.signer_email,
      signerPhone: clientEvidence.phone !== 'Não informado' ? clientEvidence.phone : null,
      companyName,
      companyCnpj: String(company?.cnpj || tenant?.cnpj || ''),
      representativeName: legacyAutoVendor
        ? seller.representative
        : signature.vendor_signer_name || seller.representative,
      representativeCpf: legacyAutoVendor
        ? seller.representativeCpf
        : signature.vendor_signer_document || seller.representativeCpf,
      vendorDocumentLabel: seller.representativeCpf ? 'CPF' : 'CNPJ',
      signatureStatus: 'ASSINADO ELETRONICAMENTE',
      signedAt: signature.signed_at,
      viewedAt: signature.viewed_at,
      ipAddress: signature.ip_address,
      browser: clientEvidence.browser,
      os: clientEvidence.os,
      device: clientEvidence.device,
      approxLocation: clientEvidence.location,
      signatureEventId: clientEvidence.signatureEventId,
      vendorIpAddress: legacyAutoVendor
        ? signature.ip_address
        : signature.vendor_ip_address,
      vendorSignedAt: legacyAutoVendor
        ? signature.signed_at
        : signature.vendor_signed_at,
      vendorEmail: legacyAutoVendor ? null : signature.vendor_signer_email,
      vendorPhone: legacyAutoVendor ? null : vendorEvidence.phone,
      vendorBrowser: legacyAutoVendor ? null : vendorEvidence.browser,
      vendorOs: legacyAutoVendor ? null : vendorEvidence.os,
      vendorDevice: legacyAutoVendor ? null : vendorEvidence.device,
      vendorApproxLocation: legacyAutoVendor ? null : vendorEvidence.location,
      vendorSignatureEventId: legacyAutoVendor
        ? null
        : vendorEvidence.signatureEventId,
      legacyAutoVendor,
      signatureToken: signature.signature_token,
      signatureHash: signature.signature_hash,
      vendorSignatureHash: signature.vendor_signature_hash,
      signatureUrl: signature.signature_url,
      publicUrl: resolveSaleContractCertificatePublicUrl(
        signature.signature_token,
        signature.signature_url,
        signature.validation_public_url,
      ),
      validationPublicUrl: signature.validation_public_url,
      issuedAt: String(signature.vendor_signed_at || contractRow.created_at || contractCtx?.created_at || ''),
      documentVersion: Number(contractRow.version || contractCtx?.version || 1),
      uniqueId: signature.id,
      historyEvents: buildSaleSignatureHistory(signature),
    });
  }

  try {
    const { buildContractPdfChromeFromTenant } = await import(
      '@/lib/contractPdfPostProcess'
    );
    const pdf = await buildSaleContractPdfFromHtml(
      html,
      buildContractPdfChromeFromTenant(tenant, contractNumber, logoBase64),
    );

    return { pdf, contractNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`loadSaleContractPdfForSign: ${message}`);
  }
}

export async function getLatestSignedSaleSignature(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<ContractSignatureRow | null> {
  const { data } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('contract_id', contractId)
    .eq('signature_status', 'SIGNED')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ContractSignatureRow) || null;
}

export async function loadSaleSignPageContext(
  supabaseAdmin: SupabaseClient,
  signature: ContractSignatureRow,
): Promise<{
  contract: Record<string, unknown>;
  customer: Record<string, unknown> | null;
  block: Record<string, unknown> | null;
  project: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
}> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', signature.contract_id)
    .single();

  if (!contract) {
    throw new SaleContractSignatureError('Contrato não encontrado.');
  }

  const contractRow = contract as Record<string, unknown>;
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');

  const [{ data: company }, { data: customer }, { data: block }] = await Promise.all([
    tenantId
      ? supabaseAdmin.from('companies').select('id, name, cnpj, fantasy_name').eq('id', tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    contractRow.customer_id
      ? supabaseAdmin.from('customers').select('*').eq('id', contractRow.customer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    contractRow.block_id
      ? supabaseAdmin.from('blocks').select('*').eq('id', contractRow.block_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let project = null;
  const projectId =
    contractRow.project_id ||
    (block as Record<string, unknown> | null)?.project_id;
  if (projectId) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('id', projectId as string)
      .maybeSingle();
    project = data;
  }

  return {
    contract: contractRow,
    customer: (customer as Record<string, unknown>) || null,
    block: (block as Record<string, unknown>) || null,
    project: (project as Record<string, unknown>) || null,
    company: (company as Record<string, unknown>) || null,
  };
}
