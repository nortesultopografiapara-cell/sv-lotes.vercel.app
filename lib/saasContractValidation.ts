import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { resolveCompanySubscriptionDates } from '@/lib/companySubscriptionDates';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import type { CompanySubscription } from '@/lib/saasSubscription';

export type SaasContractCompanyInput = CompanyPricingSource & {
  id?: string;
  name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  plan?: string | null;
  plan_type?: string | null;
};

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  return String(value).trim().length === 0;
}

export function validateSaasContractGeneration(
  company: SaasContractCompanyInput,
  subscription?: CompanySubscription | null,
): { ok: boolean; error?: string; missing: string[]; missingLabels: string[] } {
  const missing: string[] = [];
  const missingLabels: string[] = [];

  const require = (key: string, label: string, value: unknown) => {
    if (isBlank(value)) {
      missing.push(key);
      missingLabels.push(label);
    }
  };

  require('name', 'Nome da empresa', company.name);
  require('cnpj', 'CNPJ', company.cnpj);
  require('email', 'E-mail', company.email);
  require('phone', 'Telefone', company.phone);
  require('address', 'Endereço', company.address);
  require('city', 'Cidade', company.city);
  require('state', 'Estado (UF)', company.state);

  const saas = getCompanySaasPlan(company);
  const planType = subscription?.plan_type || saas.legacyDbPlan || company.plan_type || company.plan;
  require('plan_type', 'Plano contratado', planType);

  const pricing = resolveCompanyPricing(company);
  const appliedPrice = Number(subscription?.monthly_price) || pricing.appliedPrice;
  if (!appliedPrice || appliedPrice <= 0) {
    missing.push('monthly_price');
    missingLabels.push('Valor mensal aplicado');
  }

  const dates = resolveCompanySubscriptionDates(company);
  const startDate = subscription?.start_date || dates.subscription_start_date;
  const nextDue = subscription?.next_due_date || dates.next_payment_date;

  require('subscription_start_date', 'Data de início da assinatura', startDate);
  require('next_payment_date', 'Próximo vencimento / cobrança', nextDue);

  if (missing.length > 0) {
    const bulletList = missingLabels.map((l) => `• ${l}`).join('\n');
    return {
      ok: false,
      missing,
      missingLabels,
      error: `Preencha os dados obrigatórios no cadastro da empresa antes de gerar o contrato:\n${bulletList}`,
    };
  }

  return { ok: true, missing: [], missingLabels: [] };
}
