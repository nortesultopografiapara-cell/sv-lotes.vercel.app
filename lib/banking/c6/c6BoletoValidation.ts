/**
 * Validações locais do boleto C6 (OpenAPI 1.7.2) — sem HTTP.
 */

import { onlyDigits } from '@/lib/inputMasks';
import {
  C6_BOLETO_ADDRESS_REQUIRED_FIELDS,
  C6_BOLETO_CHARGE_TYPES,
  C6_BOLETO_CREATE_REQUIRED_FIELDS,
  C6_BOLETO_DUE_DATE_PATTERN,
  C6_BOLETO_EXTERNAL_REFERENCE_PATTERN,
  C6_BOLETO_LIMITS,
  C6_BOLETO_OUR_NUMBER_PATTERN,
  C6_BOLETO_PAYER_REQUIRED_FIELDS,
  C6_BOLETO_STATE_PATTERN,
  C6_BOLETO_ZIP_PATTERN,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import { getC6BillingScheme } from '@/lib/banking/c6/c6BoletoEndpoints';
import type {
  C6BankSlipAlterRequest,
  C6BankSlipCreateRequest,
  C6BoletoCreateInput,
  C6BoletoDiscount,
  C6BoletoDiscountDetails,
} from '@/lib/banking/c6/c6BoletoTypes';

const BR_UFS = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);

const EMAIL_PATTERN =
  /^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export class C6BoletoValidationError extends Error {
  readonly fields: string[];

  constructor(message: string, fields: string[] = []) {
    super(message);
    this.name = 'C6BoletoValidationError';
    this.fields = fields;
  }
}

export class C6BoletoCompanyIsolationError extends Error {
  constructor(message = 'Credenciais C6 não pertencem à empresa informada.') {
    super(message);
    this.name = 'C6BoletoCompanyIsolationError';
  }
}

function todayYmdSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(digits[10]);
}

export function isValidCnpjDigits(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * w1[i];
  let rest = sum % 11;
  const d1 = rest < 2 ? 0 : 11 - rest;
  if (d1 !== Number(digits[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(digits[i]) * w2[i];
  rest = sum % 11;
  const d2 = rest < 2 ? 0 : 11 - rest;
  return d2 === Number(digits[13]);
}

export function normalizeC6TaxId(value: string | null | undefined): string {
  return onlyDigits(value);
}

export function assertC6CompanyIsolation(
  credentialCompanyId: string,
  requestCompanyId: string,
): void {
  const a = String(credentialCompanyId || '').trim();
  const b = String(requestCompanyId || '').trim();
  if (!a || !b) {
    throw new C6BoletoCompanyIsolationError('companyId C6 obrigatório para isolamento multiempresa.');
  }
  if (a !== b) {
    throw new C6BoletoCompanyIsolationError();
  }
}

function assertAmount(amount: unknown, field = 'amount'): number {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new C6BoletoValidationError('amount deve ser um número maior que zero.', [field]);
  }
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) {
    throw new C6BoletoValidationError('amount deve ter no máximo duas casas decimais.', [field]);
  }
  return cents / 100;
}

function assertDueDate(raw: unknown, now?: Date): string {
  const due = String(raw || '').trim();
  if (!C6_BOLETO_DUE_DATE_PATTERN.test(due)) {
    throw new C6BoletoValidationError('due_date deve estar no formato YYYY-MM-DD.', ['due_date']);
  }
  const parsed = new Date(`${due}T00:00:00-03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new C6BoletoValidationError('due_date inválida.', ['due_date']);
  }
  const today = todayYmdSaoPaulo(now);
  if (due < today) {
    throw new C6BoletoValidationError('due_date deve ser igual ou maior que a data atual.', ['due_date']);
  }
  return due;
}

function assertExternalReferenceId(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(value)) {
    throw new C6BoletoValidationError(
      'external_reference_id deve ter 1 a 10 caracteres alfanuméricos.',
      ['external_reference_id'],
    );
  }
  return value;
}

function assertAddressNumber(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw || '').trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new C6BoletoValidationError('address.number deve ser um inteiro maior ou igual a zero.', [
      'payer.address.number',
    ]);
  }
  return n;
}

function assertPayer(input: C6BoletoCreateInput['payer']): C6BankSlipCreateRequest['payer'] {
  if (!input || typeof input !== 'object') {
    throw new C6BoletoValidationError('payer é obrigatório.', ['payer']);
  }
  const name = String(input.name || '').trim();
  if (!name || name.length > C6_BOLETO_LIMITS.payerNameMax) {
    throw new C6BoletoValidationError(
      `payer.name é obrigatório e tem no máximo ${C6_BOLETO_LIMITS.payerNameMax} caracteres.`,
      ['payer.name'],
    );
  }

  const taxId = normalizeC6TaxId(input.tax_id);
  if (taxId.length === 11) {
    if (!isValidCpfDigits(taxId)) {
      throw new C6BoletoValidationError('payer.tax_id CPF inválido.', ['payer.tax_id']);
    }
  } else if (taxId.length === 14) {
    if (!isValidCnpjDigits(taxId)) {
      throw new C6BoletoValidationError('payer.tax_id CNPJ inválido.', ['payer.tax_id']);
    }
  } else {
    throw new C6BoletoValidationError('payer.tax_id deve ser CPF (11) ou CNPJ (14) sem máscara.', [
      'payer.tax_id',
    ]);
  }

  const addr = input.address;
  if (!addr || typeof addr !== 'object') {
    throw new C6BoletoValidationError('payer.address é obrigatório.', ['payer.address']);
  }
  const street = String(addr.street || '').trim();
  if (!street || street.length > C6_BOLETO_LIMITS.streetMax) {
    throw new C6BoletoValidationError(
      `address.street é obrigatório e tem no máximo ${C6_BOLETO_LIMITS.streetMax} caracteres.`,
      ['payer.address.street'],
    );
  }
  const number = assertAddressNumber(addr.number);
  if (street.length + String(number).length > C6_BOLETO_LIMITS.streetAndNumberMax) {
    throw new C6BoletoValidationError(
      'A soma de address.street e address.number não pode ultrapassar 40 caracteres.',
      ['payer.address.street', 'payer.address.number'],
    );
  }
  const city = String(addr.city || '').trim();
  if (!city || city.length > C6_BOLETO_LIMITS.cityMax) {
    throw new C6BoletoValidationError(
      `address.city é obrigatório e tem no máximo ${C6_BOLETO_LIMITS.cityMax} caracteres.`,
      ['payer.address.city'],
    );
  }
  const state = String(addr.state || '').trim().toUpperCase();
  if (!C6_BOLETO_STATE_PATTERN.test(state) || !BR_UFS.has(state)) {
    throw new C6BoletoValidationError('address.state deve ser uma UF brasileira com 2 letras.', [
      'payer.address.state',
    ]);
  }
  const zip = onlyDigits(addr.zip_code);
  if (!C6_BOLETO_ZIP_PATTERN.test(zip)) {
    throw new C6BoletoValidationError('address.zip_code deve ter 8 dígitos.', ['payer.address.zip_code']);
  }

  const payer: C6BankSlipCreateRequest['payer'] = {
    name,
    tax_id: taxId,
    address: {
      street,
      number,
      city,
      state,
      zip_code: zip,
    },
  };

  const complement = String(addr.complement || '').trim();
  if (complement) {
    if (complement.length > C6_BOLETO_LIMITS.complementMax) {
      throw new C6BoletoValidationError(
        `address.complement tem no máximo ${C6_BOLETO_LIMITS.complementMax} caracteres.`,
        ['payer.address.complement'],
      );
    }
    payer.address.complement = complement;
  }

  const emailRaw = String(input.email || '').trim().toLowerCase();
  if (emailRaw) {
    if (emailRaw.length > C6_BOLETO_LIMITS.emailMax || !EMAIL_PATTERN.test(emailRaw)) {
      throw new C6BoletoValidationError('payer.email inválido.', ['payer.email']);
    }
    payer.email = emailRaw;
  }

  return payer;
}

function assertOptionalChargeExtras(input: {
  instructions?: string[];
  discount?: C6BankSlipCreateRequest['discount'];
  interest?: C6BankSlipCreateRequest['interest'];
  fine?: C6BankSlipCreateRequest['fine'];
  our_number?: string;
}): Pick<
  C6BankSlipCreateRequest,
  'instructions' | 'discount' | 'interest' | 'fine' | 'our_number'
> {
  const extra: Pick<
    C6BankSlipCreateRequest,
    'instructions' | 'discount' | 'interest' | 'fine' | 'our_number'
  > = {};

  if (input.instructions != null) {
    if (!Array.isArray(input.instructions) || input.instructions.length > C6_BOLETO_LIMITS.instructionsMax) {
      throw new C6BoletoValidationError('instructions admite no máximo 4 textos.', ['instructions']);
    }
    const instructions = input.instructions.map((row) => String(row || '').trim());
    if (instructions.some((row) => !row || row.length > C6_BOLETO_LIMITS.instructionLengthMax)) {
      throw new C6BoletoValidationError('Cada instrução deve ter até 80 caracteres.', ['instructions']);
    }
    extra.instructions = instructions;
  }

  if (input.discount) extra.discount = assertC6Discount(input.discount);
  if (input.interest) extra.interest = assertC6ChargeAddon(input.interest, 'interest');
  if (input.fine) extra.fine = assertC6ChargeAddon(input.fine, 'fine');

  if (input.our_number != null && String(input.our_number).trim()) {
    const our = String(input.our_number).trim();
    if (!C6_BOLETO_OUR_NUMBER_PATTERN.test(our)) {
      throw new C6BoletoValidationError('our_number deve ter 1 a 10 dígitos.', ['our_number']);
    }
    extra.our_number = our;
  }

  return extra;
}

function assertC6ChargeAddon(
  input: { type?: string; value?: number; dead_line?: number },
  field: 'interest' | 'fine',
): { type: 'V' | 'P'; value: number; dead_line: number } {
  const type = String(input.type || '').trim().toUpperCase();
  if (!C6_BOLETO_CHARGE_TYPES.includes(type as (typeof C6_BOLETO_CHARGE_TYPES)[number])) {
    throw new C6BoletoValidationError(
      `${field}.type deve ser "V" (valor) ou "P" (percentual).`,
      [`${field}.type`],
    );
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new C6BoletoValidationError(`${field}.value deve ser maior que zero.`, [`${field}.value`]);
  }
  const deadLine = Number(input.dead_line);
  if (!Number.isInteger(deadLine) || deadLine < 0) {
    throw new C6BoletoValidationError(
      `${field}.dead_line deve ser inteiro ≥ 0 (dias após o vencimento).`,
      [`${field}.dead_line`],
    );
  }
  return { type: type as 'V' | 'P', value: Number(value.toFixed(2)), dead_line: deadLine };
}

function assertC6DiscountDetails(input: unknown, field: string): C6BoletoDiscountDetails {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const value = Number(row.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new C6BoletoValidationError(`${field}.value deve ser maior que zero.`, [`${field}.value`]);
  }
  const deadLine = Number(row.dead_line);
  if (!Number.isInteger(deadLine) || deadLine < 0) {
    throw new C6BoletoValidationError(
      `${field}.dead_line deve ser inteiro ≥ 0 (dias antes do vencimento).`,
      [`${field}.dead_line`],
    );
  }
  return { value: Number(value.toFixed(2)), dead_line: deadLine };
}

/** OpenAPI 1.7.2: discount_type V|P; first/second/third com value e dead_line decrescente. */
export function assertC6Discount(input: C6BoletoDiscount): C6BoletoDiscount {
  const type = String(input.discount_type || '').trim().toUpperCase();
  if (type !== 'V' && type !== 'P') {
    throw new C6BoletoValidationError(
      'discount.discount_type deve ser "V" (valor) ou "P" (percentual).',
      ['discount.discount_type'],
    );
  }
  if (!input.first) {
    throw new C6BoletoValidationError('discount.first é obrigatório quando há desconto.', ['discount.first']);
  }
  const first = assertC6DiscountDetails(input.first, 'discount.first');
  const out: C6BoletoDiscount = { discount_type: type as 'V' | 'P', first };
  if (input.second) {
    const second = assertC6DiscountDetails(input.second, 'discount.second');
    if (second.dead_line >= first.dead_line) {
      throw new C6BoletoValidationError(
        'discount.second.dead_line deve ser menor que discount.first.dead_line.',
        ['discount.second.dead_line'],
      );
    }
    out.second = second;
  }
  if (input.third) {
    if (!out.second) {
      throw new C6BoletoValidationError('discount.third exige discount.second.', ['discount.third']);
    }
    const third = assertC6DiscountDetails(input.third, 'discount.third');
    if (third.dead_line >= out.second.dead_line) {
      throw new C6BoletoValidationError(
        'discount.third.dead_line deve ser menor que discount.second.dead_line.',
        ['discount.third.dead_line'],
      );
    }
    out.third = third;
  }
  return out;
}

export function buildC6BankSlipCreateBody(
  input: C6BoletoCreateInput,
  now?: Date,
): C6BankSlipCreateRequest {
  const companyId = String(input.companyId || '').trim();
  if (!companyId) {
    throw new C6BoletoCompanyIsolationError('companyId C6 obrigatório para isolamento multiempresa.');
  }
  if (!input.environment) {
    throw new C6BoletoValidationError('environment C6 obrigatório.', ['environment']);
  }

  for (const field of C6_BOLETO_CREATE_REQUIRED_FIELDS) {
    if (input[field] == null || input[field] === '') {
      throw new C6BoletoValidationError(`Campo obrigatório ausente: ${field}.`, [field]);
    }
  }
  for (const field of C6_BOLETO_PAYER_REQUIRED_FIELDS) {
    if (!input.payer || input.payer[field as 'name'] == null || input.payer[field as 'name'] === '') {
      throw new C6BoletoValidationError(`Campo obrigatório ausente: payer.${field}.`, [`payer.${field}`]);
    }
  }
  for (const field of C6_BOLETO_ADDRESS_REQUIRED_FIELDS) {
    const addr = input.payer?.address as Record<string, unknown> | undefined;
    if (!addr || addr[field] == null || addr[field] === '') {
      throw new C6BoletoValidationError(`Campo obrigatório ausente: payer.address.${field}.`, [
        `payer.address.${field}`,
      ]);
    }
  }

  const expectedScheme = getC6BillingScheme(input.environment);
  const provided = input.billing_scheme != null ? String(input.billing_scheme).trim() : '';
  if (provided && provided !== expectedScheme) {
    throw new C6BoletoValidationError(
      `billing_scheme deve ser ${expectedScheme} neste ambiente.`,
      ['billing_scheme'],
    );
  }

  return {
    external_reference_id: assertExternalReferenceId(input.external_reference_id),
    amount: assertAmount(input.amount),
    due_date: assertDueDate(input.due_date, now),
    payer: assertPayer(input.payer),
    billing_scheme: expectedScheme,
    ...assertOptionalChargeExtras(input),
  };
}

export function buildC6BankSlipAlterBody(input: C6BankSlipAlterRequest, now?: Date): C6BankSlipAlterRequest {
  const body: C6BankSlipAlterRequest = {};
  if (input.amount != null) body.amount = assertAmount(input.amount);
  if (input.due_date != null) body.due_date = assertDueDate(input.due_date, now);
  if (input.discount) body.discount = assertC6Discount(input.discount);
  if (input.interest) body.interest = assertC6ChargeAddon(input.interest, 'interest');
  if (input.fine) body.fine = assertC6ChargeAddon(input.fine, 'fine');
  if (Object.keys(body).length < 1) {
    throw new C6BoletoValidationError('Alteração de boleto exige ao menos um campo.', []);
  }
  return body;
}

export function assertC6BankSlipId(id: string): string {
  const value = String(id || '').trim();
  if (!value) {
    throw new C6BoletoValidationError('id do boleto C6 é obrigatório.', ['id']);
  }
  if (value.length > 80) {
    throw new C6BoletoValidationError('id do boleto C6 inválido.', ['id']);
  }
  return value;
}
