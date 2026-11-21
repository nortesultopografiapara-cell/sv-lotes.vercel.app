/**
 * Ação interna da homologação C6-H1.
 * Prepara token, emissão, status e PDF sem executar HTTP e sem gravar financeiro.
 */

import {
  assessC6H1OAuthScopes,
  C6_H1_ACTION_DISARMED_MESSAGE,
  C6_H1_EXTERNAL_REFERENCE,
  evaluateC6H1Authorization,
  isC6H1Operation,
  type C6H1AuthorizationDecision,
  type C6H1Operation,
} from '@/lib/banking/c6/c6H1Authorization';
import { C6_AUTH_GRANT_TYPE, C6_AUTH_HOST } from '@/lib/banking/c6/c6Endpoints';
import { C6_BOLETO_PDF_ACCEPT } from '@/lib/banking/c6/c6BoletoOpenApi';
import { getC6BankSlipsHost } from '@/lib/banking/c6/c6BoletoEndpoints';
import {
  buildC6HomologRequestFingerprint,
  classifyC6HomologHttpOutcome,
  C6_HOMOLOG_TABLE,
  type C6HomologIdempotencyAdapter,
  type C6HomologReserveReason,
} from '@/lib/banking/c6/c6HomologIdempotency';

export const C6_H1_REUSES_EXISTING_IDEMPOTENCY = true;

const FORBIDDEN_BODY_KEYS = new Set([
  'clientsecret',
  'client_secret',
  'certificatepem',
  'certificate',
  'privatekeypem',
  'privatekey',
  'private_key',
  'private_key_pem',
  'access_token',
  'accesstoken',
  'encrypted_payload',
  'refreshtoken',
  'refresh_token',
]);

export type C6H1PublicPlan = {
  phase: 'C6-H1';
  operation: C6H1Operation | null;
  message: string;
  executed: false;
  actionEnabled: false;
  bankCallAllowed: false;
  globalEmissionAuthorized: boolean;
  webhookEnabled: false;
  financialWriteAllowed: false;
  productionEmissionAllowed: false;
  conditions: {
    company: boolean;
    develop: boolean;
    sandbox: boolean;
    reference: boolean;
    serverAuthorization: boolean;
  };
  denials: C6H1AuthorizationDecision['denials'];
  reference: typeof C6_H1_EXTERNAL_REFERENCE | null;
  auth: {
    host: typeof C6_AUTH_HOST.SANDBOX;
    method: 'POST';
    path: '/v1/auth/';
    grantType: typeof C6_AUTH_GRANT_TYPE;
    mtls: true;
    executed: false;
  } | null;
  boleto: {
    host: string;
    method: 'POST' | 'GET';
    path: string;
    accept: typeof C6_BOLETO_PDF_ACCEPT | 'application/json';
    executed: false;
  } | null;
  scopes: ReturnType<typeof assessC6H1OAuthScopes> | null;
  idempotency: {
    reuseExisting: true;
    conflictingMigrationShipped: false;
    table: typeof C6_HOMOLOG_TABLE;
    sameReferenceCanEmitTwice: false;
    ambiguousReleasesReference: false;
    unknownAndProcessingStayBlocked: true;
    reconcileBeforeRetry: true;
  };
};

export type C6H1PlanResult = {
  status: 400 | 403;
  body: C6H1PublicPlan;
};

function emptyConditions(): C6H1PublicPlan['conditions'] {
  return {
    company: false,
    develop: false,
    sandbox: false,
    reference: false,
    serverAuthorization: false,
  };
}

function basePlan(operation: C6H1Operation | null): C6H1PublicPlan {
  return {
    phase: 'C6-H1',
    operation,
    message: C6_H1_ACTION_DISARMED_MESSAGE,
    executed: false,
    actionEnabled: false,
    bankCallAllowed: false,
    globalEmissionAuthorized: false,
    webhookEnabled: false,
    financialWriteAllowed: false,
    productionEmissionAllowed: false,
    conditions: emptyConditions(),
    denials: ['action_disarmed'],
    reference: null,
    auth: null,
    boleto: null,
    scopes: null,
    idempotency: {
      reuseExisting: C6_H1_REUSES_EXISTING_IDEMPOTENCY,
      conflictingMigrationShipped: false,
      table: C6_HOMOLOG_TABLE,
      sameReferenceCanEmitTwice: false,
      ambiguousReleasesReference: false,
      unknownAndProcessingStayBlocked: true,
      reconcileBeforeRetry: true,
    },
  };
}

function bodyCarriesCredential(value: unknown): boolean {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (FORBIDDEN_BODY_KEYS.has(key.toLowerCase())) return true;
      if (typeof child === 'string' && /BEGIN (?:[A-Z]+ )?PRIVATE KEY|BEGIN CERTIFICATE|access_token\s*[:=]/i.test(child)) {
        return true;
      }
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return false;
}

function technicalShape(operation: C6H1Operation, decision: C6H1AuthorizationDecision): Pick<
  C6H1PublicPlan,
  'auth' | 'boleto' | 'scopes' | 'reference'
> {
  const reference = decision.reference ? C6_H1_EXTERNAL_REFERENCE : null;
  if (operation === 'token') {
    return {
      reference,
      auth: {
        host: C6_AUTH_HOST.SANDBOX,
        method: 'POST',
        path: '/v1/auth/',
        grantType: C6_AUTH_GRANT_TYPE,
        mtls: true,
        executed: false,
      },
      boleto: null,
      scopes: assessC6H1OAuthScopes(null, false),
    };
  }
  if (operation === 'emit') {
    return {
      reference,
      auth: null,
      boleto: {
        host: getC6BankSlipsHost('SANDBOX'),
        method: 'POST',
        path: '/v1/bank_slips/',
        accept: 'application/json',
        executed: false,
      },
      scopes: null,
    };
  }
  return {
    reference,
    auth: null,
    boleto: {
      host: getC6BankSlipsHost('SANDBOX'),
      method: 'GET',
      path: operation === 'pdf' ? '/v1/bank_slips/{id}/pdf' : '/v1/bank_slips/{id}',
      accept: operation === 'pdf' ? C6_BOLETO_PDF_ACCEPT : 'application/json',
      executed: false,
    },
    scopes: null,
  };
}

export function planC6H1HomologAction(input: {
  tenantId: string;
  body: unknown;
  supabaseUrl?: string | null;
  env?: Record<string, string | undefined>;
}): C6H1PlanResult {
  const record =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : null;
  const operationText = String(record?.operation || '').trim();
  if (!isC6H1Operation(operationText)) {
    const body = basePlan(null);
    body.message = 'Operação de homologação C6 H1 não reconhecida.';
    return { status: 400, body };
  }
  if (bodyCarriesCredential(input.body)) {
    const body = basePlan(operationText);
    body.message = 'Credencial recusada neste endpoint. Nada foi encaminhado ao banco.';
    body.denials = ['action_disarmed'];
    return { status: 400, body };
  }

  const tenantId = String(input.tenantId || '').trim();
  const bodyCompany = record && 'companyId' in record ? String(record.companyId || '').trim() : '';
  const companyMismatch = Boolean(bodyCompany) && bodyCompany.toLowerCase() !== tenantId.toLowerCase();
  const decision = evaluateC6H1Authorization({
    companyId: tenantId,
    supabaseUrl: input.supabaseUrl,
    environment: record ? String(record.environment || '') : '',
    externalReferenceId: record ? String(record.externalReferenceId || '') : '',
    operation: operationText,
    serverAuthorization: record ? String(record.serverAuthorization || '') : '',
    env: input.env,
  });
  const body = basePlan(operationText);
  body.conditions = {
    company: decision.company && !companyMismatch,
    develop: decision.develop,
    sandbox: decision.sandbox,
    reference: decision.reference,
    serverAuthorization: decision.serverAuthorization,
  };
  body.denials =
    companyMismatch && !decision.denials.includes('company')
      ? ['company', ...decision.denials]
      : decision.denials;
  body.globalEmissionAuthorized = decision.globalEmissionAuthorized;
  body.productionEmissionAllowed = false;
  const shape = technicalShape(operationText, decision);
  body.reference = shape.reference;
  body.auth = shape.auth;
  body.boleto = shape.boleto;
  body.scopes = shape.scopes;
  body.message = C6_H1_ACTION_DISARMED_MESSAGE;
  return { status: 403, body };
}

export type C6H1IdempotencyRehearsal = {
  authorizationPassed: boolean;
  bankCallAllowed: false;
  mayRepeat: false;
  settled: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | null;
  repeatReason: C6HomologReserveReason | null;
};

/**
 * Ensaios locais da reserva. Não há fetch. O endpoint HTTP não chama esta função.
 * Sucesso simulado sem id do banco vira UNKNOWN e a referência continua ocupada.
 */
export async function rehearseC6H1IdempotencyInMemory(input: {
  store: C6HomologIdempotencyAdapter;
  companyId: string;
  integrationId: string;
  externalReferenceId: string;
  environment: string;
  supabaseUrl: string;
  serverAuthorization: string;
  env?: Record<string, string | undefined>;
  amount: number;
  dueDate: string;
  transport?: 'ok' | 'TIMEOUT' | 'NETWORK';
  httpStatus: number | null;
  bankSlipId?: string | null;
}): Promise<C6H1IdempotencyRehearsal> {
  const decision = evaluateC6H1Authorization({
    companyId: input.companyId,
    supabaseUrl: input.supabaseUrl,
    environment: input.environment,
    externalReferenceId: input.externalReferenceId,
    operation: 'emit',
    serverAuthorization: input.serverAuthorization,
    env: input.env,
  });
  const authorizationPassed =
    decision.company &&
    decision.develop &&
    decision.sandbox &&
    decision.reference &&
    decision.serverAuthorization;
  if (!authorizationPassed) {
    return {
      authorizationPassed: false,
      bankCallAllowed: false,
      mayRepeat: false,
      settled: null,
      repeatReason: null,
    };
  }

  const fingerprint = buildC6HomologRequestFingerprint({
    companyId: input.companyId,
    integrationId: input.integrationId,
    externalReferenceId: input.externalReferenceId,
    amount: input.amount,
    dueDate: input.dueDate,
    billingScheme: '21',
  });
  const key = {
    companyId: input.companyId,
    integrationId: input.integrationId,
    externalReferenceId: input.externalReferenceId,
  };
  const reserved = await input.store.reserve({
    ...key,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
  });
  if (!reserved.acquired || !reserved.row) {
    return {
      authorizationPassed: true,
      bankCallAllowed: false,
      mayRepeat: false,
      settled: null,
      repeatReason: reserved.reason,
    };
  }
  const processing = await input.store.markProcessing({
    ...key,
    attemptCount: reserved.row.attemptCount,
  });
  if (!processing.acquired || !processing.row) {
    return {
      authorizationPassed: true,
      bankCallAllowed: false,
      mayRepeat: false,
      settled: null,
      repeatReason: processing.reason,
    };
  }

  const classified = classifyC6HomologHttpOutcome({
    httpStatus: input.httpStatus,
    transport: input.transport,
    successStatuses: [201],
  });
  const bankSlipId = String(input.bankSlipId || '').trim();
  const settled = classified === 'SUCCEEDED' && !bankSlipId ? 'UNKNOWN' : classified;
  await input.store.complete({
    ...key,
    status: settled,
    attemptCount: processing.row.attemptCount,
    httpStatus: input.httpStatus,
    errorCode: settled === 'UNKNOWN' ? input.transport || 'AMBIGUOUS' : null,
    c6BankSlipId: settled === 'SUCCEEDED' ? bankSlipId : null,
  });
  const repeat = await input.store.reserve({
    ...key,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
  });
  return {
    authorizationPassed: true,
    bankCallAllowed: false,
    mayRepeat: false,
    settled,
    repeatReason: repeat.reason,
  };
}
