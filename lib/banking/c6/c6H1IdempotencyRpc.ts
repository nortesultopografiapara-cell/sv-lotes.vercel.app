/**
 * Argumentos das funções de idempotência já instaladas no Develop.
 * Este módulo só monta o contrato. Não chama RPC, não grava e não emite.
 */

import { C6_B01_RECONCILE_PHRASE } from '@/lib/banking/c6/c6HomologIdempotency';
import {
  C6_H1_AUTHORIZED_COMPANY_ID,
  C6_H1_EXTERNAL_REFERENCE,
  C6_H1_PRODUCTION_COMPANY_ID,
  evaluateC6H1Authorization,
} from '@/lib/banking/c6/c6H1Authorization';

export const C6_H1_INTEGRATION_ID = 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25';

/** Reservas B_01–B_08 já gravadas. Nenhuma operação H1 pode reutilizá-las. */
export const C6_H1_PROTECTED_REFERENCES = [
  'B01S261027',
  'B02S261027',
  'B03S261027',
  'B04A261027',
  'B04S261027',
  'B05S261027',
  'B06R261027',
  'B06S261027',
  'B06T261027',
  'B07S261027',
  'B08E261027',
] as const;

export const C6_H1_RESERVE_RPC = 'reserve_c6_homolog_idempotency';
export const C6_H1_PROCESSING_RPC = 'mark_c6_homolog_idempotency_processing';
export const C6_H1_COMPLETE_RPC = 'complete_c6_homolog_idempotency';
export const C6_H1_RECONCILE_RPC = 'reconcile_c6_homolog_idempotency';

export const C6_H1_RESERVE_ARG_ORDER = [
  'p_company_id',
  'p_integration_id',
  'p_external_reference_id',
  'p_environment',
  'p_scenario',
  'p_request_fingerprint',
  'p_created_by',
] as const;

export const C6_H1_PROCESSING_ARG_ORDER = [
  'p_company_id',
  'p_integration_id',
  'p_external_reference_id',
  'p_attempt_count',
] as const;

export const C6_H1_COMPLETE_ARG_ORDER = [
  'p_company_id',
  'p_integration_id',
  'p_external_reference_id',
  'p_status',
  'p_attempt_count',
  'p_http_status',
  'p_error_code',
  'p_error_message',
  'p_c6_bank_slip_id',
] as const;

export const C6_H1_RECONCILE_ARG_ORDER = [
  'p_company_id',
  'p_integration_id',
  'p_external_reference_id',
  'p_confirmation',
  'p_operator_note',
] as const;

const FINGERPRINT = /^[a-f0-9]{64}$/;

export type C6H1BlockedStatus = 'RESERVED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export function isC6H1ProtectedReference(value: string | null | undefined): boolean {
  return C6_H1_PROTECTED_REFERENCES.includes(
    String(value || '') as (typeof C6_H1_PROTECTED_REFERENCES)[number],
  );
}

/** UNKNOWN e PROCESSING nunca liberam outra emissão. SUCCEEDED também não. */
export function c6H1StatusBlocksAnotherEmission(status: C6H1BlockedStatus | null): {
  blocked: boolean;
  mayEmit: false;
  reason: 'needs_reconciliation' | 'in_flight' | 'already_succeeded' | 'action_disarmed';
} {
  if (status === 'UNKNOWN') return { blocked: true, mayEmit: false, reason: 'needs_reconciliation' };
  if (status === 'PROCESSING' || status === 'RESERVED') {
    return { blocked: true, mayEmit: false, reason: 'in_flight' };
  }
  if (status === 'SUCCEEDED') return { blocked: true, mayEmit: false, reason: 'already_succeeded' };
  return { blocked: true, mayEmit: false, reason: 'action_disarmed' };
}

export type C6H1ReserveRpcArgs = {
  p_company_id: typeof C6_H1_AUTHORIZED_COMPANY_ID;
  p_integration_id: typeof C6_H1_INTEGRATION_ID;
  p_external_reference_id: typeof C6_H1_EXTERNAL_REFERENCE;
  p_environment: 'SANDBOX';
  p_scenario: 'H1';
  p_request_fingerprint: string;
  p_created_by: null;
};

export type C6H1RpcPlan =
  | {
      ok: true;
      rpc: typeof C6_H1_RESERVE_RPC;
      args: C6H1ReserveRpcArgs;
      dispatched: false;
      mayEmit: false;
    }
  | {
      ok: false;
      reason:
        | 'company'
        | 'protected_reference'
        | 'reference'
        | 'integration'
        | 'environment'
        | 'supabase'
        | 'server_authorization'
        | 'invalid_fingerprint'
        | 'action_disarmed';
      dispatched: false;
      mayEmit: false;
    };

export function buildC6H1ReserveRpcArgs(input: {
  companyId: string;
  integrationId: string;
  externalReferenceId: string;
  environment: string;
  supabaseUrl: string;
  serverAuthorization: string;
  env?: Record<string, string | undefined>;
  requestFingerprint: string;
}): C6H1RpcPlan {
  const reference = String(input.externalReferenceId || '');
  if (isC6H1ProtectedReference(reference)) {
    return { ok: false, reason: 'protected_reference', dispatched: false, mayEmit: false };
  }
  if (String(input.companyId || '').trim().toLowerCase() === C6_H1_PRODUCTION_COMPANY_ID) {
    return { ok: false, reason: 'company', dispatched: false, mayEmit: false };
  }
  const decision = evaluateC6H1Authorization({
    companyId: input.companyId,
    supabaseUrl: input.supabaseUrl,
    environment: input.environment,
    externalReferenceId: reference,
    operation: 'emit',
    serverAuthorization: input.serverAuthorization,
    env: input.env,
  });
  if (!decision.company) return { ok: false, reason: 'company', dispatched: false, mayEmit: false };
  if (!decision.develop) return { ok: false, reason: 'supabase', dispatched: false, mayEmit: false };
  if (!decision.sandbox) return { ok: false, reason: 'environment', dispatched: false, mayEmit: false };
  if (!decision.reference) return { ok: false, reason: 'reference', dispatched: false, mayEmit: false };
  if (!decision.serverAuthorization) {
    return { ok: false, reason: 'server_authorization', dispatched: false, mayEmit: false };
  }
  if (String(input.integrationId || '') !== C6_H1_INTEGRATION_ID) {
    return { ok: false, reason: 'integration', dispatched: false, mayEmit: false };
  }
  const fingerprint = String(input.requestFingerprint || '').trim().toLowerCase();
  if (!FINGERPRINT.test(fingerprint)) {
    return { ok: false, reason: 'invalid_fingerprint', dispatched: false, mayEmit: false };
  }
  return {
    ok: true,
    rpc: C6_H1_RESERVE_RPC,
    dispatched: false,
    mayEmit: false,
    args: {
      p_company_id: C6_H1_AUTHORIZED_COMPANY_ID,
      p_integration_id: C6_H1_INTEGRATION_ID,
      p_external_reference_id: C6_H1_EXTERNAL_REFERENCE,
      p_environment: 'SANDBOX',
      p_scenario: 'H1',
      p_request_fingerprint: fingerprint,
      p_created_by: null,
    },
  };
}

export function buildC6H1ProcessingRpcArgs(attemptCount: number) {
  return {
    rpc: C6_H1_PROCESSING_RPC,
    dispatched: false as const,
    args: {
      p_company_id: C6_H1_AUTHORIZED_COMPANY_ID,
      p_integration_id: C6_H1_INTEGRATION_ID,
      p_external_reference_id: C6_H1_EXTERNAL_REFERENCE,
      p_attempt_count: attemptCount,
    },
  };
}

export function buildC6H1CompleteRpcArgs(input: {
  status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  attemptCount: number;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  bankSlipId: string | null;
}) {
  return {
    rpc: C6_H1_COMPLETE_RPC,
    dispatched: false as const,
    args: {
      p_company_id: C6_H1_AUTHORIZED_COMPANY_ID,
      p_integration_id: C6_H1_INTEGRATION_ID,
      p_external_reference_id: C6_H1_EXTERNAL_REFERENCE,
      p_status: input.status,
      p_attempt_count: input.attemptCount,
      p_http_status: input.httpStatus,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
      p_c6_bank_slip_id: input.bankSlipId,
    },
  };
}

export function buildC6H1ReconcileRpcArgs() {
  return {
    rpc: C6_H1_RECONCILE_RPC,
    dispatched: false as const,
    mayEmit: false as const,
    args: {
      p_company_id: C6_H1_AUTHORIZED_COMPANY_ID,
      p_integration_id: C6_H1_INTEGRATION_ID,
      p_external_reference_id: C6_H1_EXTERNAL_REFERENCE,
      p_confirmation: C6_B01_RECONCILE_PHRASE,
      p_operator_note: null,
    },
  };
}

/** Ponto único de envio. Nesta fase não há cliente e não há rede. */
export function dispatchC6H1IdempotencyRpc(): { dispatched: false; bankCallAllowed: false } {
  return { dispatched: false, bankCallAllowed: false };
}
