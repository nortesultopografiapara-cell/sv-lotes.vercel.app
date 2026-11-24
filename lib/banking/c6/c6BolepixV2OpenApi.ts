/**
 * Constantes lidas de docs/c6/bankslip-v2-api.yaml (Bolepix 1.2.0).
 * O POST real existe somente para a parcela nomeada abaixo.
 * CREATED não significa registro na rede nem pagamento.
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

/**
 * Constante compilada no código. Não é variável da Vercel.
 * Sozinha não emite: a parcela também precisa estar na lista abaixo.
 */
export const C6_BOLEPIX_V2_LIVE_CALLS_ENABLED = true as const;
export const C6_BOLEPIX_V2_CONFIG_WRITES_ENABLED = false as const;

/** Única empresa e integração da homologação. Não libera as parcelas dessa integração. */
export const C6_BOLEPIX_V2_RELEASED_INTEGRATIONS: readonly {
  companyId: string;
  integrationId: string;
}[] = [
  {
    companyId: 'f26f2331-1885-4ac6-8d0e-4131cc8a8014',
    integrationId: 'b5cc1de3-172b-4926-a528-36cebc14db51',
  },
];

/**
 * Entrada de R$ 10,00, vencimento 26/11/2026, contrato 000000013/2026.
 * Qualquer outro recibo, inclusive da mesma venda, fica de fora.
 */
export const C6_BOLEPIX_V2_RELEASED_RECEIPTS: readonly {
  companyId: string;
  integrationId: string;
  receiptId: string;
}[] = [
  {
    companyId: 'f26f2331-1885-4ac6-8d0e-4131cc8a8014',
    integrationId: 'b5cc1de3-172b-4926-a528-36cebc14db51',
    receiptId: '693281b1-4d61-4209-adcc-0b378968aed3',
  },
];

export function isC6BolepixV2LiveRelease(companyId: string, integrationId: string): boolean {
  const company = String(companyId || '').trim();
  const integration = String(integrationId || '').trim();
  const listed = C6_BOLEPIX_V2_RELEASED_INTEGRATIONS.some(
    (item) => item.companyId === company && item.integrationId === integration,
  );
  return C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === true && listed;
}

export function isC6BolepixV2CompanyReleased(companyId: string): boolean {
  const company = String(companyId || '').trim();
  return (
    C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === true &&
    C6_BOLEPIX_V2_RELEASED_INTEGRATIONS.some((item) => item.companyId === company)
  );
}

export function isC6BolepixV2ReceiptCandidate(companyId: string, receiptId: string): boolean {
  const company = String(companyId || '').trim();
  const receipt = String(receiptId || '').trim();
  return C6_BOLEPIX_V2_RELEASED_RECEIPTS.some(
    (item) => item.companyId === company && item.receiptId === receipt,
  );
}

/** POST real somente para a parcela, a empresa e a integração nomeadas. */
export function isC6BolepixV2LiveReceipt(
  companyId: string,
  integrationId: string,
  receiptId: string,
): boolean {
  if (!isC6BolepixV2LiveRelease(companyId, integrationId)) return false;
  const receipt = String(receiptId || '').trim();
  return C6_BOLEPIX_V2_RELEASED_RECEIPTS.some(
    (item) =>
      item.companyId === String(companyId || '').trim() &&
      item.integrationId === String(integrationId || '').trim() &&
      item.receiptId === receipt,
  );
}

export function c6BolepixV2HasNamedReceipt(companyId: string, integrationId: string): boolean {
  return C6_BOLEPIX_V2_RELEASED_RECEIPTS.some(
    (item) =>
      item.companyId === String(companyId || '').trim() &&
      item.integrationId === String(integrationId || '').trim(),
  );
}

/** POST real só depois da parcela de teste e da liberação de uma integração. */
export function evaluateC6BolepixV2ControlledEmission(input: {
  companyId: string;
  integrationId: string;
  pixConfigured: boolean;
  beneficiaryLinked: boolean;
  integrationActive: boolean;
  credentialsPresent: boolean;
  migrationConfirmed: boolean;
  reservationReady: boolean;
  adminAuthorized: boolean;
  testParcelNamed: boolean;
}): { postAllowed: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.pixConfigured) missing.push('EVP cadastrada');
  if (!input.beneficiaryLinked) missing.push('conta beneficiária');
  if (!input.integrationActive) missing.push('integração ativa');
  if (!input.credentialsPresent) missing.push('credenciais válidas');
  if (!input.migrationConfirmed) missing.push('migration confirmada');
  if (!input.reservationReady) missing.push('reserva idempotente');
  if (!input.adminAuthorized) missing.push('permissão administrativa');
  if (!input.testParcelNamed) missing.push('parcela de teste indicada');
  const released = isC6BolepixV2LiveRelease(input.companyId, input.integrationId);
  if (!released) missing.push('liberação individual da integração');
  return { postAllowed: missing.length === 0 && released, missing };
}

export type C6BolepixPanelPhase =
  | 'nao_configurado'
  | 'evp_configurada'
  | 'aguardando_autorizacao'
  | 'integracao_liberada'
  | 'emissao_operacional'
  | 'emissao_bloqueada_por_seguranca';

export function listC6BolepixActivationPending(input: {
  loading: boolean;
  persistBlocked: boolean;
  integrationPresent: boolean;
  integrationDisabled: boolean;
  clientIdConfigured: boolean;
  hasClientSecret: boolean;
  hasCertificate: boolean;
  beneficiaryLinked: boolean;
  pixConfigured: boolean;
  passwordProvided: boolean;
}): string[] {
  const pending: string[] = [];
  if (input.loading) pending.push('A configuração ainda está carregando.');
  if (input.persistBlocked) pending.push('O cadastro C6 está bloqueado neste ambiente.');
  if (!input.integrationPresent) pending.push('A integração C6 desta empresa não está disponível.');
  if (input.integrationDisabled) pending.push('A integração C6 está desativada.');
  if (!input.clientIdConfigured) pending.push('Informe o Client ID.');
  if (!input.hasClientSecret) pending.push('Salve o Client Secret.');
  if (!input.hasCertificate) pending.push('Salve o certificado.');
  if (!input.beneficiaryLinked) pending.push('Vincule a conta financeira C6 e salve a configuração.');
  if (!input.pixConfigured) pending.push('Cadastre a chave Pix EVP.');
  if (!input.passwordProvided) pending.push('Informe a senha do administrador principal.');
  return pending;
}

/** Situação do painel. Liberar a integração não libera todas as parcelas. */
export function describeC6BolepixPanel(input: {
  companyId: string;
  integrationId: string;
  integrationPresent: boolean;
  credentialsPresent: boolean;
  beneficiaryLinked: boolean;
  pixConfigured: boolean;
  activationRequested: boolean;
  testParcelNamed: boolean;
}): { phase: C6BolepixPanelPhase; label: string; postAllowed: boolean; detail: string } {
  const ready =
    input.integrationPresent && input.credentialsPresent && input.beneficiaryLinked && input.pixConfigured;
  const released = isC6BolepixV2LiveRelease(input.companyId, input.integrationId);
  const decision = evaluateC6BolepixV2ControlledEmission({
    companyId: input.companyId,
    integrationId: input.integrationId,
    pixConfigured: input.pixConfigured,
    beneficiaryLinked: input.beneficiaryLinked,
    integrationActive: input.integrationPresent,
    credentialsPresent: input.credentialsPresent,
    migrationConfirmed: true,
    reservationReady: true,
    adminAuthorized: input.activationRequested,
    testParcelNamed: input.testParcelNamed,
  });
  if (!ready) {
    return {
      phase: 'nao_configurado',
      label: 'Não configurado',
      postAllowed: false,
      detail: 'Emissão bloqueada por segurança.',
    };
  }
  if (decision.postAllowed) {
    return {
      phase: 'emissao_operacional',
      label: 'Emissão autorizada para homologação',
      postAllowed: true,
      detail: 'Somente a entrada autorizada pode ser emitida. As demais parcelas e o lote continuam bloqueados.',
    };
  }
  if (released && !input.testParcelNamed) {
    return {
      phase: 'integracao_liberada',
      label: 'Integração liberada',
      postAllowed: false,
      detail: 'A liberação não emite outras parcelas. Falta a parcela de teste indicada pelo administrador.',
    };
  }
  if (!released) {
    if (input.activationRequested) {
      return {
        phase: 'aguardando_autorizacao',
        label: 'Aguardando autorização',
        postAllowed: false,
        detail: 'Emissão bloqueada por segurança. O POST real continua desligado.',
      };
    }
    return {
      phase: 'evp_configurada',
      label: 'EVP configurada',
      postAllowed: false,
      detail: 'Emissão bloqueada por segurança.',
    };
  }
  if (released && input.testParcelNamed && !input.activationRequested) {
    return {
      phase: 'aguardando_autorizacao',
      label: 'Emissão desativada',
      postAllowed: false,
      detail:
        'Informe a senha do administrador principal e clique em Ativar emissão desta empresa. A autorização vale só para a entrada de homologação.',
    };
  }
  if (input.activationRequested) {
    return {
      phase: 'aguardando_autorizacao',
      label: 'Aguardando autorização',
      postAllowed: false,
      detail: 'Emissão bloqueada por segurança. O POST real continua desligado.',
    };
  }
  if (!C6_BOLEPIX_V2_LIVE_CALLS_ENABLED) {
    return {
      phase: 'evp_configurada',
      label: 'EVP configurada',
      postAllowed: false,
      detail: 'Emissão bloqueada por segurança.',
    };
  }
  return {
    phase: 'emissao_bloqueada_por_seguranca',
    label: 'Emissão bloqueada por segurança',
    postAllowed: false,
    detail: 'O POST real continua desligado.',
  };
}

export const C6_BOLEPIX_V2_STATUS_MEANING = {
  CREATED: 'Cobrança criada. O contrato não afirma registro na rede bancária.',
  PAID: 'Pagamento liquidado.',
  CANCELED: 'Cobrança cancelada.',
  WAITING_CONFIRMATION:
    'Pagamento confirmado, sem crédito na conta. Não gera baixa de caixa.',
} as const;
