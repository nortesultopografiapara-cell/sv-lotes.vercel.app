/**
 * Serviço de contratos SaaS: PDF, storage, company_contracts, automação.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
import { validateSaasContractPdfInput } from '@/lib/saasContractPdfValidation';
import { SaasContractStepError } from '@/lib/saasContractErrors';
import {
  dueDayFromDate,
  subscriptionDatesForContractPdf,
} from '@/lib/companySubscriptionDates';
import {
  validateSaasContractGeneration,
  type SaasContractCompanyInput,
} from '@/lib/saasContractValidation';
import {
  generateNextCompanyContractNumber,
} from '@/lib/companyContractNumber';
import { type CompanySubscription } from '@/lib/saasSubscription';
import { SAAS_CONTRACT_CURRENT_VERSION_STATUSES, SAAS_CONTRACT_STATUS_AFTER_GENERATION } from '@/lib/saasContractStatus';
import {
  SAAS_CONTRACT_CONTENT_VERSION,
  SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
} from '@/lib/saasContractContent';

function isTestCompany(company: {
  is_test_company?: boolean | null;
  is_test?: boolean | null;
}) {
  return company.is_test_company === true || company.is_test === true;
}

async function getSubscriptionByCompanyId(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<CompanySubscription | null> {
  const { data } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  return (data as CompanySubscription) || null;
}

export type CompanyContractRow = {
  id: string;
  company_id: string;
  subscription_id: string | null;
  contract_url: string;
  pdf_signed_url?: string | null;
  contract_number: string;
  version: number;
  generated_at: string;
  status: string;
  superseded_by?: string | null;
  regenerated_from?: string | null;
  regenerated_at?: string | null;
  regenerated_by?: string | null;
  content_version?: number | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_kind?: string | null;
};

const SAAS_CONTRACT_BUCKET = 'company-assets';

function sanitizeContractFileName(contractNumber: string): string {
  return contractNumber.replace(/[^\w-]+/g, '_');
}

/** contracts/saas/{company_id}/{contract_number}[_vN].pdf */
function buildSaasContractStoragePath(
  companyId: string,
  contractNumber: string,
  version?: number,
): string {
  const safeName = sanitizeContractFileName(contractNumber);
  const suffix = version && version > 1 ? `_v${version}` : '';
  return `contracts/saas/${companyId}/${safeName}${suffix}.pdf`;
}

async function uploadContractPdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractNumber: string,
  pdfBytes: Uint8Array,
  version?: number,
): Promise<string> {
  const storagePath = buildSaasContractStoragePath(companyId, contractNumber, version);
  const fileBody = Buffer.from(pdfBytes);

  console.log('SAAS_CONTRACT_STORAGE_UPLOAD', {
    bucket: SAAS_CONTRACT_BUCKET,
    path: storagePath,
    bytes: fileBody.length,
  });

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
      `Falha ao enviar PDF ao Storage: ${uploadError.message}`,
    );
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(SAAS_CONTRACT_BUCKET)
    .getPublicUrl(storagePath);

  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from(SAAS_CONTRACT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signError) {
    console.warn('[SAAS_CONTRACT] signed url', signError.message);
  }

  const contractPdfUrl = signedData?.signedUrl || publicData?.publicUrl || '';
  if (!contractPdfUrl) {
    throw new SaasContractStepError(
      'storage_upload',
      'Upload concluído, mas não foi possível obter URL do PDF.',
    );
  }

  console.log('SAAS_CONTRACT_PDF_URL', contractPdfUrl);
  return contractPdfUrl;
}

async function getNextContractVersion(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('company_contracts')
    .select('version')
    .eq('company_id', companyId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[SAAS_CONTRACT] version lookup', error.message);
    return 1;
  }

  return (data?.version ?? 0) + 1;
}

/** Busca empresa + assinatura direto do Supabase (sem cache do cliente). */
export async function loadFreshSaasContractContext(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<{
  company: SaasContractCompanyInput & { id: string };
  subscription: CompanySubscription;
}> {
  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyErr || !company) {
    throw new SaasContractStepError('validation', 'Empresa não encontrada.');
  }

  const subscription = await getSubscriptionByCompanyId(supabaseAdmin, companyId);
  if (!subscription) {
    throw new SaasContractStepError('validation', 'Assinatura não encontrada.');
  }

  console.log('SAAS_CONTRACT_FRESH_DB_COMPANY', company);
  console.log('SAAS_CONTRACT_FRESH_DB_SUBSCRIPTION', subscription);

  return {
    company: company as SaasContractCompanyInput & { id: string },
    subscription,
  };
}

export async function supersedeCompanyContracts(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('company_contracts')
    .update({ status: 'superseded' })
    .eq('company_id', companyId)
    .neq('status', 'superseded');

  if (error) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao marcar contratos anteriores como superseded: ${error.message}`,
    );
  }

  console.log('SAAS_CONTRACT_SUPERSEDED', { companyId });
}

export async function listCompanyContracts(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  options?: { includeArchived?: boolean },
): Promise<CompanyContractRow[]> {
  let query = supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('company_id', companyId)
    .order('generated_at', { ascending: false });

  if (!options?.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[SAAS_CONTRACT] list contracts', error.message);
    return [];
  }
  return (data || []) as CompanyContractRow[];
}

/** Lista completa (inclui arquivados) — uso interno Master. */
export async function listAllCompanyContractsIncludingArchived(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<CompanyContractRow[]> {
  const { data, error } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('company_id', companyId)
    .order('generated_at', { ascending: false });

  if (error) {
    console.warn('[SAAS_CONTRACT] list all contracts', error.message);
    return [];
  }
  return (data || []) as CompanyContractRow[];
}

export async function getCompanyContractById(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractId: string,
): Promise<CompanyContractRow | null> {
  const { data, error } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('id', contractId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.warn('[SAAS_CONTRACT] get by id', error.message);
    return null;
  }
  return (data as CompanyContractRow) || null;
}

export type GenerateSaasContractOptions = {
  /** Regenerar com dados atuais; mantém histórico */
  forceRegenerate?: boolean;
  regeneratedByUserId?: string | null;
};

export async function generateAndStoreSaasContract(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  options?: GenerateSaasContractOptions,
): Promise<{
  contractNumber: string;
  contractPdfUrl: string;
  contractRecord: CompanyContractRow | null;
  subscription: CompanySubscription;
}> {
  const { company, subscription } = await loadFreshSaasContractContext(
    supabaseAdmin,
    companyId,
  );

  console.log('SAAS_CONTRACT_GENERATE_START', {
    companyId,
    forceRegenerate: options?.forceRegenerate,
  });

  const validation = validateSaasContractGeneration(company, subscription);
  if (!validation.ok) {
    throw new SaasContractStepError(
      'validation',
      validation.error || 'Dados insuficientes para gerar o contrato.',
    );
  }

  const pdfDates = subscriptionDatesForContractPdf(subscription);

  const forceRegenerate =
    options?.forceRegenerate === true || Boolean(subscription.contract_pdf_url);

  if (forceRegenerate) {
    console.log('CONTRACT_REGENERATE_CLICK', { companyId });
  }

  const { data: activeContract } = await supabaseAdmin
    .from('company_contracts')
    .select('id, version, contract_number, content_version')
    .eq('company_id', companyId)
    .is('archived_at', null)
    .in('status', SAAS_CONTRACT_CURRENT_VERSION_STATUSES)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousActiveId = activeContract?.id || null;
  if (forceRegenerate && previousActiveId) {
    console.log('CONTRACT_REGENERATE_OLD_VERSION', {
      id: previousActiveId,
      version: activeContract?.version,
    });
    const { cancelOpenSignaturesForContract } = await import(
      '@/lib/saasContractSignatureService'
    );
    await cancelOpenSignaturesForContract(supabaseAdmin, previousActiveId);
  }

  const contractNumber =
    subscription.contract_number ||
    activeContract?.contract_number ||
    (await generateNextCompanyContractNumber(supabaseAdmin));

  if (forceRegenerate) {
    await supersedeCompanyContracts(supabaseAdmin, companyId);
  }

  const version = await getNextContractVersion(supabaseAdmin, companyId);
  const generatedAt = new Date().toISOString();
  const contentVersion = !activeContract
    ? SAAS_CONTRACT_CONTENT_VERSION
    : (activeContract.content_version ?? SAAS_CONTRACT_LEGACY_CONTENT_VERSION);

  let pdfBytes: Uint8Array;
  let pdfMeta: { pageCount: number; clausesCount: number; contractNumber: string };
  try {
    const built = buildSaasContractPdfWithMeta(
      {
        company,
        subscription: {
          contract_number: contractNumber,
          plan_type: subscription.plan_type,
          monthly_price: subscription.monthly_price,
          start_date: pdfDates.start_date,
          first_payment_date: pdfDates.first_payment_date,
          next_due_date: pdfDates.next_due_date,
        },
      },
      { contentVersion },
    );
    pdfBytes = built.pdf;
    pdfMeta = {
      pageCount: built.pageCount,
      clausesCount: built.clausesCount,
      contractNumber: built.contractNumber,
    };
    const validation = validateSaasContractPdfInput(
      {
        company,
        subscription: {
          contract_number: contractNumber,
          plan_type: subscription.plan_type,
          monthly_price: subscription.monthly_price,
          start_date: pdfDates.start_date,
          first_payment_date: pdfDates.first_payment_date,
          next_due_date: pdfDates.next_due_date,
        },
      },
      pdfBytes,
      contentVersion,
    );
    console.log('SAAS_CONTRACT_PDF_VALIDATION', {
      company_id: companyId,
      contract_number: contractNumber,
      page_count: pdfMeta.pageCount,
      clauses_count: pdfMeta.clausesCount,
      bytes: pdfBytes.byteLength,
      validation_ok: validation.ok,
      errors: validation.errors,
    });
    if (!validation.ok) {
      throw new SaasContractStepError(
        'pdf_generation',
        `PDF do contrato inválido: ${validation.errors.join('; ')}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao montar PDF';
    throw new SaasContractStepError('pdf_generation', message);
  }

  if (!pdfBytes?.length) {
    throw new SaasContractStepError('pdf_generation', 'PDF gerado está vazio.');
  }

  let contractPdfUrl: string;
  try {
    contractPdfUrl = await uploadContractPdf(
      supabaseAdmin,
      company.id,
      contractNumber,
      pdfBytes,
      version,
    );
  } catch (err) {
    if (err instanceof SaasContractStepError) throw err;
    const message = err instanceof Error ? err.message : 'Erro no upload';
    throw new SaasContractStepError('storage_upload', message);
  }

  if (!forceRegenerate) {
    const { error: supersedeErr } = await supabaseAdmin
      .from('company_contracts')
      .update({ status: 'superseded' })
      .eq('company_id', company.id)
      .in('status', SAAS_CONTRACT_CURRENT_VERSION_STATUSES);

    if (supersedeErr) {
      console.warn('[SAAS_CONTRACT] supersede active', supersedeErr.message);
    }
  }

  const { data: contractRecord, error: insertErr } = await supabaseAdmin
    .from('company_contracts')
    .insert({
      company_id: company.id,
      subscription_id: subscription.id,
      contract_url: contractPdfUrl,
      contract_number: contractNumber,
      version,
      status: SAAS_CONTRACT_STATUS_AFTER_GENERATION,
      generated_at: generatedAt,
      regenerated_from: forceRegenerate ? previousActiveId : null,
      regenerated_at: forceRegenerate ? generatedAt : null,
      regenerated_by: forceRegenerate ? options?.regeneratedByUserId || null : null,
      content_version: contentVersion,
    })
    .select('*')
    .single();

  if (insertErr) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao salvar company_contracts: ${insertErr.message}. Execute a migration 20260601120000_company_contracts.sql`,
    );
  }

  if (forceRegenerate && previousActiveId && contractRecord?.id) {
    await supabaseAdmin
      .from('company_contracts')
      .update({ superseded_by: contractRecord.id })
      .eq('id', previousActiveId);
    console.log('CONTRACT_REGENERATE_NEW_VERSION', {
      id: contractRecord.id,
      version,
    });
    console.log('CONTRACT_REGENERATE_SUCCESS', {
      oldId: previousActiveId,
      newId: contractRecord.id,
    });
  }

  const { data: updatedSub, error: subUpdateErr } = await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_number: contractNumber,
      contract_pdf_url: contractPdfUrl,
      contract_status: SAAS_CONTRACT_STATUS_AFTER_GENERATION,
      updated_at: generatedAt,
    })
    .eq('id', subscription.id)
    .select('*')
    .single();

  if (subUpdateErr || !updatedSub) {
    throw new SaasContractStepError(
      'db_save',
      `Falha ao atualizar company_subscriptions: ${subUpdateErr?.message || 'sem retorno'}`,
    );
  }

  await supabaseAdmin
    .from('companies')
    .update({
      subscription_start_date: pdfDates.start_date,
      next_payment_date: pdfDates.next_due_date,
      vencimento_plano: pdfDates.next_due_date,
      subscription_due_day: dueDayFromDate(pdfDates.start_date),
      updated_at: generatedAt,
    })
    .eq('id', company.id);

  console.log('SAAS_CONTRACT_GENERATED_SUCCESS', {
    contractNumber,
    contractPdfUrl,
    version,
    forceRegenerate,
    pdfDates,
    company_id: companyId,
    page_count: pdfMeta.pageCount,
    clauses_count: pdfMeta.clausesCount,
  });

  return {
    contractNumber,
    contractPdfUrl,
    contractRecord: (contractRecord as CompanyContractRow) || null,
    subscription: updatedSub as CompanySubscription,
  };
}

/** Gera contrato se dados completos; não lança erro (automação). */
export async function tryAutoGenerateSaasContract(
  supabaseAdmin: SupabaseClient,
  company: SaasContractCompanyInput & { id: string },
): Promise<{ ok: boolean; error?: string }> {
  if (isTestCompany(company)) {
    return { ok: false, error: 'Empresa de teste' };
  }

  try {
    const existing = await getSubscriptionByCompanyId(supabaseAdmin, company.id);
    if (!existing) {
      const { ensureSaasSubscription } = await import('@/lib/saasSubscriptionService');
      const ensured = await ensureSaasSubscription(supabaseAdmin, company);
      if (!ensured.subscription) {
        return { ok: false, error: 'Assinatura não encontrada' };
      }
    }

    await generateAndStoreSaasContract(supabaseAdmin, company.id, {
      forceRegenerate: false,
    });
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao gerar contrato';
    console.warn('[SAAS_CONTRACT_AUTO_FAIL]', message);
    return { ok: false, error: message };
  }
}

export { getSubscriptionByCompanyId };
