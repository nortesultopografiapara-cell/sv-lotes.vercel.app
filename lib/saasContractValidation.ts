import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import {
  normalizeSubscriptionBillingDates,
  resolveCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
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
): {
  ok: boolean;
  error?: string;
  missing: string[];
  missingLabels: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const missingLabels: string[] = [];
  const warnings: string[] = [];

  const require = (key: string, label: string, value: unknown) => {
    if (isBlank(value)) {
      missing.push(key);
      missingLabels.push(label);
    }
  };

  require('id', 'ID da empresa', company.id);
  require('name', 'Nome da empresa', company.name);
  require('cnpj', 'CNPJ', company.cnpj);

  const saas = getCompanySaasPlan(company);
  const planType =
    subscription?.plan_type || saas.legacyDbPlan || company.plan_type || company.plan;
  require('plan_type', 'Plano contratado', planType);

  const pricing = resolveCompanyPricing(company);
  const appliedPrice = Number(subscription?.monthly_price) || pricing.appliedPrice;
  if (!appliedPrice || appliedPrice <= 0) {
    missing.push('monthly_price');
    missingLabels.push('Valor mensal aplicado');
  }

  const billing = normalizeSubscriptionBillingDates(company, subscription);
  const dates = resolveCompanySubscriptionDates(company);
  const startDate =
    subscription?.start_date ||
    subscription?.first_payment_date ||
    billing.start_date ||
    dates.subscription_start_date;
  const firstPayment =
    subscription?.first_payment_date || billing.first_payment_date || startDate;
  const nextDue =
    subscription?.next_due_date ||
    billing.next_due_date ||
    dates.next_payment_date;

  require(
    'subscription_start_date',
    'Data de início da assinatura',
    startDate || firstPayment,
  );
  require(
    'first_payment_date',
    'Primeira cobrança',
    firstPayment || startDate,
  );
  require(
    'next_due_date',
    'Próximo vencimento',
    nextDue || (startDate ? dates.next_payment_date : null),
  );

  for (const { key, label, value } of [
    { key: 'email', label: 'E-mail', value: company.email },
    { key: 'phone', label: 'Telefone', value: company.phone },
    { key: 'address', label: 'Endereço', value: company.address },
    { key: 'city', label: 'Cidade', value: company.city },
    { key: 'state', label: 'Estado (UF)', value: company.state },
  ]) {
    if (isBlank(value)) {
      warnings.push(label);
      void key;
    }
  }

  if (missing.length > 0) {
    const bulletList = missingLabels.map((l) => `• ${l}`).join('\n');
    return {
      ok: false,
      missing,
      missingLabels,
      warnings,
      error: `Dados obrigatórios ausentes para gerar o contrato:\n${bulletList}`,
    };
  }

  return { ok: true, missing: [], missingLabels: [], warnings };
}

export function saasContractOptionalFieldsWarning(warnings: string[]): string | null {
  if (!warnings.length) return null;
  return `Recomendamos completar no cadastro da empresa: ${warnings.join(', ')}. O contrato será gerado com "Não informado" onde faltar.`;
}
