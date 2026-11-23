/**
 * Guarda somente os campos oficiais devolvidos pelo C6.
 * Campo ausente permanece vazio. Não gera linha, QR, Nosso Número nem PDF local.
 */

import { createHash } from 'node:crypto';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { readC6BolepixV2OfficialFields } from '@/lib/banking/c6/c6BolepixV2Client';
import { C6_BOLEPIX_V2_STATUS_MEANING } from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { decideC6BolepixV2Settlement, type C6BolepixV2Payment } from '@/lib/banking/c6/c6BolepixV2Status';

export type C6BolepixOfficialRecord = {
  companyId: string;
  integrationId: string;
  financeReceiptId: string;
  c6Id: string | null;
  externalReferenceId: string | null;
  digitableLine: string | null;
  barCode: string | null;
  ourNumber: string | null;
  pixCopyPaste: string | null;
  pixQrImage: string | null;
  pixMimeType: string | null;
  pixReference: string | null;
  pdfPath: string | null;
  pdfSha256: string | null;
  bankStatus: string | null;
  settlementMethod: 'BANK_SLIP' | 'PIX' | null;
  billingType: string | null;
  billingScheme: string | null;
  amount: number | null;
  dueDate: string | null;
};

function text(value: unknown): string | null {
  const clean = String(value ?? '').trim();
  return clean || null;
}

export function officialC6BolepixFromResponse(input: {
  companyId: string;
  integrationId: string;
  financeReceiptId: string;
  body: unknown;
  payments?: C6BolepixV2Payment[] | null;
  pdfBytes?: Uint8Array | null;
}): C6BolepixOfficialRecord {
  const fields = readC6BolepixV2OfficialFields(input.body);
  const raw = input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : {};
  const payment = raw.payment_method && typeof raw.payment_method === 'object'
    ? (raw.payment_method as Record<string, unknown>).pix
    : null;
  const pix = payment && typeof payment === 'object' ? (payment as Record<string, unknown>) : null;
  const decision = decideC6BolepixV2Settlement({
    status: fields?.status,
    billingType: fields?.billingType,
    payments: input.payments,
  });
  const reference = fields?.externalReferenceId || null;
  const pdfBytes = input.pdfBytes && input.pdfBytes.byteLength > 4 ? input.pdfBytes : null;
  return {
    companyId: input.companyId,
    integrationId: input.integrationId,
    financeReceiptId: input.financeReceiptId,
    c6Id: fields?.id || null,
    externalReferenceId: reference,
    digitableLine: fields?.digitableLine || null,
    barCode: fields?.barCode || null,
    ourNumber: fields?.ourNumber || null,
    pixCopyPaste: fields?.pixCopyPaste || null,
    pixQrImage: text(pix?.image_content),
    pixMimeType: text(pix?.mime_type),
    pixReference: text(pix?.reference),
    pdfPath: reference ? `/v2/bank_slips/${reference}/pdf` : null,
    pdfSha256: pdfBytes ? createHash('sha256').update(pdfBytes).digest('hex') : null,
    bankStatus: fields?.status || null,
    settlementMethod: decision.settleCash ? decision.paymentType : null,
    billingType: fields?.billingType || null,
    billingScheme: fields?.billingScheme || null,
    amount: fields?.amount ?? null,
    dueDate: fields?.dueDate || null,
  };
}

export function c6BolepixOfficialToCharge(
  record: C6BolepixOfficialRecord,
): CompanyAsaasChargeResponse | null {
  if (record.c6Id == null || record.amount == null || !record.dueDate) return null;
  const paid = record.bankStatus === 'PAID' && record.settlementMethod != null;
  const cancelled = record.bankStatus === 'CANCELED';
  const status = paid ? 'PAID' : cancelled ? 'CANCELLED' : record.c6Id ? 'REGISTERED' : 'PENDING';
  const meaning =
    record.bankStatus && record.bankStatus in C6_BOLEPIX_V2_STATUS_MEANING
      ? C6_BOLEPIX_V2_STATUS_MEANING[record.bankStatus as keyof typeof C6_BOLEPIX_V2_STATUS_MEANING]
      : 'Status bancário não reconhecido. Nenhuma baixa foi feita.';
  return {
    id: `bolepix:${record.financeReceiptId}`,
    companyId: record.companyId,
    customerId: null,
    saleId: null,
    installmentId: record.financeReceiptId,
    asaasPaymentId: record.c6Id,
    billingType: 'BOLETO',
    status,
    value: record.amount,
    dueDate: record.dueDate,
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: record.digitableLine,
    pixQrCode: record.pixQrImage,
    pixCopyPaste: record.pixCopyPaste,
    financialAccountId: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '',
    updatedAt: '',
    barCode: record.barCode,
    nossoNumero: record.ourNumber,
    c6Bolepix: {
      api: 'v2',
      externalReferenceId: record.externalReferenceId,
      bankStatus: record.bankStatus,
      billingType: record.billingType,
      pixQrAvailable: Boolean(record.pixQrImage),
      pixMimeType: record.pixMimeType,
      pdfAvailable: Boolean(record.pdfSha256),
      settlementMethod: record.settlementMethod,
      statusMessage: meaning,
    },
  };
}

export function mergeC6BolepixOfficial(
  charges: CompanyAsaasChargeResponse[],
  records: C6BolepixOfficialRecord[],
  companyId: string,
): CompanyAsaasChargeResponse[] {
  const merged = charges.map((charge) => ({ ...charge }));
  const seen = new Set(merged.map((charge) => charge.installmentId));
  for (const record of records) {
    if (record.companyId !== companyId) continue;
    if (seen.has(record.financeReceiptId)) continue;
    const view = c6BolepixOfficialToCharge(record);
    if (!view) continue;
    merged.push(view);
    seen.add(view.installmentId);
  }
  return merged;
}
