/**
 * Reserva local do Bolepix v2, espelhando a migration ainda não aplicada.
 * Não grava recebível, caixa nem a reserva v1.
 */

import { createHash } from 'node:crypto';
import { assertC6BolepixV2Reference } from '@/lib/banking/c6/c6BolepixV2Validation';

export type C6BolepixReservationStatus = 'RESERVED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export type C6BolepixReservationRow = {
  id: string;
  companyId: string;
  integrationId: string;
  financeReceiptId: string;
  externalReferenceId: string;
  status: C6BolepixReservationStatus;
  attemptCount: number;
  requestFingerprint: string;
  lastHttpStatus: number | null;
  c6ChargeId: string | null;
  retryAllowed: boolean;
};

export type C6BolepixReserveResult = {
  accepted: boolean;
  reason: 'reserved' | 'retry' | 'blocked' | 'needs_reconciliation';
  rows: C6BolepixReservationRow[];
};

const DEFINITIVE = new Set([400, 401, 403, 404, 422]);

export function c6BolepixRequestFingerprint(parts: {
  amount: string;
  dueDate: string;
  taxId: string;
  reference: string;
  receiptId: string;
}): string {
  return createHash('sha256')
    .update([parts.amount, parts.dueDate, parts.taxId, parts.reference, parts.receiptId].join('|'))
    .digest('hex');
}

export function reserveC6Bolepix(
  rows: C6BolepixReservationRow[],
  input: {
    companyId: string;
    integrationId: string;
    integrationCompanyId: string;
    receiptCompanyId: string;
    financeReceiptId: string;
    externalReferenceId: string;
    requestFingerprint: string;
    v1Status?: string | null;
    v1SlipId?: string | null;
    bankChargeExternalId?: string | null;
    bankChargeStatus?: string | null;
  },
): C6BolepixReserveResult {
  const reference = assertC6BolepixV2Reference(input.externalReferenceId);
  if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
    throw new Error('Impressão da requisição inválida.');
  }
  if (input.receiptCompanyId !== input.companyId || input.integrationCompanyId !== input.companyId) {
    throw new Error('Parcela de outra empresa.');
  }
  const next = rows.map((row) => ({ ...row }));
  const bankStatus = String(input.bankChargeStatus || '').toUpperCase();
  const v1Status = String(input.v1Status || '').toUpperCase();
  if (
    (input.bankChargeExternalId && bankStatus !== 'CANCELLED' && bankStatus !== 'EXPIRED') ||
    ['RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN'].includes(v1Status) ||
    String(input.v1SlipId || '').trim()
  ) {
    return { accepted: false, reason: 'blocked', rows: next };
  }
  const sameReceipt = next.find(
    (row) =>
      row.companyId === input.companyId &&
      row.integrationId === input.integrationId &&
      row.financeReceiptId === input.financeReceiptId,
  );
  if (!sameReceipt) {
    next.push({
      id: `bolepix-${next.length + 1}`,
      companyId: input.companyId,
      integrationId: input.integrationId,
      financeReceiptId: input.financeReceiptId,
      externalReferenceId: reference,
      status: 'RESERVED',
      attemptCount: 1,
      requestFingerprint: input.requestFingerprint,
      lastHttpStatus: null,
      c6ChargeId: null,
      retryAllowed: false,
    });
    return { accepted: true, reason: 'reserved', rows: next };
  }
  if (sameReceipt.externalReferenceId !== reference) {
    return { accepted: false, reason: 'blocked', rows: next };
  }
  if (
    sameReceipt.status === 'FAILED' &&
    sameReceipt.retryAllowed &&
    !sameReceipt.c6ChargeId &&
    sameReceipt.lastHttpStatus != null &&
    DEFINITIVE.has(sameReceipt.lastHttpStatus)
  ) {
    sameReceipt.status = 'RESERVED';
    sameReceipt.retryAllowed = false;
    sameReceipt.lastHttpStatus = null;
    sameReceipt.requestFingerprint = input.requestFingerprint;
    sameReceipt.attemptCount += 1;
    return { accepted: true, reason: 'retry', rows: next };
  }
  if (sameReceipt.status === 'UNKNOWN') {
    return { accepted: false, reason: 'needs_reconciliation', rows: next };
  }
  return { accepted: false, reason: 'blocked', rows: next };
}

export function completeC6Bolepix(
  rows: C6BolepixReservationRow[],
  input: {
    companyId: string;
    integrationId: string;
    externalReferenceId: string;
    status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    httpStatus: number | null;
    c6ChargeId?: string | null;
    retryAllowed?: boolean;
  },
): { accepted: boolean; reason: string; rows: C6BolepixReservationRow[] } {
  const reference = assertC6BolepixV2Reference(input.externalReferenceId);
  const next = rows.map((row) => ({ ...row }));
  const row = next.find(
    (item) =>
      item.companyId === input.companyId &&
      item.integrationId === input.integrationId &&
      item.externalReferenceId === reference,
  );
  if (!row || row.status === 'SUCCEEDED' || row.status === 'FAILED' || row.status === 'UNKNOWN') {
    return { accepted: false, reason: 'blocked', rows: next };
  }
  let status = input.status;
  let chargeId = String(input.c6ChargeId || '').trim() || null;
  let retry = false;
  if (status === 'SUCCEEDED' && (input.httpStatus !== 201 || !chargeId)) status = 'UNKNOWN';
  if (
    status === 'FAILED' &&
    input.retryAllowed === true &&
    !chargeId &&
    input.httpStatus != null &&
    DEFINITIVE.has(input.httpStatus)
  ) {
    retry = true;
  }
  if (status === 'FAILED') chargeId = null;
  row.status = status;
  row.c6ChargeId = chargeId;
  row.lastHttpStatus = input.httpStatus;
  row.retryAllowed = status === 'FAILED' ? retry : false;
  return { accepted: true, reason: status, rows: next };
}
