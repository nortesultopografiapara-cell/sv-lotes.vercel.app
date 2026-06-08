/**
 * Validação obrigatória do comprador antes de gerar/regenerar contrato, PDF ou assinatura.
 */

import {
  isEmptyCustomerField,
  mergeCustomerData,
  pickNonemptyCustomerField,
} from '@/lib/customerIdentity';

export type CustomerContractFieldRule = {
  keys: string[];
  label: string;
};

export const CUSTOMER_CONTRACT_REQUIRED_FIELDS: CustomerContractFieldRule[] = [
  { keys: ['name', 'full_name'], label: 'Nome Completo' },
  { keys: ['document', 'cpf_cnpj', 'cpf'], label: 'CPF' },
  { keys: ['rg', 'rg_number', 'document_rg'], label: 'RG' },
  { keys: ['civil_state', 'marital_status'], label: 'Estado Civil' },
  { keys: ['profession'], label: 'Profissão' },
  { keys: ['address', 'street'], label: 'Endereço' },
  { keys: ['city'], label: 'Cidade' },
  { keys: ['state_uf', 'state'], label: 'UF' },
];

export const CUSTOMER_CONTRACT_RECOMMENDED_FIELDS: CustomerContractFieldRule[] =
  [
    { keys: ['zip_code', 'cep'], label: 'CEP' },
    { keys: ['phone'], label: 'Telefone' },
    { keys: ['email'], label: 'E-mail' },
  ];

export type CustomerContractValidation = {
  valid: boolean;
  missingFields: string[];
  missingRequired: string[];
  missingRecommended: string[];
  customerId?: string;
};

function fieldValue(
  merged: Record<string, unknown>,
  rule: CustomerContractFieldRule,
): string {
  return pickNonemptyCustomerField(
    ...rule.keys.map((key) => merged[key]),
  );
}

export function validateCustomerForContract(
  customer: Record<string, unknown> | null | undefined,
): CustomerContractValidation {
  const merged = customer ? mergeCustomerData(customer) : {};
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  for (const rule of CUSTOMER_CONTRACT_REQUIRED_FIELDS) {
    if (!fieldValue(merged, rule)) missingRequired.push(rule.label);
  }
  for (const rule of CUSTOMER_CONTRACT_RECOMMENDED_FIELDS) {
    if (!fieldValue(merged, rule)) missingRecommended.push(rule.label);
  }

  return {
    valid: missingRequired.length === 0,
    missingFields: [...missingRequired, ...missingRecommended],
    missingRequired,
    missingRecommended,
    customerId:
      typeof merged.id === 'string' && merged.id.trim()
        ? merged.id
        : undefined,
  };
}

export function formatCustomerContractValidationMessage(
  validation: CustomerContractValidation,
): string {
  const pending = validation.missingRequired.length
    ? validation.missingRequired
    : validation.missingFields;
  const bullets = pending.map((f) => `• ${f}`).join('\n');
  return (
    'ATENÇÃO\n\n' +
    'Existem dados obrigatórios do comprador não preenchidos.\n\n' +
    'Campos pendentes:\n\n' +
    bullets +
    '\n\nComplete o cadastro do cliente antes de gerar ou regenerar o contrato.'
  );
}

export class CustomerContractValidationError extends Error {
  validation: CustomerContractValidation;

  constructor(validation: CustomerContractValidation) {
    super(formatCustomerContractValidationMessage(validation));
    this.name = 'CustomerContractValidationError';
    this.validation = validation;
  }
}

export function assertCustomerValidForContract(
  customer: Record<string, unknown> | null | undefined,
): CustomerContractValidation {
  const validation = validateCustomerForContract(customer);
  if (!validation.valid) {
    throw new CustomerContractValidationError(validation);
  }
  return validation;
}

export function customerEditUrl(customerId?: string | null): string {
  if (!customerId) return '/customers';
  return `/customers?edit=${encodeURIComponent(customerId)}`;
}

/** Comprador mesclado a partir de contrato/venda (customers + sales). */
export function customerFromContractRelations(
  contract: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const customers = (contract?.customers || {}) as Record<string, unknown>;
  const sales = (contract?.sales || {}) as Record<string, unknown>;
  const merged = mergeCustomerData(customers, sales);
  const customerId =
    (contract?.customer_id as string) ||
    (customers.id as string) ||
    (merged.id as string);
  if (customerId) merged.id = customerId;
  return merged;
}

export function validateCustomerForContractFromContract(
  contract: Record<string, unknown> | null | undefined,
): CustomerContractValidation {
  return validateCustomerForContract(customerFromContractRelations(contract));
}
