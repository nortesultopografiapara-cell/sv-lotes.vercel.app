/**
 * Serviço de contratos SaaS: PDF, storage, company_contracts, automação.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { buildSaasContractPdf } from '@/lib/saasContractPdf';
import {
  validateSaasContractGeneration,
  type SaasContractCompanyInput,
} from '@/lib/saasContractValidation';
import {
  contractDownloadPath,
  generateSaasContractNumber,
  type CompanySubscription,
} from '@/lib/saasSubscription';
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
  contract_number: string;
  version: number;
  generated_at: string;
  status: string;
};

const STORAGE_BUCKETS = ['contracts', 'company-assets'] as const;

async function uploadContractPdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  contractNumber: string,
  version: number,
  pdfBytes: Uint8Array,
): Promise<string | null> {
  const relativePath = `saas/${companyId}/${contractNumber}-v${version}.pdf`;
  const fileBody = Buffer.from(pdfBytes);

  for (const bucket of STORAGE_BUCKETS) {
    const storagePath = bucket === 'contracts' ? relativePath : `contracts/${relativePath}`;
    const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, fileBody, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });
    if (!error) {
      const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
      return data.publicUrl;
    }
    console.warn(`[SAAS_CONTRACT] upload falhou bucket=${bucket}`, error.message);
  }

  return null;
}

async function getNextContractVersion(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data } = await supabaseAdmin
    .from('company_contracts')
    .select('version')
    .eq('company_id', companyId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.version ?? 0) + 1;
}

export async function listCompanyContracts(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<CompanyContractRow[]> {
  const { data, error } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('company_id', companyId)
    .order('generated_at', { ascending: false });

  if (error) {
    console.warn('[SAAS_CONTRACT] list contracts', error.message);
    return [];
  }
  return (data || []) as CompanyContractRow[];
}

export async function generateAndStoreSaasContract(
  supabaseAdmin: SupabaseClient,
  company: SaasContractCompanyInput & { id: string },
  subscription: CompanySubscription,
): Promise<{
  contractNumber: string;
  contractPdfUrl: string;
  contractRecord: CompanyContractRow | null;
}> {
  console.log('SAAS_CONTRACT_GENERATE_START');
  console.log('SAAS_CONTRACT_COMPANY_DATA', company);
  console.log('SAAS_CONTRACT_SUBSCRIPTION_DATA', subscription);

  const validation = validateSaasContractGeneration(company, subscription);
  if (!validation.ok) {
    throw new Error(validation.error || 'Dados insuficientes para gerar o contrato.');
  }

  const contractNumber = subscription.contract_number || generateSaasContractNumber();
  const version = await getNextContractVersion(supabaseAdmin, company.id);

  const pdfBytes = buildSaasContractPdf({
    company,
    subscription: {
      contract_number: contractNumber,
      plan_type: subscription.plan_type,
      monthly_price: subscription.monthly_price,
      start_date: subscription.start_date,
      next_due_date: subscription.next_due_date,
    },
  });

  const publicUrl = await uploadContractPdf(
    supabaseAdmin,
    company.id,
    contractNumber,
    version,
    pdfBytes,
  );
  const contractPdfUrl = publicUrl || contractDownloadPath(company.id);

  await supabaseAdmin
    .from('company_contracts')
    .update({ status: 'superseded' })
    .eq('company_id', company.id)
    .eq('status', 'active');

  const { data: contractRecord, error: insertErr } = await supabaseAdmin
    .from('company_contracts')
    .insert({
      company_id: company.id,
      subscription_id: subscription.id,
      contract_url: contractPdfUrl,
      contract_number: contractNumber,
      version,
      status: 'active',
      generated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (insertErr) {
    console.warn('[SAAS_CONTRACT] company_contracts insert', insertErr.message);
  }

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_number: contractNumber,
      contract_pdf_url: contractPdfUrl,
      contract_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  console.log('SAAS_CONTRACT_GENERATED_SUCCESS', {
    contractNumber,
    contractPdfUrl,
    version,
  });

  return {
    contractNumber,
    contractPdfUrl,
    contractRecord: (contractRecord as CompanyContractRow) || null,
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
    let subscription = await getSubscriptionByCompanyId(supabaseAdmin, company.id);
    if (!subscription) {
      const { ensureSaasSubscription } = await import('@/lib/saasSubscriptionService');
      const ensured = await ensureSaasSubscription(supabaseAdmin, company);
      subscription = ensured.subscription;
    }
    if (!subscription) {
      return { ok: false, error: 'Assinatura não encontrada' };
    }

    const validation = validateSaasContractGeneration(company, subscription);
    if (!validation.ok) {
      console.warn('[SAAS_CONTRACT_AUTO_SKIP]', validation.error);
      return { ok: false, error: validation.error };
    }

    await generateAndStoreSaasContract(supabaseAdmin, company, subscription);
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao gerar contrato';
    console.warn('[SAAS_CONTRACT_AUTO_FAIL]', message);
    return { ok: false, error: message };
  }
}
