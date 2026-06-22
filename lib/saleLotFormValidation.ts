/**
 * Validação do formulário de venda/reserva no GIS (criação e edição).
 */

import { isEmptyCustomerField } from '@/lib/customerIdentity';
import { isValidSignerEmail } from '@/lib/saleContractEmailValidation';
import {
  formatCustomerContractValidationMessage,
  validateCustomerForContract,
  type CustomerContractValidation,
} from '@/lib/validateCustomerForContract';

export function validateOptionalCustomerEmail(
  email?: string | null,
): { valid: boolean; message?: string } {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return { valid: true };
  if (!isValidSignerEmail(trimmed)) {
    return {
      valid: false,
      message: 'Informe um e-mail válido ou deixe o campo em branco.',
    };
  }
  return { valid: true };
}

export function formatSaleFormCustomerValidationMessage(
  validation: CustomerContractValidation,
): string {
  if (validation.valid) return '';
  const pending = validation.missingRequired.length
    ? validation.missingRequired
    : validation.missingFields;
  const bullets = pending.map((field) => `• ${field}`).join('\n');
  return `Preencha os campos obrigatórios do cliente:\n\n${bullets}`;
}

export type SaleLotFormValidationInput = {
  name?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  payment_type?: string | null;
  final_value?: number;
  selected_customer_id?: string | null;
  civil_state?: string | null;
  marital_status?: string | null;
  [key: string]: unknown;
};

export function validateSaleLotFormBasics(
  form: SaleLotFormValidationInput,
): { valid: boolean; message?: string } {
  if (isEmptyCustomerField(form.name)) {
    return {
      valid: false,
      message: 'Preencha o campo obrigatório: Nome completo.',
    };
  }
  if (isEmptyCustomerField(form.cpf_cnpj)) {
    return {
      valid: false,
      message: 'Preencha o campo obrigatório: CPF/CNPJ.',
    };
  }
  return { valid: true };
}

export function validateSaleLotFormForContract(
  form: SaleLotFormValidationInput,
): CustomerContractValidation {
  return validateCustomerForContract({
    ...form,
    id: form.selected_customer_id || undefined,
    civil_state: form.civil_state,
    marital_status: form.civil_state ?? form.marital_status,
  });
}

export function validateSaleLotFormSubmission(params: {
  form: SaleLotFormValidationInput;
  finalValue: number;
}): {
  valid: boolean;
  message?: string;
  contractValidation?: CustomerContractValidation;
} {
  const emailCheck = validateOptionalCustomerEmail(params.form.email);
  if (!emailCheck.valid) {
    return { valid: false, message: emailCheck.message };
  }

  const basics = validateSaleLotFormBasics(params.form);
  if (!basics.valid) {
    return { valid: false, message: basics.message };
  }

  if ((params.finalValue ?? 0) <= 0) {
    return {
      valid: false,
      message: 'O valor da venda deve ser maior que zero.',
    };
  }

  const contractValidation = validateSaleLotFormForContract(params.form);
  if (!contractValidation.valid) {
    return {
      valid: false,
      message: formatSaleFormCustomerValidationMessage(contractValidation),
      contractValidation,
    };
  }

  return { valid: true };
}

export { formatCustomerContractValidationMessage };
