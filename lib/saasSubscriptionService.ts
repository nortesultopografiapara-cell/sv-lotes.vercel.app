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
import {
  normalizeSubscriptionDates,
  resolveCompanySubscriptionDates,
  type CompanySubscriptionDatesSource,
} from '@/lib/companySubscriptionDates';
import { type CompanySubscription } from '@/lib/saasSubscription';

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
  company: CompanyPricingSource & CompanySubscriptionDatesSource & { id: string },
  existing?: CompanySubscription | null,
) {
  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const billing = normalizeSubscriptionDates(company, existing);

  return {
    company_id: company.id,
    plan_type: saas.legacyDbPlan,
    monthly_price: pricing.appliedPrice,
    custom_price_enabled: isCustomPriceEnabled(company),
    custom_monthly_price: isCustomPriceEnabled(company)
      ? parseCustomMonthlyPrice(company.custom_monthly_price) ?? pricing.appliedPrice
      : null,
    billing_cycle: 'monthly',
    start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    next_due_date: billing.next_due_date,
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
    const billing = normalizeSubscriptionDates(company, existing);

    patch.start_date = billing.start_date;
    patch.first_payment_date = billing.first_payment_date;
    patch.next_due_date = billing.next_due_date;
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

  const billing = normalizeSubscriptionDates(company, subscription);
  const syncedDates = resolveCompanySubscriptionDates({
    ...company,
    subscription_start_date: billing.start_date,
    next_payment_date: billing.next_due_date,
  });

  await supabaseAdmin
    .from('companies')
    .update({
      vencimento_plano: billing.next_due_date,
      subscription_start_date: billing.start_date,
      subscription_due_day: syncedDates.subscription_due_day,
      next_payment_date: billing.next_due_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', company.id);

  subscription = {
    ...subscription,
    start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    next_due_date: billing.next_due_date,
  };

  console.log('[SAAS_SUBSCRIPTION_ENSURED]', {
    companyId: company.id,
    subscriptionId: subscription.id,
    created,
    start_date: subscription.start_date,
    first_payment_date: subscription.first_payment_date,
    next_due_date: subscription.next_due_date,
    monthly_price: subscription.monthly_price,
  });

  if (created) {
    const { tryAutoGenerateSaasContract } = await import('@/lib/saasContractService');
    await tryAutoGenerateSaasContract(supabaseAdmin, company);
  }

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
