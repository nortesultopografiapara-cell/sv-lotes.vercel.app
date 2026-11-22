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

/** OpenAPI 1.7.2 bank_slip_alter_request. Sem payer. Ao menos um campo na prática. */
export const C6_BOLETO_ALTER_ALLOWED_FIELDS = [
  'amount',
  'due_date',
  'discount',
  'interest',
  'fine',
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

/** Escopo OAuth exigido para GET /v1/bank_slips/{id} e GET .../pdf (B_05/B_06). */
export const C6_BOLETO_READ_SCOPE = 'bankslip.read' as const;

/**
 * Accept do GET PDF. O Sandbox C6 recusou application/json (HTTP 400) e
 * exigiu application/pdf. O 406 anterior ocorreu com Content-Type em GET sem body.
 */
export const C6_BOLETO_PDF_ACCEPT = 'application/pdf' as const;

function parseC6OAuthScopeList(raw: string | string[] | null | undefined): string[] {
  return Array.isArray(raw)
    ? raw.map((part) => String(part || '').trim()).filter(Boolean)
    : String(raw || '')
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function hasC6BankSlipWriteScope(raw: string | string[] | null | undefined): boolean {
  return parseC6OAuthScopeList(raw).some(
    (scope) => scope === C6_BOLETO_WRITE_SCOPE || scope.endsWith('.bankslip.write'),
  );
}

export function hasC6BankSlipReadScope(raw: string | string[] | null | undefined): boolean {
  return parseC6OAuthScopeList(raw).some(
    (scope) => scope === C6_BOLETO_READ_SCOPE || scope.endsWith('.bankslip.read'),
  );
}

export class C6BoletoScopeError extends Error {
  constructor(message = 'Escopo bankslip.write ausente. Emissão B_01 interrompida.') {
    super(message);
    this.name = 'C6BoletoScopeError';
  }
}

export function assertC6BankSlipWriteScope(raw: string | string[] | null | undefined): string[] {
  const scopes = parseC6OAuthScopeList(raw);
  if (!hasC6BankSlipWriteScope(scopes)) {
    throw new C6BoletoScopeError();
  }
  return scopes;
}

export function assertC6BankSlipReadScope(raw: string | string[] | null | undefined): string[] {
  const scopes = parseC6OAuthScopeList(raw);
  if (!hasC6BankSlipReadScope(scopes)) {
    throw new C6BoletoScopeError('Escopo bankslip.read ausente. Consulta B_05/B_06 interrompida.');
  }
  return scopes;
}

export const C6_BOLETO_OPERATIONS = {
  emit: { method: 'POST', path: '/v1/bank_slips/', successStatus: 201 },
  alter: { method: 'PUT', path: '/v1/bank_slips/{id}', successStatus: 200 },
  get: { method: 'GET', path: '/v1/bank_slips/{id}', successStatus: 200 },
  pdf: { method: 'GET', path: '/v1/bank_slips/{id}/pdf', successStatus: 200 },
  cancel: { method: 'PUT', path: '/v1/bank_slips/{id}/cancel', successStatus: 204 },
  webhook: { method: 'POST', path: '/v1/webhooks/', successStatus: 200 },
} as const;

export type C6BoletoOperation = keyof typeof C6_BOLETO_OPERATIONS;
