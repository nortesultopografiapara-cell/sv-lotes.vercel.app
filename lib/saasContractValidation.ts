import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import { resolveCompanySubscriptionDates } from '@/lib/companySubscriptionDates';
import type { CompanySubscription } from '@/lib/saasSubscription';

export function validateSaasContractGeneration(
  company: CompanyPricingSource & { id?: string; name?: string | null },
  subscription?: CompanySubscription | null,
): { ok: boolean; error?: string; missing: string[] } {
  const missing: string[] = [];
  const dates = resolveCompanySubscriptionDates(company);

  if (!company?.id) missing.push('empresa');
  const saas = getCompanySaasPlan(company);
  if (!saas?.legacyDbPlan && !company.plan && !company.plan_type) missing.push('plano');

  const pricing = resolveCompanyPricing(company);
  if (!pricing.appliedPrice || pricing.appliedPrice <= 0) missing.push('valor mensal');

  const startDate = subscription?.start_date || dates.subscription_start_date;
  const nextDue = subscription?.next_due_date || dates.next_payment_date;

  if (!startDate) missing.push('data de início');
  if (!nextDue) missing.push('vencimento');

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error: `Contrato incompleto: falta ${missing.join(', ')}.`,
    };
  }

  return { ok: true, missing: [] };
}
