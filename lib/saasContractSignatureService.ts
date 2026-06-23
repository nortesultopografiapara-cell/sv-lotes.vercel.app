/**
 * Assinatura eletrônica de contratos SaaS — token, envio, visualização e registro.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
import { resolveStoredSaasContractContentVersion } from '@/lib/saasContractContent';
import { validateSaasContractPdfInput } from '@/lib/saasContractPdfValidation';
import { SaasContractStepError } from '@/lib/saasContractErrors';
import {
  loadFreshSaasContractContext,
  type CompanyContractRow,
} from '@/lib/saasContractService';
import {
  isCurrentSaasContractVersion,
  type SignatureStatus,
} from '@/lib/saasContractStatus';
import { buildSignUrl } from '@/lib/saasContractUrls';
import {
  buildSignatureHashPayload,
  computeSignatureHash,
  formatSignatureDateBr,
  formatSignatureTimeBr,
  type BilateralSignatureCertificateData,
} from '@/lib/saasContractSignaturePdf';
import { formatSignerDocumentLine } from '@/lib/saasContractDocumentLabel';
import { formatSaasContractAddress, extractAddressPartsFromCompany } from '@/lib/saasContractAddress';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';
import {
  canProviderSignContract,
  isFullySignedContract,
  isPublicClientSignBlocked,
} from '@/lib/saasContractBilateralSignature';
import { onlyDigits } from '@/lib/inputMasks';
import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';
import {
  enrichClientEvidenceForSign,
  enrichProviderEvidenceForSign,
  readClientEvidenceFromRow,
  readProviderEvidenceFromRow,
} from '@/lib/signatureEvidence';
import { logSignatureEvent } from '@/lib/signatureEventService';

const SAAS_CONTRACT_BUCKET = 'company-assets';
const SIGNATURE_EXPIRY_DAYS = 30;

/** Logs de diagnóstico /sign/[token] — ativar com SAAS_SIGN_PUBLIC_DEBUG=1 no ambiente. */
export function isSaasSignPublicDebugEnabled(): boolean {
  return String(process.env.SAAS_SIGN_PUBLIC_DEBUG || '').trim() === '1';
}

export function debugPublicSign(payload: Record<string, unknown>): void {
  if (!isSaasSignPublicDebugEnabled()) return;
  console.log('SAAS_SIGN_PUBLIC_DEBUG', payload);
}

export type CompanyContractSignatureRow = {
  id: string;
  contract_id: string;
  company_id: string;
  signer_name: string | null;
  signer_email: string | null;
  signer_document: string | null;
  signer_role: string | null;
  signature_status: SignatureStatus;
  signature_token: string;
  provider_signature_token?: string | null;
  signature_url: string;
  ip_address: string | null;
  user_agent: string | null;
  signer_latitude?: number | null;
  signer_longitude?: number | null;
  signer_geo_city?: string | null;
  provider_latitude?: number | null;
  provider_longitude?: number | null;
  provider_geo_city?: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string;
  signature_hash: string | null;
  provider_signer_name: string | null;
  provider_signer_email: string | null;
  provider_signer_document: string | null;
  provider_signer_role: string | null;
  provider_signed_at: string | null;
  provider_signature_hash: string | null;
  provider_ip_address: string | null;
  provider_user_agent: string | null;
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
  provider_signer_phone?: string | null;
  provider_browser?: string | null;
  provider_os?: string | null;
  provider_device?: string | null;
  provider_ip_city?: string | null;
  provider_ip_region?: string | null;
  provider_ip_country?: string | null;
  provider_signed_at_iso?: string | null;
  provider_signature_event_id?: string | null;
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

export type PendingSignatureAlert = {
  companyId: string;
  companyName: string;
  contractId: string;
  contractNumber: string;
  signatureId: string;
  daysPending: number;
  signatureStatus: SignatureStatus;
};

function tokenSalt(): string {
  return (
    process.env.CONTRACT_SIGNATURE_TOKEN_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16) ||
    'sv-lotes-contract-sign'
  );
}

export function generateSignatureToken(): string {
  const uuid = randomUUID();
  const hash = createHash('sha256')
    .update(`${uuid}:${tokenSalt()}`)
    .digest('hex');
  return `${uuid.replace(/-/g, '')}${hash.slice(0, 32)}`;
}

export function signatureExpiresAt(from = new Date()): string {
  const exp = new Date(from);
  exp.setUTCDate(exp.getUTCDate() + SIGNATURE_EXPIRY_DAYS);
  return exp.toISOString();
}

export function isSignatureExpired(
  expiresAt?: string | null,
  now = new Date(),
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now.getTime();
}

export function daysPendingSince(iso?: string | null, today = new Date()): number {
  if (!iso) return 0;
  const start = new Date(iso);
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function sanitizeContractFileName(contractNumber: string): string {
  return contractNumber.replace(/[^\w-]+/g, '_');
}

import {
  buildSignedPdfStoragePath,
  hasSaasSignedDocumentAccess,
  resolveSaasSignedContractRecord,
} from '@/lib/saasContractSignedAccess';

export {
  buildSignedPdfStoragePath,
  hasSaasSignedDocumentAccess,
  resolveSaasSignedContractRecord,
};

export async function getLatestFullySignedSignature(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractId: string,
): Promise<CompanyContractSignatureRow | null> {
  const { data } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('company_id', companyId)
    .eq('contract_id', contractId)
    .eq('signature_status', 'SIGNED')
    .order('provider_signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CompanyContractSignatureRow) || null;
}

function resolveProviderSignatureToken(
  signatureRow: CompanyContractSignatureRow,
): string | null {
  return signatureRow.provider_signature_token || signatureRow.signature_token || null;
}

function buildContractorAddressBlock(company: Record<string, unknown>): string {
  const formatted = formatSaasContractAddress(extractAddressPartsFromCompany(company));
  return formatted.multiline.replace(/\n/g, ', ');
}

export async function buildFullySignedSaasContractPdfBytes(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractRow: CompanyContractRow,
  signatureRow: CompanyContractSignatureRow,
): Promise<Uint8Array> {
  if (!isFullySignedContract(signatureRow.signature_status)) {
    throw new SaasContractStepError(
      'validation',
      'Contrato sem assinatura bilateral completa.',
    );
  }
  if (!signatureRow.signed_at || !signatureRow.signer_name) {
    throw new SaasContractStepError('validation', 'Assinatura do cliente incompleta.');
  }
  if (
    !signatureRow.provider_signed_at ||
    !signatureRow.provider_signer_name ||
    !signatureRow.provider_signer_document
  ) {
    throw new SaasContractStepError('validation', 'Assinatura da SV incompleta.');
  }

  const { company, subscription } = await loadFreshSaasContractContext(
    supabaseAdmin,
    companyId,
  );
  const pdfDates = subscriptionDatesForContractPdf(subscription);
  const clientSignedAt = signatureRow.signed_at;
  const providerSignedAt = signatureRow.provider_signed_at;
  const providerName = signatureRow.provider_signer_name;
  const providerDocument = signatureRow.provider_signer_document;
  const providerEmail = signatureRow.provider_signer_email || '';

  const clientHashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
    signerName: signatureRow.signer_name,
    signerDocument: signatureRow.signer_document || '',
    signerEmail: signatureRow.signer_email,
    signedAt: clientSignedAt,
    ipAddress: signatureRow.ip_address || '',
    party: 'CLIENT',
  });
  const clientHash =
    signatureRow.signature_hash || (await computeSignatureHash(clientHashPayload));

  const providerHashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
    signerName: providerName,
    signerDocument: providerDocument,
    signerEmail: providerEmail,
    signedAt: providerSignedAt,
    ipAddress: signatureRow.provider_ip_address || '',
    party: 'PROVIDER',
  });
  const providerHash =
    signatureRow.provider_signature_hash ||
    (await computeSignatureHash(providerHashPayload));

  const contentVersion = resolveStoredSaasContractContentVersion(contractRow);
  const contractorAddress = buildContractorAddressBlock(company as Record<string, unknown>);
  const providerAddress = formatSaasContractAddress({
    street: SAAS_PROVIDER.address,
    neighborhood: SAAS_PROVIDER.neighborhood,
    city: SAAS_PROVIDER.city,
    state: SAAS_PROVIDER.state,
    cep: SAAS_PROVIDER.cep,
  }).multiline.replace(/\n/g, ', ');

  const clientEvidence = readClientEvidenceFromRow(
    signatureRow as unknown as Record<string, unknown>,
  );
  const providerEvidence = readProviderEvidenceFromRow(
    signatureRow as unknown as Record<string, unknown>,
  );

  const bilateralCertificate: BilateralSignatureCertificateData = {
    contractNumber: contractRow.contract_number,
    contentVersion,
    client: {
      contractNumber: contractRow.contract_number,
      signerName: signatureRow.signer_name,
      signerDocument: signatureRow.signer_document || '',
      signerEmail: signatureRow.signer_email,
      signerRole: signatureRow.signer_role,
      signerAddress: contractorAddress,
      ipAddress: signatureRow.ip_address || '—',
      signedDate: formatSignatureDateBr(clientSignedAt),
      signedTime: formatSignatureTimeBr(clientSignedAt),
      signatureHash: clientHash,
      signatureToken: signatureRow.signature_token,
      signatureId: signatureRow.signature_event_id || signatureRow.id,
      contentVersion,
      partyLabel: 'CONTRATANTE',
      geoCity: signatureRow.signer_geo_city,
      latitude: signatureRow.signer_latitude,
      longitude: signatureRow.signer_longitude,
      browser: clientEvidence.browser,
      os: clientEvidence.os,
      device: clientEvidence.device,
      phone: clientEvidence.phone,
      approxLocation: clientEvidence.location,
    },
    provider: {
      contractNumber: contractRow.contract_number,
      signerName: providerName,
      signerDocument: providerDocument,
      signerEmail: providerEmail,
      signerRole: signatureRow.provider_signer_role,
      signerAddress: providerAddress,
      ipAddress: signatureRow.provider_ip_address || '—',
      signedDate: formatSignatureDateBr(providerSignedAt),
      signedTime: formatSignatureTimeBr(providerSignedAt),
      signatureHash: providerHash,
      signatureToken: resolveProviderSignatureToken(signatureRow),
      signatureId:
        signatureRow.provider_signature_event_id || signatureRow.id,
      contentVersion,
      partyLabel: 'CONTRATADA',
      geoCity: signatureRow.provider_geo_city,
      latitude: signatureRow.provider_latitude,
      longitude: signatureRow.provider_longitude,
      browser: providerEvidence.browser,
      os: providerEvidence.os,
      device: providerEvidence.device,
      phone: providerEvidence.phone,
      approxLocation: providerEvidence.location,
    },
  };
  const built = buildSaasContractPdfWithMeta(
    {
      company,
      subscription: {
        contract_number: contractRow.contract_number,
        plan_type: subscription.plan_type,
        monthly_price: subscription.monthly_price,
        start_date: pdfDates.start_date,
        first_payment_date: pdfDates.first_payment_date,
        next_due_date: pdfDates.next_due_date,
      },
    },
    {
      contentVersion,
      bilateralCertificate,
      executedSignatures: {
        client: {
          name: signatureRow.signer_name,
          document: signatureRow.signer_document || '',
          role: signatureRow.signer_role,
          signedDate: formatSignatureDateBr(clientSignedAt),
        },
        provider: {
          name: providerName,
          document: providerDocument,
          role: signatureRow.provider_signer_role,
          signedDate: formatSignatureDateBr(providerSignedAt),
        },
      },
    },
  );

  const validation = validateSaasContractPdfInput(
    {
      company,
      subscription: {
        contract_number: contractRow.contract_number,
        plan_type: subscription.plan_type,
        monthly_price: subscription.monthly_price,
        start_date: pdfDates.start_date,
        first_payment_date: pdfDates.first_payment_date,
        next_due_date: pdfDates.next_due_date,
      },
    },
    built.pdf,
    contentVersion,
  );

  if (!validation.ok) {
    throw new SaasContractStepError(
      'pdf_generation',
      `PDF assinado inválido: ${validation.errors.join('; ')}`,
    );
  }

  return built.pdf;
}

export async function persistSignedSaasContractPdfUrl(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractRow: CompanyContractRow,
  pdfBytes: Uint8Array,
): Promise<string> {
  const pdfSignedUrl = await uploadSignedContractPdf(
    supabaseAdmin,
    companyId,
    contractRow.contract_number,
    pdfBytes,
    contractRow.version,
  );

  await supabaseAdmin
    .from('company_contracts')
    .update({ pdf_signed_url: pdfSignedUrl, updated_at: new Date().toISOString() })
    .eq('id', contractRow.id);

  return pdfSignedUrl;
}

async function uploadSignedContractPdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractNumber: string,
  pdfBytes: Uint8Array,
  version?: number,
): Promise<string> {
  const storagePath = buildSignedPdfStoragePath(companyId, contractNumber, version);
  const fileBody = Buffer.from(pdfBytes);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SAAS_CONTRACT_BUCKET)
    .upload(storagePath, fileBody, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new SaasContractStepError(
      'storage_upload',
      `Falha ao enviar PDF assinado: ${uploadError.message}`,
    );
  }

  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from(SAAS_CONTRACT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signError) {
    console.warn('[SAAS_CONTRACT_SIGN] signed url', signError.message);
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(SAAS_CONTRACT_BUCKET)
    .getPublicUrl(storagePath);

  const url = signedData?.signedUrl || publicData?.publicUrl || '';
  if (!url) {
    throw new SaasContractStepError(
      'storage_upload',
      'Upload do PDF assinado concluído, mas URL indisponível.',
    );
  }

  return url;
}

export async function getActiveContractForCompany(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<CompanyContractRow | null> {
  const { data, error } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('company_id', companyId)
    .order('version', { ascending: false });

  if (error || !data?.length) return null;
  const rows = data as CompanyContractRow[];
  return rows.find((c) => isCurrentSaasContractVersion(c.status)) ?? rows[0] ?? null;
}

export async function listContractSignatures(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractId?: string,
): Promise<CompanyContractSignatureRow[]> {
  let query = supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (contractId) query = query.eq('contract_id', contractId);

  const { data, error } = await query;
  if (error) {
    console.warn('[SAAS_CONTRACT_SIGN] list', error.message);
    return [];
  }
  return (data || []) as CompanyContractSignatureRow[];
}

export async function getSignatureByToken(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<CompanyContractSignatureRow | null> {
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;

  const { data: byClient, error: clientErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('signature_token', trimmed)
    .maybeSingle();

  if (clientErr) {
    console.warn('[SAAS_CONTRACT_SIGN] getByClientToken', clientErr.message);
  }
  if (byClient) return byClient as CompanyContractSignatureRow;

  const { data: byProvider, error: providerErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('provider_signature_token', trimmed)
    .maybeSingle();

  if (providerErr) {
    console.warn('[SAAS_CONTRACT_SIGN] getByProviderToken', providerErr.message);
  }
  return (byProvider as CompanyContractSignatureRow) || null;
}

export type PublicSignResolveFailureReason =
  | 'invalid_token'
  | 'contract_not_found'
  | 'company_not_found';

export type PublicSignResolveResult =
  | {
      ok: true;
      signature: CompanyContractSignatureRow;
      contract: CompanyContractRow & {
        pdf_signed_url?: string | null;
        content_version?: string | null;
      };
      company: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: PublicSignResolveFailureReason;
      detail: string;
      signature?: CompanyContractSignatureRow | null;
      contractId?: string | null;
      companyId?: string | null;
    };

/** Resolve token → assinatura → contrato → empresa para /sign/[token] (logs temporários de diagnóstico). */
export async function resolvePublicSignContext(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<PublicSignResolveResult> {
  const trimmed = String(token || '').trim();
  debugPublicSign({
    step: 'token_received',
    tokenPrefix: trimmed.slice(0, 12),
    tokenLength: trimmed.length,
  });

  const signature = await getSignatureByToken(supabaseAdmin, trimmed);
  if (!signature) {
    debugPublicSign({
      step: 'signature_lookup',
      found: false,
      table: 'company_contract_signatures',
      columns: ['signature_token', 'provider_signature_token'],
    });
    return {
      ok: false,
      reason: 'invalid_token',
      detail: 'Nenhum registro em company_contract_signatures para o token informado.',
    };
  }

  debugPublicSign({
    step: 'signature_lookup',
    found: true,
    signatureId: signature.id,
    contractId: signature.contract_id,
    companyId: signature.company_id,
    signatureStatus: signature.signature_status,
  });

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('company_contracts')
    .select(
      'id, company_id, contract_number, contract_url, pdf_signed_url, status, version, content_version, archived_at, superseded_by',
    )
    .eq('id', signature.contract_id)
    .maybeSingle();

  if (contractErr || !contract) {
    debugPublicSign({
      step: 'contract_lookup',
      found: false,
      table: 'company_contracts',
      contractId: signature.contract_id,
      error: contractErr?.message || 'no row',
    });
    return {
      ok: false,
      reason: 'contract_not_found',
      detail:
        contractErr?.message ||
        `contract_id ${signature.contract_id} não encontrado em company_contracts`,
      signature,
      contractId: signature.contract_id,
      companyId: signature.company_id,
    };
  }

  debugPublicSign({
    step: 'contract_lookup',
    found: true,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    version: contract.version,
    status: contract.status,
    contentVersion: contract.content_version,
    archivedAt: contract.archived_at,
    supersededBy: contract.superseded_by,
  });

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('id', signature.company_id)
    .maybeSingle();

  if (companyErr || !company) {
    debugPublicSign({
      step: 'company_lookup',
      found: false,
      table: 'companies',
      companyId: signature.company_id,
      error: companyErr?.message || 'no row',
    });
    return {
      ok: false,
      reason: 'company_not_found',
      detail:
        companyErr?.message ||
        `company_id ${signature.company_id} não encontrado em companies`,
      signature,
      contractId: signature.contract_id,
      companyId: signature.company_id,
    };
  }

  debugPublicSign({
    step: 'company_lookup',
    found: true,
    companyId: company.id,
    companyName: company.name,
  });

  return {
    ok: true,
    signature,
    contract: contract as CompanyContractRow & {
      pdf_signed_url?: string | null;
      content_version?: string | null;
    },
    company: company as Record<string, unknown>,
  };
}

export function buildSignatureHistory(
  signature: CompanyContractSignatureRow,
  contractPdfGeneratedAt?: string | null,
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
      event: 'Cliente visualizou',
      user: signature.signer_name || 'Signatário',
      ip: signature.ip_address,
      details: signature.signer_name || null,
    });
  }

  if (signature.signed_at) {
    events.push({
      at: signature.signed_at,
      event: 'Cliente assinou',
      user: signature.signer_name || 'Signatário',
      ip: signature.ip_address,
      details: signature.signer_document
        ? formatSignerDocumentLine(signature.signer_document)
        : signature.signer_name,
    });
  }

  if (signature.provider_signed_at) {
    events.push({
      at: signature.provider_signed_at,
      event: 'SV assinou',
      user: signature.provider_signer_name || 'SV LOTES',
      ip: signature.provider_ip_address,
      details: signature.provider_signer_document
        ? formatSignerDocumentLine(signature.provider_signer_document)
        : signature.provider_signer_name,
    });
  }

  if (isFullySignedContract(signature.signature_status)) {
    events.push({
      at: signature.provider_signed_at || signature.updated_at,
      event: 'PDF final gerado',
      user: 'Sistema',
      ip: null,
      details: 'Contrato bilateral assinado disponível para download',
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
      details: 'Solicitação de assinatura cancelada',
    });
  }

  void contractPdfGeneratedAt;

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export async function cancelOpenSignaturesForContract(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('company_contract_signatures')
    .update({
      signature_status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('contract_id', contractId)
    .in('signature_status', ['PENDING', 'VIEWED']);

  if (error) {
    console.warn('[SAAS_CONTRACT_SIGN] cancel open', error.message);
  }
}

export async function sendContractForSignature(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<{
  signature: CompanyContractSignatureRow;
  signUrl: string;
  contract: CompanyContractRow;
}> {
  const contract = await getActiveContractForCompany(supabaseAdmin, companyId);
  if (!contract?.contract_url) {
    throw new SaasContractStepError(
      'validation',
      'Gere o contrato PDF antes de enviar para assinatura.',
    );
  }

  const status = String(contract.status || '').toLowerCase();
  if (status === 'signed' || status === 'active' || status === 'client_signed') {
    throw new SaasContractStepError(
      'validation',
      status === 'client_signed'
        ? 'O cliente já assinou. Aguarde a assinatura da SV ou utilize o botão "Assinar pela SV".'
        : 'Este contrato já foi assinado.',
    );
  }

  await cancelOpenSignaturesForContract(supabaseAdmin, contract.id);

  const token = generateSignatureToken();
  const signUrl = buildSignUrl(token);
  const validationUrl = buildSignatureVerifyUrl(token);
  const now = new Date().toISOString();
  const expiresAt = signatureExpiresAt();

  const { data: signature, error } = await supabaseAdmin
    .from('company_contract_signatures')
    .insert({
      contract_id: contract.id,
      company_id: companyId,
      signature_status: 'PENDING',
      signature_token: token,
      signature_url: signUrl,
      validation_public_url: validationUrl,
      signed_document_type: 'CONTRATO_SAAS',
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !signature) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao registrar envio para assinatura: ${error?.message || 'sem retorno'}`,
    );
  }

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SAAS',
    signatureRecordId: String(signature.id),
    eventType: 'LINK_CREATED',
    eventDescription: 'Link de assinatura criado para contrato SaaS.',
    occurredAt: now,
  });

  const { error: contractErr } = await supabaseAdmin
    .from('company_contracts')
    .update({ status: 'sent', updated_at: now })
    .eq('id', contract.id);

  if (contractErr) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao atualizar status do contrato: ${contractErr.message}`,
    );
  }

  if (contract.subscription_id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({ contract_status: 'sent', updated_at: now })
      .eq('id', contract.subscription_id);
  } else {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({ contract_status: 'sent', updated_at: now })
      .eq('company_id', companyId);
  }

  return {
    signature: signature as CompanyContractSignatureRow,
    signUrl,
    contract: { ...contract, status: 'sent' },
  };
}

export async function markContractSignatureViewed(
  supabaseAdmin: SupabaseClient,
  signature: CompanyContractSignatureRow,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CompanyContractSignatureRow> {
  if (isFullySignedContract(signature.signature_status)) return signature;
  if (isPublicClientSignBlocked(signature.signature_status) && signature.signature_status !== 'VIEWED') {
    return signature;
  }
  if (signature.signature_status === 'CANCELLED') return signature;

  if (isSignatureExpired(signature.expires_at)) {
    const { data } = await supabaseAdmin
      .from('company_contract_signatures')
      .update({
        signature_status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', signature.id)
      .select('*')
      .single();
    return (data as CompanyContractSignatureRow) || signature;
  }

  if (signature.signature_status !== 'PENDING') return signature;

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('company_contract_signatures')
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

  await supabaseAdmin
    .from('company_contracts')
    .update({ status: 'viewed', updated_at: now })
    .eq('id', signature.contract_id)
    .in('status', ['sent', 'generated']);

  await supabaseAdmin
    .from('company_subscriptions')
    .update({ contract_status: 'viewed', updated_at: now })
    .eq('company_id', signature.company_id);

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signature.signature_token,
    signatureSource: 'SAAS',
    signatureRecordId: signature.id,
    eventType: 'DOCUMENT_VIEWED',
    personName: signature.signer_name,
    ipAddress: meta.ipAddress || undefined,
    userAgent: meta.userAgent || undefined,
    eventDescription: 'Cliente visualizou o contrato SaaS para assinatura.',
    occurredAt: now,
  });

  return data as CompanyContractSignatureRow;
}

export type SignContractInput = {
  signerName: string;
  signerDocument: string;
  signerEmail: string;
  signerRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geoCity?: string | null;
};

export async function signContractElectronically(
  supabaseAdmin: SupabaseClient,
  token: string,
  input: SignContractInput,
): Promise<{
  signature: CompanyContractSignatureRow;
  pdfSignedUrl: null;
}> {
  const signature = await getSignatureByToken(supabaseAdmin, token);
  if (!signature) {
    debugPublicSign({
      step: 'sign_post_invalid_token',
      tokenPrefix: String(token || '').slice(0, 12),
    });
    throw new SaasContractStepError('validation', 'Link de assinatura inválido.');
  }

  if (isPublicClientSignBlocked(signature.signature_status)) {
    const msg =
      signature.signature_status === 'CLIENT_SIGNED'
        ? 'O cliente já assinou este contrato. Aguarde a assinatura da SV.'
        : signature.signature_status === 'SIGNED'
          ? 'Este contrato já foi assinado. O link está bloqueado.'
          : signature.signature_status === 'CANCELLED'
            ? 'Esta solicitação de assinatura foi cancelada.'
            : 'O link de assinatura não está mais disponível.';
    throw new SaasContractStepError('validation', msg);
  }

  if (isSignatureExpired(signature.expires_at)) {
    await supabaseAdmin
      .from('company_contract_signatures')
      .update({
        signature_status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', signature.id);
    throw new SaasContractStepError('validation', 'O link de assinatura expirou.');
  }

  const signerName = String(input.signerName || '').trim();
  const signerDocument = onlyDigits(input.signerDocument);
  const signerEmail = String(input.signerEmail || '').trim().toLowerCase();

  if (!signerName || signerDocument.length < 11 || !signerEmail.includes('@')) {
    throw new SaasContractStepError(
      'validation',
      'Informe nome, CPF/CNPJ e e-mail válidos para assinar.',
    );
  }

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('id', signature.contract_id)
    .single();

  if (contractErr || !contract) {
    debugPublicSign({
      step: 'sign_post_contract_lookup',
      found: false,
      contractId: signature.contract_id,
      error: contractErr?.message || 'no row',
    });
    throw new SaasContractStepError('validation', 'Contrato não encontrado.');
  }

  const contractRow = contract as CompanyContractRow & { pdf_signed_url?: string | null };
  const contractStatus = String(contractRow.status).toLowerCase();
  if (contractRow.pdf_signed_url || contractStatus === 'signed' || contractStatus === 'client_signed') {
    throw new SaasContractStepError(
      'validation',
      'Este contrato já possui assinatura registrada.',
    );
  }

  const signedAt = new Date().toISOString();
  const hashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
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
    documentType: 'CONTRATO_SAAS',
    validationToken: token,
  });

  const { data: updatedSignature, error: signErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .update({
      signer_name: signerName,
      signer_email: signerEmail,
      signer_document: signerDocument,
      signer_role: input.signerRole || null,
      signature_status: 'CLIENT_SIGNED',
      signed_at: signedAt,
      signature_hash: signatureHash,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
      signer_latitude: input.latitude ?? null,
      signer_longitude: input.longitude ?? null,
      signer_geo_city: input.geoCity?.trim() || null,
      ...evidencePatch,
      updated_at: signedAt,
    })
    .eq('id', signature.id)
    .select('*')
    .single();

  if (signErr || !updatedSignature) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao registrar assinatura: ${signErr?.message || 'sem retorno'}`,
    );
  }

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: 'SAAS',
    signatureRecordId: signature.id,
    eventType: 'CLIENT_SIGNED',
    personName: signerName,
    personEmail: signerEmail,
    ipAddress: input.ipAddress || undefined,
    userAgent: input.userAgent || undefined,
    eventDescription: 'Assinatura eletrônica realizada pelo cliente contratante.',
    occurredAt: signedAt,
    metadata: { signature_event_id: evidencePatch.signature_event_id },
  });

  await supabaseAdmin
    .from('company_contracts')
    .update({
      status: 'client_signed',
      updated_at: signedAt,
    })
    .eq('id', contractRow.id);

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_status: 'client_signed',
      updated_at: signedAt,
    })
    .eq('company_id', signature.company_id);

  return {
    signature: updatedSignature as CompanyContractSignatureRow,
    pdfSignedUrl: null,
  };
}

export type ProviderSignContractInput = {
  providerName: string;
  providerDocument: string;
  providerEmail: string;
  providerRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geoCity?: string | null;
};

export async function signContractByProvider(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  signatureId: string,
  input: ProviderSignContractInput,
): Promise<{
  signature: CompanyContractSignatureRow;
  pdfSignedUrl: string;
}> {
  const { data: signature, error: sigErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('id', signatureId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (sigErr || !signature) {
    throw new SaasContractStepError('validation', 'Solicitação de assinatura não encontrada.');
  }

  const signatureRow = signature as CompanyContractSignatureRow;

  if (!canProviderSignContract(signatureRow.signature_status)) {
    throw new SaasContractStepError(
      'validation',
      signatureRow.signature_status === 'SIGNED'
        ? 'Este contrato já foi assinado pela SV.'
        : 'A SV só pode assinar após a assinatura do cliente.',
    );
  }

  if (!signatureRow.signed_at || !signatureRow.signer_name) {
    throw new SaasContractStepError(
      'validation',
      'Assinatura do cliente incompleta. Aguarde o cliente assinar primeiro.',
    );
  }

  const providerName = String(input.providerName || '').trim();
  const providerDocument = onlyDigits(input.providerDocument);
  const providerEmail = String(input.providerEmail || '').trim().toLowerCase();

  if (!providerName || providerDocument.length < 11 || !providerEmail.includes('@')) {
    throw new SaasContractStepError(
      'validation',
      'Informe nome, CPF/CNPJ e e-mail válidos do representante da SV.',
    );
  }

  const providerSignatureToken = generateSignatureToken();

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('id', signatureRow.contract_id)
    .single();

  if (contractErr || !contract) {
    throw new SaasContractStepError('validation', 'Contrato não encontrado.');
  }

  const contractRow = contract as CompanyContractRow & { pdf_signed_url?: string | null };
  if (contractRow.pdf_signed_url || String(contractRow.status).toLowerCase() === 'signed') {
    throw new SaasContractStepError('validation', 'Este contrato já possui PDF assinado final.');
  }

  const clientSignedAt = signatureRow.signed_at!;
  const providerSignedAt = new Date().toISOString();

  const clientHashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
    signerName: signatureRow.signer_name!,
    signerDocument: signatureRow.signer_document || '',
    signerEmail: signatureRow.signer_email,
    signedAt: clientSignedAt,
    ipAddress: signatureRow.ip_address || '',
    party: 'CLIENT',
  });
  const clientHash = signatureRow.signature_hash || (await computeSignatureHash(clientHashPayload));

  const providerHashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
    signerName: providerName,
    signerDocument: providerDocument,
    signerEmail: providerEmail,
    signedAt: providerSignedAt,
    ipAddress: input.ipAddress || '',
    party: 'PROVIDER',
  });
  const providerHash = await computeSignatureHash(providerHashPayload);

  const providerEvidencePatch = await enrichProviderEvidenceForSign({
    providerEmail,
    providerPhone: null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt: providerSignedAt,
  });

  const previewSignature: CompanyContractSignatureRow = {
    ...signatureRow,
    provider_signer_name: providerName,
    provider_signer_email: providerEmail,
    provider_signer_document: providerDocument,
    provider_signer_role: input.providerRole || null,
    provider_signed_at: providerSignedAt,
    provider_signature_hash: providerHash,
    provider_ip_address: input.ipAddress || null,
    provider_user_agent: input.userAgent || null,
    provider_signature_token: providerSignatureToken,
    provider_latitude: input.latitude ?? null,
    provider_longitude: input.longitude ?? null,
    provider_geo_city: input.geoCity?.trim() || null,
    ...providerEvidencePatch,
    signature_status: 'SIGNED',
    signature_hash: clientHash,
  } as CompanyContractSignatureRow;

  const pdfBytes = await buildFullySignedSaasContractPdfBytes(
    supabaseAdmin,
    companyId,
    contractRow,
    previewSignature,
  );

  const pdfSignedUrl = await uploadSignedContractPdf(
    supabaseAdmin,
    companyId,
    contractRow.contract_number,
    pdfBytes,
    contractRow.version,
  );

  const { data: updatedSignature, error: signErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .update({
      provider_signer_name: providerName,
      provider_signer_email: providerEmail,
      provider_signer_document: providerDocument,
      provider_signer_role: input.providerRole || null,
      provider_signed_at: providerSignedAt,
      provider_signature_hash: providerHash,
      provider_ip_address: input.ipAddress || null,
      provider_user_agent: input.userAgent || null,
      provider_signature_token: providerSignatureToken,
      provider_latitude: input.latitude ?? null,
      provider_longitude: input.longitude ?? null,
      provider_geo_city: input.geoCity?.trim() || null,
      ...providerEvidencePatch,
      signature_status: 'SIGNED',
      certificate_status: 'VALIDADO',
      updated_at: providerSignedAt,
    })
    .eq('id', signatureRow.id)
    .select('*')
    .single();

  if (signErr || !updatedSignature) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao registrar assinatura da SV: ${signErr?.message || 'sem retorno'}`,
    );
  }

  await supabaseAdmin
    .from('company_contracts')
    .update({
      status: 'signed',
      pdf_signed_url: pdfSignedUrl,
      updated_at: providerSignedAt,
    })
    .eq('id', contractRow.id);

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_status: 'signed',
      updated_at: providerSignedAt,
    })
    .eq('company_id', companyId);

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signatureRow.signature_token,
    signatureSource: 'SAAS',
    signatureRecordId: signatureRow.id,
    eventType: 'PROVIDER_SIGNED',
    personName: providerName,
    personEmail: providerEmail,
    ipAddress: input.ipAddress || undefined,
    userAgent: input.userAgent || undefined,
    eventDescription: 'Assinatura eletrônica realizada pela SV (contratada).',
    occurredAt: providerSignedAt,
    metadata: { signature_event_id: providerEvidencePatch.provider_signature_event_id },
  });

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: signatureRow.signature_token,
    signatureSource: 'SAAS',
    signatureRecordId: signatureRow.id,
    eventType: 'CERTIFICATE_ISSUED',
    personName: providerName,
    eventDescription: 'Certificado digital bilateral emitido e anexado ao PDF assinado.',
    occurredAt: providerSignedAt,
  });

  return {
    signature: updatedSignature as CompanyContractSignatureRow,
    pdfSignedUrl,
  };
}

export async function listPendingSignatureAlerts(
  supabaseAdmin: SupabaseClient,
  companies: Array<{ id?: string; name?: string | null }>,
  today = new Date(),
): Promise<PendingSignatureAlert[]> {
  const { data, error } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('id, contract_id, company_id, signature_status, created_at')
    .in('signature_status', ['PENDING', 'VIEWED'])
    .order('created_at', { ascending: true });

  if (error || !data?.length) return [];

  const contractIds = [...new Set(data.map((r) => r.contract_id))];
  const { data: contracts } = await supabaseAdmin
    .from('company_contracts')
    .select('id, contract_number')
    .in('id', contractIds);

  const contractMap = new Map(
    (contracts || []).map((c) => [c.id as string, c.contract_number as string]),
  );

  const companyMap = new Map(
    companies.map((c) => [String(c.id || ''), c.name || '—']),
  );

  return data.map((row) => ({
    companyId: row.company_id,
    companyName: companyMap.get(row.company_id) || '—',
    contractId: row.contract_id,
    contractNumber: contractMap.get(row.contract_id) || '—',
    signatureId: row.id,
    daysPending: daysPendingSince(row.created_at, today),
    signatureStatus: row.signature_status as SignatureStatus,
  }));
}

export function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || '';
  return request.headers.get('x-real-ip') || '';
}
