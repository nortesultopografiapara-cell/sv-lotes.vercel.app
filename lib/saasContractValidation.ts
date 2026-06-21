import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import {
  normalizeSubscriptionDates,
  subscriptionDatesForContractPdf,
  validateSubscriptionDateOrder,
} from '@/lib/companySubscriptionDates';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import type { CompanySubscription } from '@/lib/saasSubscription';
import {
  contractPartyDigits,
  resolveCompanyContractDocument,
} from '@/lib/saasContractParty';
import {
  extractAddressPartsFromCompany,
  formatSaasContractAddress,
  normalizeContractStreetLine,
} from '@/lib/saasContractAddress';

export type SaasContractCompanyInput = CompanyPricingSource & {
  id?: string;
  name?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  telefone?: string | null;
  address?: string | null;
  endereco?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  neighborhood?: string | null;
  quadra?: string | null;
  lote?: string | null;
  city?: string | null;
  cidade?: string | null;
  state?: string | null;
  uf?: string | null;
  state_uf?: string | null;
  cep?: string | null;
  plan?: string | null;
  plan_type?: string | null;
};

export type NormalizedCompanyContractData = {
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  email: string;
  phone: string;
};

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const s = String(value).trim();
    if (s.length > 0) return s;
  }
  return '';
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  return String(value).trim().length === 0;
}

/** Unifica aliases de cadastro (address/endereco, city/cidade, state/uf). */
export function normalizeCompanyContractData(
  company: SaasContractCompanyInput | Record<string, unknown>,
): NormalizedCompanyContractData {
  const c = company as Record<string, unknown>;
  const parts = extractAddressPartsFromCompany(c);
  const formatted = formatSaasContractAddress(parts);

  const legacyStreet =
    pickString(c.address, c.endereco) ||
    [pickString(c.logradouro), pickString(c.numero), pickString(c.complemento)]
      .filter(Boolean)
      .join(', ');

  const address =
    formatted.streetLine !== 'Não informado'
      ? formatted.streetLine
      : normalizeContractStreetLine(legacyStreet);

  return {
    address,
    neighborhood: formatted.neighborhood || pickString(c.bairro, c.neighborhood),
    city: pickString(c.city, c.cidade),
    state: pickString(c.state, c.uf, c.state_uf),
    email: pickString(c.email),
    phone: pickString(c.phone, c.telefone),
  };
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
  normalized: NormalizedCompanyContractData;
} {
  const missing: string[] = [];
  const missingLabels: string[] = [];
  const warnings: string[] = [];

  const normalized = normalizeCompanyContractData(company);
  console.log('SAAS_CONTRACT_NORMALIZED_COMPANY', normalized);

  const require = (key: string, label: string, value: unknown) => {
    if (isBlank(value)) {
      missing.push(key);
      missingLabels.push(label);
    }
  };

  require('id', 'ID da empresa', company.id);
  require('name', 'Nome da empresa', company.name);

  const contractDocument = resolveCompanyContractDocument(company);
  require('document', 'CPF/CNPJ', contractDocument);
  const docDigits = contractPartyDigits(contractDocument);
  if (contractDocument && docDigits.length !== 11 && docDigits.length !== 14) {
    missing.push('document_invalid');
    missingLabels.push('CPF/CNPJ inválido (11 ou 14 dígitos)');
  }

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

  let billing;
  try {
    billing =
      subscription?.start_date &&
      subscription?.first_payment_date &&
      subscription?.next_due_date
        ? subscriptionDatesForContractPdf(subscription)
        : normalizeSubscriptionDates(company, subscription);
  } catch {
    billing = normalizeSubscriptionDates(company, subscription);
  }
  const startDate = billing.start_date;
  const firstPayment = billing.first_payment_date;
  const nextDue = billing.next_due_date;

  require('subscription_start_date', 'Data de início da assinatura', startDate);
  require('first_payment_date', 'Primeira cobrança', firstPayment);
  require('next_due_date', 'Próximo vencimento', nextDue);

  const dateOrderError = validateSubscriptionDateOrder(billing);
  if (dateOrderError) {
    missing.push('first_payment_date');
    missingLabels.push('Primeira cobrança');
    return {
      ok: false,
      missing,
      missingLabels,
      warnings,
      normalized,
      error: dateOrderError,
    };
  }

  for (const { key, label, value } of [
    { key: 'email', label: 'E-mail', value: normalized.email },
    { key: 'phone', label: 'Telefone', value: normalized.phone },
    { key: 'address', label: 'Endereço', value: normalized.address },
    { key: 'city', label: 'Cidade', value: normalized.city },
    { key: 'state', label: 'Estado (UF)', value: normalized.state },
  ]) {
    if (isBlank(value)) {
      warnings.push(label);
      void key;
    }
  }

  console.log('SAAS_CONTRACT_MISSING_FIELDS', {
    missing,
    missingLabels,
    warnings,
  });

  if (missing.length > 0) {
    const bulletList = missingLabels.map((l) => `• ${l}`).join('\n');
    return {
      ok: false,
      missing,
      missingLabels,
      warnings,
      normalized,
      error: `Dados obrigatórios ausentes para gerar o contrato:\n${bulletList}`,
    };
  }

  return { ok: true, missing: [], missingLabels: [], warnings, normalized };
}

export function saasContractOptionalFieldsWarning(warnings: string[]): string | null {
  if (!warnings.length) return null;
  return (
    'Alguns dados complementares não foram preenchidos.\n' +
    'O contrato será gerado normalmente utilizando\n' +
    "'Não informado' onde necessário."
  );
}

export function saasContractHasOnlyOptionalWarnings(validation: {
  ok: boolean;
  warnings: string[];
}): boolean {
  return validation.ok && validation.warnings.length > 0;
}
