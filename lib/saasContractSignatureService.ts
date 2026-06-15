/**
 * Assinatura eletrônica de contratos SaaS — token, envio, visualização e registro.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
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
  type SignatureCertificateData,
} from '@/lib/saasContractSignaturePdf';
import { onlyDigits } from '@/lib/inputMasks';

const SAAS_CONTRACT_BUCKET = 'company-assets';
const SIGNATURE_EXPIRY_DAYS = 30;

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
  signature_url: string;
  ip_address: string | null;
  user_agent: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string;
  signature_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type SignatureHistoryEvent = {
  at: string;
  event: string;
  user: string;
  ip: string | null;
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

function buildSignedPdfStoragePath(
  companyId: string,
  contractNumber: string,
  version?: number,
): string {
  const safeName = sanitizeContractFileName(contractNumber);
  const suffix = version && version > 1 ? `_v${version}` : '';
  return `contracts/saas/${companyId}/${safeName}${suffix}_signed.pdf`;
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
  const { data, error } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('signature_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return data as CompanyContractSignatureRow;
}

export function buildSignatureHistory(
  signature: CompanyContractSignatureRow,
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
      event: 'Contrato visualizado',
      user: signature.signer_name || 'Signatário',
      ip: signature.ip_address,
    });
  }

  if (signature.signed_at) {
    events.push({
      at: signature.signed_at,
      event: 'Contrato assinado',
      user: signature.signer_name || 'Signatário',
      ip: signature.ip_address,
    });
  }

  if (signature.signature_status === 'EXPIRED') {
    events.push({
      at: signature.expires_at,
      event: 'Link expirado',
      user: 'Sistema',
      ip: null,
    });
  }

  if (signature.signature_status === 'CANCELLED') {
    events.push({
      at: signature.updated_at,
      event: 'Assinatura cancelada',
      user: 'Sistema',
      ip: null,
    });
  }

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
  if (status === 'signed' || status === 'active') {
    throw new SaasContractStepError(
      'validation',
      'Este contrato já foi assinado.',
    );
  }

  await cancelOpenSignaturesForContract(supabaseAdmin, contract.id);

  const token = generateSignatureToken();
  const signUrl = buildSignUrl(token);
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
  if (signature.signature_status === 'SIGNED') return signature;
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

  return data as CompanyContractSignatureRow;
}

export type SignContractInput = {
  signerName: string;
  signerDocument: string;
  signerEmail: string;
  signerRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function signContractElectronically(
  supabaseAdmin: SupabaseClient,
  token: string,
  input: SignContractInput,
): Promise<{
  signature: CompanyContractSignatureRow;
  pdfSignedUrl: string;
}> {
  const signature = await getSignatureByToken(supabaseAdmin, token);
  if (!signature) {
    throw new SaasContractStepError('validation', 'Link de assinatura inválido.');
  }

  if (signature.signature_status === 'SIGNED') {
    throw new SaasContractStepError(
      'validation',
      'Este contrato já foi assinado. O link está bloqueado.',
    );
  }

  if (signature.signature_status === 'CANCELLED') {
    throw new SaasContractStepError('validation', 'Esta solicitação de assinatura foi cancelada.');
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
      'Informe nome, CPF e e-mail válidos para assinar.',
    );
  }

  const { data: contract, error: contractErr } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('id', signature.contract_id)
    .single();

  if (contractErr || !contract) {
    throw new SaasContractStepError('validation', 'Contrato não encontrado.');
  }

  const contractRow = contract as CompanyContractRow & { pdf_signed_url?: string | null };
  if (contractRow.pdf_signed_url || String(contractRow.status).toLowerCase() === 'signed') {
    throw new SaasContractStepError(
      'validation',
      'Este contrato já possui assinatura registrada.',
    );
  }

  const { company, subscription } = await loadFreshSaasContractContext(
    supabaseAdmin,
    signature.company_id,
  );

  const pdfDates = subscriptionDatesForContractPdf(subscription);
  const signedAt = new Date().toISOString();
  const hashPayload = buildSignatureHashPayload({
    contractId: contractRow.id,
    contractNumber: contractRow.contract_number,
    signerName,
    signerDocument,
    signerEmail,
    signedAt,
    ipAddress: input.ipAddress || '',
  });
  const signatureHash = await computeSignatureHash(hashPayload);

  const certificate: SignatureCertificateData = {
    contractNumber: contractRow.contract_number,
    signerName,
    signerDocument,
    signerEmail,
    signerRole: input.signerRole || null,
    ipAddress: input.ipAddress || '—',
    signedDate: formatSignatureDateBr(signedAt),
    signedTime: formatSignatureTimeBr(signedAt),
    signatureHash,
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
    { certificate },
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
  );

  if (!validation.ok) {
    throw new SaasContractStepError(
      'pdf_generation',
      `PDF assinado inválido: ${validation.errors.join('; ')}`,
    );
  }

  const pdfSignedUrl = await uploadSignedContractPdf(
    supabaseAdmin,
    signature.company_id,
    contractRow.contract_number,
    built.pdf,
    contractRow.version,
  );

  const { data: updatedSignature, error: signErr } = await supabaseAdmin
    .from('company_contract_signatures')
    .update({
      signer_name: signerName,
      signer_email: signerEmail,
      signer_document: signerDocument,
      signer_role: input.signerRole || null,
      signature_status: 'SIGNED',
      signed_at: signedAt,
      signature_hash: signatureHash,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
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

  await supabaseAdmin
    .from('company_contracts')
    .update({
      status: 'signed',
      pdf_signed_url: pdfSignedUrl,
      updated_at: signedAt,
    })
    .eq('id', contractRow.id);

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_status: 'signed',
      updated_at: signedAt,
    })
    .eq('company_id', signature.company_id);

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
