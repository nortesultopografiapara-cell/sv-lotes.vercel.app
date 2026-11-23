/**
 * Constantes lidas de docs/c6/bankslip-v2-api.yaml (Bolepix 1.2.0).
 * A chamada real permanece desligada. CREATED não significa registro na rede.
 */

export const C6_BOLEPIX_V2_SPEC_VERSION = '1.2.0' as const;
export const C6_BOLEPIX_V2_SPEC_FILE = 'docs/c6/bankslip-v2-api.yaml' as const;

export const C6_BOLEPIX_V2_URL = {
  SANDBOX: 'https://baas-api-sandbox.c6bank.info/v2/bank_slips/',
  PRODUCTION: 'https://baas-api.c6bank.info/v2/bank_slips/',
} as const;

/** Schema billing_scheme: produção 15, sandbox 21. Carteira impressa 10 não entra aqui. */
export const C6_BOLEPIX_V2_BILLING_SCHEME = {
  SANDBOX: '21',
  PRODUCTION: '15',
} as const;

export const C6_BOLEPIX_V2_STATUSES = [
  'CREATED',
  'PAID',
  'CANCELED',
  'WAITING_CONFIRMATION',
] as const;

export const C6_BOLEPIX_V2_PAYMENT_TYPES = ['BANK_SLIP', 'PIX'] as const;
export const C6_BOLEPIX_V2_BILLING_TYPES = ['3', '4'] as const;
export const C6_BOLEPIX_V2_PIX_KEY_TYPE = 'EVP' as const;

export const C6_BOLEPIX_V2_REFERENCE_PATTERN = /^[A-Z0-9]{26}$/;

export const C6_BOLEPIX_V2_LIVE_CALLS_ENABLED = false as const;
export const C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED = false as const;

/**
 * Liberação por empresa e integração. A lista fica vazia:
 * nenhuma empresa recebe chamada real nesta fase.
 */
export const C6_BOLEPIX_V2_RELEASED_INTEGRATIONS: readonly {
  companyId: string;
  integrationId: string;
}[] = [];

export function isC6BolepixV2LiveRelease(companyId: string, integrationId: string): boolean {
  const company = String(companyId || '').trim();
  const integration = String(integrationId || '').trim();
  const listed = C6_BOLEPIX_V2_RELEASED_INTEGRATIONS.some(
    (item) => item.companyId === company && item.integrationId === integration,
  );
  return C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === true && listed;
}

export const C6_BOLEPIX_V2_STATUS_MEANING = {
  CREATED: 'Cobrança criada. O contrato não afirma registro na rede bancária.',
  PAID: 'Pagamento liquidado.',
  CANCELED: 'Cobrança cancelada.',
  WAITING_CONFIRMATION:
    'Pagamento confirmado, sem crédito na conta. Não gera baixa de caixa.',
} as const;
