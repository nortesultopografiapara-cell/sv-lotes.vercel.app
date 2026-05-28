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

export function isTestCompany(company: {
  is_test_company?: boolean | null;
  is_test?: boolean | null;
}) {
  return company.is_test_company === true || company.is_test === true;
}

export function isRealSaasCompany(company: {
  is_test_company?: boolean | null;
  is_test?: boolean | null;
}) {
  return !isTestCompany(company);
}

function buildSubscriptionRow(
  company: CompanyPricingSource & { id: string },
  existing?: CompanySubscription | null,
) {
  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const startDate = existing?.start_date || new Date().toISOString().split('T')[0];
  const nextDueDate = existing?.next_due_date || addDaysFromToday(30);

  return {
    company_id: company.id,
    plan_type: saas.legacyDbPlan,
    monthly_price: pricing.appliedPrice,
    custom_price_enabled: isCustomPriceEnabled(company),
    custom_monthly_price: isCustomPriceEnabled(company)
      ? parseCustomMonthlyPrice(company.custom_monthly_price) ?? pricing.appliedPrice
      : null,
    billing_cycle: 'monthly',
    start_date: startDate,
    next_due_date: nextDueDate,
    payment_status: existing?.payment_status || 'pending',
    contract_status: existing?.contract_status || 'pending',
    contract_number: existing?.contract_number || null,
    contract_pdf_url: existing?.contract_pdf_url || null,
    updated_at: new Date().toISOString(),
  };
}

/** Cria ou atualiza assinatura sem gerar contrato PDF. */
export async function ensureSaasSubscription(
  supabaseAdmin: SupabaseClient,
  company: CompanyPricingSource & {
    id: string;
    name?: string | null;
    is_test_company?: boolean | null;
    is_test?: boolean | null;
  },
): Promise<{ subscription: CompanySubscription | null; error?: string; created?: boolean }> {
  if (isTestCompany(company)) {
    return { subscription: null };
  }

  const { data: existing } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', company.id)
    .maybeSingle();

  const row = buildSubscriptionRow(company, existing as CompanySubscription | null);

  let subscription: CompanySubscription | null = null;
  let created = false;

  if (existing) {
    const patch: Record<string, unknown> = { ...row };
    if (!existing.next_due_date) patch.next_due_date = addDaysFromToday(30);
    if (!existing.monthly_price || Number(existing.monthly_price) === 0) {
      patch.monthly_price = row.monthly_price;
    }

    const { data, error } = await supabaseAdmin
      .from('company_subscriptions')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) return { subscription: null, error: error.message };
    subscription = data as CompanySubscription;
  } else {
    const { data, error } = await supabaseAdmin
      .from('company_subscriptions')
      .insert({
        ...row,
        payment_status: 'pending',
        contract_status: 'pending',
      })
      .select('*')
      .single();

    if (error) return { subscription: null, error: error.message };
    subscription = data as CompanySubscription;
    created = true;
  }

  await supabaseAdmin
    .from('companies')
    .update({
      vencimento_plano: subscription.next_due_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', company.id);

  console.log('[SAAS_SUBSCRIPTION_ENSURED]', {
    companyId: company.id,
    subscriptionId: subscription.id,
    created,
    next_due_date: subscription.next_due_date,
    monthly_price: subscription.monthly_price,
  });

  return { subscription, created };
}

export async function syncMissingSaasSubscriptions(supabaseAdmin: SupabaseClient): Promise<{
  created: number;
  subscriptions: CompanySubscription[];
}> {
  const { data: companies, error: companiesErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });

  if (companiesErr) {
    throw new Error(companiesErr.message);
  }

  let created = 0;
  for (const company of companies || []) {
    if (!isRealSaasCompany(company)) continue;

    const { data: existing } = await supabaseAdmin
      .from('company_subscriptions')
      .select('id')
      .eq('company_id', company.id)
      .maybeSingle();

    if (existing?.id) {
      await ensureSaasSubscription(supabaseAdmin, company);
      continue;
    }

    const result = await ensureSaasSubscription(supabaseAdmin, company);
    if (result.created) created += 1;
  }

  const { data: allSubs, error: subsErr } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*');

  if (subsErr) {
    throw new Error(subsErr.message);
  }

  console.log('[SAAS_SUBSCRIPTIONS_SYNC]', { created, total: allSubs?.length ?? 0 });

  return {
    created,
    subscriptions: (allSubs || []) as CompanySubscription[],
  };
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
      contract_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  return { contractNumber, contractPdfUrl };
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
