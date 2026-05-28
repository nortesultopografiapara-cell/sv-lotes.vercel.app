import { supabase } from '@/lib/supabase';
import {
  computeNextPaymentDate,
  dueDayFromDate,
} from '@/lib/companySubscriptionDates';
import type { CompanySubscription } from '@/lib/saasSubscription';

const COMPANY_SELECT = `
  id,
  name,
  cnpj,
  email,
  phone,
  address,
  city,
  state,
  cep,
  zip_code,
  plan,
  plan_type,
  status_operacional,
  custom_price_enabled,
  custom_monthly_price,
  custom_price_badge,
  subscription_start_date,
  subscription_due_day,
  next_payment_date,
  is_test_company,
  slug,
  created_at
`;

const SUBSCRIPTION_SELECT = `
  id,
  company_id,
  start_date,
  first_payment_date,
  next_due_date,
  payment_status,
  billing_cycle,
  monthly_price,
  plan_type,
  contract_status,
  contract_number,
  contract_pdf_url,
  custom_price_enabled,
  custom_monthly_price
`;

export type CompanyForEditMerged = {
  id: string;
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  status_operacional: string;
  plan: string;
  is_test_company: boolean;
  custom_price_enabled: boolean;
  custom_monthly_price: string;
  custom_price_badge: string;
  subscription_start_date: string;
  subscription_due_day: string;
  next_payment_date: string;
  slug?: string | null;
  saas_subscription: CompanySubscription | null;
};

function toDateOnly(value?: string | null): string {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

/** Prioridade de datas conforme regra de negócio (companies → subscription). */
export function mapCompanyForEditForm(
  company: Record<string, unknown>,
  subscription: CompanySubscription | null,
): CompanyForEditMerged {
  const subscription_start_date =
    toDateOnly(company.subscription_start_date as string) ||
    toDateOnly(subscription?.start_date) ||
    toDateOnly(subscription?.first_payment_date) ||
    '';

  const subscription_due_day = String(
    company.subscription_due_day ??
      (subscription?.next_due_date
        ? dueDayFromDate(subscription.next_due_date)
        : subscription_start_date
          ? dueDayFromDate(subscription_start_date)
          : 1),
  );

  const next_payment_date =
    toDateOnly(company.next_payment_date as string) ||
    toDateOnly(subscription?.next_due_date) ||
    (subscription_start_date
      ? computeNextPaymentDate(subscription_start_date)
      : '');

  return {
    id: String(company.id),
    name: String(company.name ?? ''),
    cnpj: String(company.cnpj ?? ''),
    phone: String(company.phone ?? ''),
    email: String(company.email ?? ''),
    address: String(company.address ?? ''),
    city: String(company.city ?? ''),
    state: String(company.state ?? ''),
    zip_code: String(company.zip_code ?? company.cep ?? ''),
    status_operacional: String(company.status_operacional ?? 'Ativa'),
    plan: String(company.plan_type || company.plan || 'basic'),
    is_test_company: company.is_test_company === true,
    custom_price_enabled: company.custom_price_enabled === true,
    custom_monthly_price:
      company.custom_monthly_price != null
        ? String(company.custom_monthly_price)
        : '',
    custom_price_badge: String(company.custom_price_badge ?? 'desconto_especial'),
    subscription_start_date,
    subscription_due_day,
    next_payment_date,
    slug: (company.slug as string) ?? null,
    saas_subscription: subscription,
  };
}

export async function loadCompanyForEdit(companyId: string): Promise<{
  company: Record<string, unknown> | null;
  subscription: CompanySubscription | null;
  merged: CompanyForEditMerged | null;
  error?: string;
}> {
  console.log('LOAD_COMPANY_FOR_EDIT', companyId);

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select(COMPANY_SELECT)
    .eq('id', companyId)
    .single();

  if (companyErr || !company) {
    const msg = companyErr?.message || 'Empresa não encontrada';
    console.log('LOAD_COMPANY_FOR_EDIT_RESULT', null, null, msg);
    return { company: null, subscription: null, merged: null, error: msg };
  }

  const { data: subscription, error: subErr } = await supabase
    .from('company_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('company_id', companyId)
    .maybeSingle();

  if (subErr) {
    console.warn('LOAD_COMPANY_FOR_EDIT_SUBSCRIPTION_WARN', subErr.message);
  }

  const merged = mapCompanyForEditForm(
    company as Record<string, unknown>,
    (subscription as CompanySubscription) || null,
  );

  console.log('LOAD_COMPANY_FOR_EDIT_RESULT', company, subscription);

  return {
    company: company as Record<string, unknown>,
    subscription: (subscription as CompanySubscription) || null,
    merged,
  };
}
