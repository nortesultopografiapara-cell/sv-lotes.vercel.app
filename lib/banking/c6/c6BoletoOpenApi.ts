/**
 * Constantes extraídas do OpenAPI oficial C6 Boleto bancário 1.7.2.
 * Fonte: docs/c6/boleto-bancario.json (openapi 3.1.1).
 * Não inventar campos fora deste contrato.
 */

export const C6_BOLETO_OPENAPI_VERSION = '1.7.2' as const;
export const C6_BOLETO_OPENAPI_SPEC = '3.1.1' as const;
export const C6_BOLETO_OPENAPI_TITLE = 'Boleto bancário' as const;

/** Campo OpenAPI da carteira. 21 = Sandbox, 15 = Production. */
export const C6_BOLETO_BILLING_SCHEME = {
  SANDBOX: '21',
  PRODUCTION: '15',
} as const;

export const C6_BOLETO_CREATE_REQUIRED_FIELDS = [
  'external_reference_id',
  'amount',
  'due_date',
  'payer',
] as const;

export const C6_BOLETO_PAYER_REQUIRED_FIELDS = ['name', 'tax_id', 'address'] as const;

export const C6_BOLETO_ADDRESS_REQUIRED_FIELDS = [
  'city',
  'number',
  'state',
  'street',
  'zip_code',
] as const;

export const C6_BOLETO_STATUS = ['CREATED', 'PAID', 'CANCELLED'] as const;

/** OpenAPI 1.7.2: V = valor, P = percentual. Juros diários; multa uma vez. */
export const C6_BOLETO_CHARGE_TYPES = ['V', 'P'] as const;
export type C6BoletoChargeType = (typeof C6_BOLETO_CHARGE_TYPES)[number];

export const C6_BOLETO_BILLING_TYPE = ['3', '4'] as const;

export const C6_BOLETO_EXTERNAL_REFERENCE_PATTERN = /^[a-zA-Z0-9]{1,10}$/;
export const C6_BOLETO_OUR_NUMBER_PATTERN = /^\d{1,10}$/;
export const C6_BOLETO_ZIP_PATTERN = /^\d{8}$/;
export const C6_BOLETO_STATE_PATTERN = /^[A-Z]{2}$/;
export const C6_BOLETO_DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const C6_BOLETO_LIMITS = {
  externalReferenceIdMax: 10,
  payerNameMax: 40,
  taxIdMin: 11,
  taxIdMax: 14,
  streetMax: 33,
  streetAndNumberMax: 40,
  complementMax: 24,
  cityMax: 40,
  emailMax: 200,
  instructionsMax: 4,
  instructionLengthMax: 80,
  ourNumberMax: 10,
} as const;

export const C6_BOLETO_PARTNER_SOFTWARE_NAME = 'SV LOTES' as const;
export const C6_BOLETO_PARTNER_SOFTWARE_VERSION = '1.0.0' as const;

/** Escopo OAuth exigido para POST /v1/bank_slips/. Sem este token a emissão B_01 aborta. */
export const C6_BOLETO_WRITE_SCOPE = 'bankslip.write' as const;

export function hasC6BankSlipWriteScope(raw: string | string[] | null | undefined): boolean {
  const scopes = Array.isArray(raw)
    ? raw.map((part) => String(part || '').trim()).filter(Boolean)
    : String(raw || '')
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
  return scopes.some(
    (scope) => scope === C6_BOLETO_WRITE_SCOPE || scope.endsWith('.bankslip.write'),
  );
}

export class C6BoletoScopeError extends Error {
  constructor(message = 'Escopo bankslip.write ausente. Emissão B_01 interrompida.') {
    super(message);
    this.name = 'C6BoletoScopeError';
  }
}

export function assertC6BankSlipWriteScope(raw: string | string[] | null | undefined): string[] {
  const scopes = Array.isArray(raw)
    ? raw.map((part) => String(part || '').trim()).filter(Boolean)
    : String(raw || '')
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
  if (!hasC6BankSlipWriteScope(scopes)) {
    throw new C6BoletoScopeError();
  }
  return scopes;
}

export const C6_BOLETO_OPERATIONS = {
  emit: { method: 'POST', path: '/v1/bank_slips/', successStatus: 201 },
  alter: { method: 'PUT', path: '/v1/bank_slips/{id}', successStatus: 200 },
  get: { method: 'GET', path: '/v1/bank_slips/{id}', successStatus: 200 },
  pdf: { method: 'GET', path: '/v1/bank_slips/{id}/pdf', successStatus: 200 },
  cancel: { method: 'PUT', path: '/v1/bank_slips/{id}/cancel', successStatus: 204 },
} as const;

export type C6BoletoOperation = keyof typeof C6_BOLETO_OPERATIONS;
