/**
 * Adapter Supabase das RPCs de idempotência C6.
 * Tabela ausente (PGRST205) → leitura vazia, sem throw de schema.
 * A rota B_01 persiste reserva via este adapter e conclui FAILED; nunca envia HTTP ao C6
 * até autorização específica de emissão Sandbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  C6_HOMOLOG_COMPLETE_RPC,
  C6_HOMOLOG_PROCESSING_RPC,
  C6_HOMOLOG_RECONCILE_RPC,
  C6_HOMOLOG_RESERVE_RPC,
  C6_HOMOLOG_TABLE,
  type C6HomologCompleteInput,
  type C6HomologIdempotencyAdapter,
  type C6HomologIdempotencyRow,
  type C6HomologIdempotencyStatus,
  type C6HomologKey,
  type C6HomologReconcileInput,
  type C6HomologReserveInput,
  type C6HomologReserveReason,
  type C6HomologReserveResult,
} from '@/lib/banking/c6/c6HomologIdempotency';

function isMissingRelation(message: string): boolean {
  const text = String(message || '');
  return (
    text.includes('42P01') ||
    text.includes('PGRST205') ||
    /does not exist/i.test(text) ||
    /could not find the table/i.test(text) ||
    /schema cache/i.test(text)
  );
}

function asRow(raw: unknown): C6HomologIdempotencyRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const status = String(row.status || '');
  if (
    status !== 'RESERVED' &&
    status !== 'PROCESSING' &&
    status !== 'SUCCEEDED' &&
    status !== 'FAILED' &&
    status !== 'UNKNOWN'
  ) {
    return null;
  }
  const companyId = String(row.company_id || row.companyId || '').trim();
  const integrationId = String(row.integration_id || row.integrationId || '').trim();
  const externalReferenceId = String(
    row.external_reference_id || row.externalReferenceId || '',
  ).trim();
  if (!companyId || !integrationId || !externalReferenceId) return null;
  return {
    id: String(row.id || ''),
    companyId,
    integrationId,
    externalReferenceId,
    environment: 'SANDBOX',
    scenario: String(row.scenario || 'B_01'),
    status: status as C6HomologIdempotencyStatus,
    attemptCount: Number(row.attempt_count || row.attemptCount || 1),
    requestFingerprint: row.request_fingerprint
      ? String(row.request_fingerprint)
      : row.requestFingerprint
        ? String(row.requestFingerprint)
        : null,
    lastHttpStatus:
      typeof row.last_http_status === 'number'
        ? row.last_http_status
        : typeof row.lastHttpStatus === 'number'
          ? row.lastHttpStatus
          : null,
    lastErrorCode: row.last_error_code
      ? String(row.last_error_code)
      : row.lastErrorCode
        ? String(row.lastErrorCode)
        : null,
    lastErrorMessage: row.last_error_message
      ? String(row.last_error_message)
      : row.lastErrorMessage
        ? String(row.lastErrorMessage)
        : null,
    c6BankSlipId: row.c6_bank_slip_id
      ? String(row.c6_bank_slip_id)
      : row.c6BankSlipId
        ? String(row.c6BankSlipId)
        : null,
    lastAttemptAt: String(row.last_attempt_at || row.lastAttemptAt || ''),
    processingAt: row.processing_at
      ? String(row.processing_at)
      : row.processingAt
        ? String(row.processingAt)
        : null,
    completedAt: row.completed_at
      ? String(row.completed_at)
      : row.completedAt
        ? String(row.completedAt)
        : null,
  };
}

function asResult(raw: unknown): C6HomologReserveResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { acquired: false, reason: 'invalid_transition', row: null };
  }
  const data = raw as Record<string, unknown>;
  const reason = String(data.reason || 'invalid_transition') as C6HomologReserveReason;
  return {
    acquired: Boolean(data.acquired),
    reason,
    row: asRow(data.row),
  };
}

export async function loadC6HomologAtomicRow(
  admin: SupabaseClient,
  key: C6HomologKey,
): Promise<C6HomologIdempotencyRow | null> {
  const { data, error } = await admin
    .from(C6_HOMOLOG_TABLE)
    .select(
      'id, company_id, integration_id, external_reference_id, environment, scenario, status, attempt_count, request_fingerprint, last_http_status, last_error_code, last_error_message, c6_bank_slip_id, last_attempt_at, processing_at, completed_at',
    )
    .eq('company_id', key.companyId)
    .eq('integration_id', key.integrationId)
    .eq('external_reference_id', key.externalReferenceId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error(error.message);
  }
  return asRow(data);
}

export function createSupabaseC6HomologIdempotencyAdapter(
  admin: SupabaseClient,
): C6HomologIdempotencyAdapter {
  return {
    async get(key) {
      return loadC6HomologAtomicRow(admin, key);
    },
    async reserve(input: C6HomologReserveInput) {
      const { data, error } = await admin.rpc(C6_HOMOLOG_RESERVE_RPC, {
        p_company_id: input.companyId,
        p_integration_id: input.integrationId,
        p_external_reference_id: input.externalReferenceId,
        p_environment: input.environment,
        p_scenario: input.scenario || 'B_01',
        p_request_fingerprint: input.requestFingerprint || null,
        p_created_by: input.createdBy || null,
      });
      if (error) throw new Error(error.message);
      return asResult(data);
    },
    async markProcessing(input) {
      const { data, error } = await admin.rpc(C6_HOMOLOG_PROCESSING_RPC, {
        p_company_id: input.companyId,
        p_integration_id: input.integrationId,
        p_external_reference_id: input.externalReferenceId,
        p_attempt_count: input.attemptCount,
      });
      if (error) throw new Error(error.message);
      return asResult(data);
    },
    async complete(input: C6HomologCompleteInput) {
      const { data, error } = await admin.rpc(C6_HOMOLOG_COMPLETE_RPC, {
        p_company_id: input.companyId,
        p_integration_id: input.integrationId,
        p_external_reference_id: input.externalReferenceId,
        p_status: input.status,
        p_attempt_count: input.attemptCount,
        p_http_status: input.httpStatus ?? null,
        p_error_code: input.errorCode || null,
        p_error_message: input.errorMessage || null,
        p_c6_bank_slip_id: input.c6BankSlipId || null,
      });
      if (error) throw new Error(error.message);
      return asResult(data);
    },
    async reconcile(input: C6HomologReconcileInput) {
      const { data, error } = await admin.rpc(C6_HOMOLOG_RECONCILE_RPC, {
        p_company_id: input.companyId,
        p_integration_id: input.integrationId,
        p_external_reference_id: input.externalReferenceId,
        p_confirmation: input.confirmation,
        p_operator_note: input.operatorNote || null,
      });
      if (error) throw new Error(error.message);
      return asResult(data);
    },
  };
}
