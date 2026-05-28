/**
 * Provisionamento de assinatura SaaS + contrato (server-side, service role).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import {
  isCustomPriceEnabled,
  parseCustomMonthlyPrice,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { buildSaasContractPdf } from '@/lib/saasContractPdf';
import {
  addDaysFromToday,
  contractDownloadPath,
  generateSaasContractNumber,
  type CompanySubscription,
} from '@/lib/saasSubscription';

function isTestCompany(company: { is_test_company?: boolean | null; is_test?: boolean | null }) {
  return company.is_test_company === true || company.is_test === true;
}

export async function uploadSaasContractPdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  pdfBytes: Uint8Array,
): Promise<string | null> {
  const path = `saas-contracts/${companyId}/contrato.pdf`;
  const fileBody = Buffer.from(pdfBytes);

  const { error } = await supabaseAdmin.storage.from('company-assets').upload(path, fileBody, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    console.warn('[SAAS_CONTRACT] upload storage falhou, usando URL da API', error.message);
    return null;
  }

  const { data } = supabaseAdmin.storage.from('company-assets').getPublicUrl(path);
  return data.publicUrl;
}

export async function generateAndStoreSaasContract(
  supabaseAdmin: SupabaseClient,
  company: CompanyPricingSource & { id: string; name?: string | null },
  subscription: CompanySubscription,
): Promise<{ contractNumber: string; contractPdfUrl: string }> {
  const contractNumber = subscription.contract_number || generateSaasContractNumber();
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

  const publicUrl = await uploadSaasContractPdf(supabaseAdmin, company.id, pdfBytes);
  const contractPdfUrl = publicUrl || contractDownloadPath(company.id);

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      contract_number: contractNumber,
      contract_pdf_url: contractPdfUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  return { contractNumber, contractPdfUrl };
}

export async function provisionSaasSubscription(
  supabaseAdmin: SupabaseClient,
  company: CompanyPricingSource & {
    id: string;
    name?: string | null;
    cnpj?: string | null;
    is_test_company?: boolean | null;
    is_test?: boolean | null;
  },
  options?: { regenerateContract?: boolean },
): Promise<{ subscription: CompanySubscription | null; error?: string }> {
  if (isTestCompany(company)) {
    return { subscription: null };
  }

  const { data: existing } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', company.id)
    .maybeSingle();

  if (existing && !options?.regenerateContract) {
    if (!existing.contract_number || !existing.contract_pdf_url) {
      await generateAndStoreSaasContract(supabaseAdmin, company, existing as CompanySubscription);
    }
    return { subscription: existing as CompanySubscription };
  }

  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const planType = saas.legacyDbPlan;
  const startDate = new Date().toISOString().split('T')[0];
  const nextDueDate = addDaysFromToday(30);
  const contractNumber = generateSaasContractNumber();

  const row = {
    company_id: company.id,
    plan_type: planType,
    monthly_price: pricing.appliedPrice,
    custom_price_enabled: isCustomPriceEnabled(company),
    custom_monthly_price: isCustomPriceEnabled(company)
      ? parseCustomMonthlyPrice(company.custom_monthly_price) ?? pricing.appliedPrice
      : null,
    billing_cycle: 'monthly',
    start_date: startDate,
    next_due_date: nextDueDate,
    payment_status: 'pending',
    contract_status: 'active',
    contract_number: contractNumber,
    updated_at: new Date().toISOString(),
  };

  let subscription: CompanySubscription | null = null;

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('company_subscriptions')
      .update({ ...row, created_at: existing.created_at })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return { subscription: null, error: error.message };
    subscription = data as CompanySubscription;
  } else {
    const { data, error } = await supabaseAdmin
      .from('company_subscriptions')
      .insert(row)
      .select('*')
      .single();
    if (error) return { subscription: null, error: error.message };
    subscription = data as CompanySubscription;
  }

  await generateAndStoreSaasContract(supabaseAdmin, company, subscription);

  await supabaseAdmin
    .from('companies')
    .update({
      vencimento_plano: nextDueDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', company.id);

  const { data: refreshed } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('id', subscription.id)
    .single();

  console.log('[SAAS_SUBSCRIPTION_PROVISIONED]', {
    companyId: company.id,
    subscriptionId: subscription.id,
    next_due_date: nextDueDate,
    monthly_price: pricing.appliedPrice,
  });

  return { subscription: (refreshed || subscription) as CompanySubscription };
}

export async function getSubscriptionByCompanyId(
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
