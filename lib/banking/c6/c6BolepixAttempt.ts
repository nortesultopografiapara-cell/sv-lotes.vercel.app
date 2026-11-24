/**
 * Prepara uma tentativa nova depois de rejeição definitiva e consulta HTTP 404.
 * Não envia POST e não altera a reserva anterior.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { consultC6BolepixSituation, type C6InstallmentChargeOptions } from '@/lib/banking/c6/c6InstallmentCharge';
import { c6BolepixV2ReferenceForAttempt } from '@/lib/banking/c6/c6BolepixV2Emission';
import { isC6BolepixV2ReceiptCandidate } from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { c6BolepixRequestFingerprint } from '@/lib/banking/c6/c6BolepixV2Reservation';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';

export type C6AttemptPrepareDecision = {
  accepted: boolean;
  reason:
    | 'prepared'
    | 'not_reconciled'
    | 'title_found'
    | 'uncertain'
    | 'blocked'
    | 'reference_reused';
};

export function decideC6BolepixAttemptPrepare(input: {
  reservationStatus: string | null;
  reservationHttp: number | null;
  reservationChargeId: string | null;
  consultHttp: number | null;
  titleFound: boolean;
  openAttempt: boolean;
  bankCharge: boolean;
  sameReference: boolean;
}): C6AttemptPrepareDecision {
  if (input.titleFound || input.consultHttp === 200) return { accepted: false, reason: 'title_found' };
  if (input.consultHttp == null || input.consultHttp >= 500) return { accepted: false, reason: 'uncertain' };
  if (input.consultHttp !== 404) return { accepted: false, reason: 'not_reconciled' };
  if (input.sameReference) return { accepted: false, reason: 'reference_reused' };
  if (input.openAttempt || input.bankCharge) return { accepted: false, reason: 'blocked' };
  const status = String(input.reservationStatus || '').toUpperCase();
  const http = input.reservationHttp;
  if (status !== 'FAILED' || input.reservationChargeId || (http !== 400 && http !== 409 && http !== 422)) {
    return { accepted: false, reason: 'blocked' };
  }
  return { accepted: true, reason: 'prepared' };
}

function clean(value: unknown): string {
  return String(value || '').trim();
}

export async function prepareC6BolepixAttempt(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  authorizedBy: string,
  options?: C6InstallmentChargeOptions,
): Promise<{
  prepared: boolean;
  emitted: false;
  reason: C6AttemptPrepareDecision['reason'] | 'unavailable';
  message: string;
  externalReference?: string;
  attemptNumber?: number;
  consultHttp: number | null;
  traceId: string | null;
}> {
  if (!options?.allowSimulatedHttp && !isC6BolepixV2ReceiptCandidate(companyId, installmentId)) {
    throw new C6EmissionNotHomologatedError();
  }
  const consulted = await consultC6BolepixSituation(admin, companyId, installmentId, options);
  const { data: reservation, error } = await admin
    .from('c6_bolepix_reservations')
    .select('id, status, last_http_status, c6_charge_id, external_reference_id, integration_id')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId)
    .maybeSingle();
  if (error) throw new Error('Não foi possível verificar a reserva Bolepix.');
  const { data: receipt, error: receiptError } = await admin
    .from('finance_receipts')
    .select('financial_account_id, amount, due_date')
    .eq('id', installmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (receiptError) throw new Error(receiptError.message);
  const { data: charges, error: chargeError } = await admin
    .from('bank_charges')
    .select('id, external_id, status')
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .eq('finance_receipt_id', installmentId);
  if (chargeError) throw new Error(chargeError.message);
  const bankCharge = (charges || []).some((row) => {
    const record = row as { external_id?: string | null; status?: string | null };
    const status = clean(record.status).toUpperCase();
    return clean(record.external_id) && status !== 'CANCELLED' && status !== 'EXPIRED';
  });
  const attemptRows = await admin
    .from('c6_bolepix_attempts')
    .select('status, c6_charge_id, attempt_number')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId);
  if (attemptRows.error) {
    const message = String(attemptRows.error.message || '');
    if (/c6_bolepix_attempts|does not exist|schema cache|Could not find the table/i.test(message)) {
      return {
        prepared: false,
        emitted: false,
        reason: 'unavailable',
        message: 'A nova tentativa ainda depende da migration autorizada. Nenhum boleto foi emitido.',
        consultHttp: consulted.httpStatus,
        traceId: consulted.bankDiagnostic.traceId,
      };
    }
    throw new Error('Não foi possível verificar as tentativas Bolepix.');
  }
  const rows = (attemptRows.data || []) as Array<{ status?: string | null; c6_charge_id?: string | null; attempt_number?: number | null }>;
  const openAttempt = rows.some((row) =>
    ['RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN'].includes(clean(row.status).toUpperCase()) || clean(row.c6_charge_id),
  );
  const nextNumber = rows.reduce((max, row) => Math.max(max, Number(row.attempt_number) || 1), 1) + 1;
  const nextReference = c6BolepixV2ReferenceForAttempt(installmentId, nextNumber);
  const decision = decideC6BolepixAttemptPrepare({
    reservationStatus: reservation?.status == null ? null : String(reservation.status),
    reservationHttp: reservation?.last_http_status == null ? null : Number(reservation.last_http_status),
    reservationChargeId: clean(reservation?.c6_charge_id) || null,
    consultHttp: consulted.httpStatus,
    titleFound: consulted.titleFound,
    openAttempt,
    bankCharge,
    sameReference: nextReference === clean(reservation?.external_reference_id),
  });
  if (!decision.accepted || !reservation?.id || !receipt?.financial_account_id) {
    const message =
      decision.reason === 'title_found'
        ? 'O C6 localizou o título. A nova tentativa não foi criada.'
        : decision.reason === 'uncertain'
          ? 'A consulta não confirmou a ausência do título. A nova tentativa não foi criada.'
          : decision.reason === 'not_reconciled'
            ? 'A consulta não retornou HTTP 404. A nova tentativa não foi criada.'
            : 'A nova tentativa não foi autorizada. Nenhum boleto foi emitido.';
    return {
      prepared: false,
      emitted: false,
      reason: decision.reason,
      message,
      consultHttp: consulted.httpStatus,
      traceId: consulted.bankDiagnostic.traceId,
    };
  }
  const fingerprint = c6BolepixRequestFingerprint({
    amount: Number(receipt.amount).toFixed(2),
    dueDate: String(receipt.due_date || '').slice(0, 10),
    taxId: 'reconciled',
    reference: nextReference,
    receiptId: installmentId,
  });
  const diagnostic = JSON.stringify({
    httpStatus: consulted.httpStatus,
    code: consulted.bankDiagnostic.code,
    message: consulted.bankDiagnostic.message,
    traceId: consulted.bankDiagnostic.traceId,
    externalReference: consulted.externalReference,
  }).slice(0, 2000);
  const prepared = await admin.rpc('prepare_c6_bolepix_attempt', {
    p_company_id: companyId,
    p_integration_id: reservation.integration_id,
    p_financial_account_id: receipt.financial_account_id,
    p_finance_receipt_id: installmentId,
    p_external_reference_id: nextReference,
    p_request_fingerprint: fingerprint,
    p_reconciliation_http: 404,
    p_reconciliation_trace: consulted.bankDiagnostic.traceId,
    p_bank_diagnostic: diagnostic,
    p_authorized_by: authorizedBy,
  });
  if (prepared.error || prepared.data?.accepted !== true) {
    return {
      prepared: false,
      emitted: false,
      reason: clean(prepared.data?.reason) === 'reference_reused' ? 'reference_reused' : 'blocked',
      message: 'A nova tentativa não foi gravada. A reserva anterior permanece intacta.',
      consultHttp: consulted.httpStatus,
      traceId: consulted.bankDiagnostic.traceId,
    };
  }
  return {
    prepared: true,
    emitted: false,
    reason: 'prepared',
    message: 'Nova tentativa preparada. Aguardando confirmação técnica do C6 Bank.',
    externalReference: nextReference,
    attemptNumber: Number(prepared.data?.attempt_number) || nextNumber,
    consultHttp: 404,
    traceId: consulted.bankDiagnostic.traceId,
  };
}
