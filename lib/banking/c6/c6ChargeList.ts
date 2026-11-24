import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  mergeC6BolepixOfficial,
  type C6BolepixOfficialRecord,
} from '@/lib/banking/c6/c6BolepixV2Official';
import { describeC6BolepixV2Outcome } from '@/lib/banking/c6/c6BolepixV2Issue';

const CHARGE_COLUMNS =
  'id, company_id, customer_id, sale_id, finance_receipt_id, financial_account_id, external_id, amount, due_date, status, barcode, digitable_line, our_number, paid_at, created_at, updated_at';

export function c6BankChargeToResponse(
  row: Record<string, unknown>,
  companyId: string,
): CompanyAsaasChargeResponse {
  const statusRaw = String(row.status || '').toUpperCase();
  const status =
    statusRaw === 'PAID'
      ? 'PAID'
      : statusRaw === 'CANCELLED'
        ? 'CANCELLED'
        : statusRaw === 'EXPIRED'
          ? 'EXPIRED'
          : statusRaw === 'FAILED'
            ? 'FAILED'
            : statusRaw === 'REGISTERED'
              ? 'REGISTERED'
              : 'PENDING';
  return {
    id: String(row.id),
    companyId,
    customerId: row.customer_id ? String(row.customer_id) : null,
    saleId: row.sale_id ? String(row.sale_id) : null,
    installmentId: String(row.finance_receipt_id || ''),
    asaasPaymentId: String(row.external_id || ''),
    billingType: 'BOLETO',
    status,
    value: Number(row.amount || 0),
    dueDate: String(row.due_date || ''),
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: row.digitable_line ? String(row.digitable_line) : null,
    pixQrCode: null,
    pixCopyPaste: null,
    nossoNumero: row.our_number ? String(row.our_number) : null,
    financialAccountId: row.financial_account_id ? String(row.financial_account_id) : null,
    paymentLink: null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    barCode: row.barcode ? String(row.barcode) : null,
    asaasRemoteStatus: status,
  };
}

export async function listC6ChargesForInstallments(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<CompanyAsaasChargeResponse[]> {
  const ids = installmentIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await admin
    .from('bank_charges')
    .select(CHARGE_COLUMNS)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .in('finance_receipt_id', ids);
  if (error) throw new Error(error.message);
  const byInstallment = new Map<string, CompanyAsaasChargeResponse>();
  for (const row of data || []) {
    const charge = c6BankChargeToResponse(row as Record<string, unknown>, companyId);
    if (!charge.installmentId || !charge.asaasPaymentId) continue;
    const previous = byInstallment.get(charge.installmentId);
    if (!previous || (charge.status === 'REGISTERED' && previous.status !== 'PAID')) {
      byInstallment.set(charge.installmentId, charge);
    }
  }
  const charges = Array.from(byInstallment.values());
  const merged = await mergeC6BolepixOfficial(charges, await loadC6BolepixOfficial(admin, companyId, ids), companyId);
  const present = new Set(merged.map((charge) => charge.installmentId));
  const attempts = await loadC6BolepixAttempts(admin, companyId, ids.filter((id) => !present.has(id)));
  return [...merged, ...attempts];
}

async function loadC6BolepixAttempts(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<CompanyAsaasChargeResponse[]> {
  if (!installmentIds.length) return [];
  const { data, error } = await admin
    .from('c6_bolepix_reservations')
    .select('finance_receipt_id, status, last_http_status, c6_charge_id, external_reference_id')
    .eq('company_id', companyId)
    .in('finance_receipt_id', installmentIds);
  if (error) {
    const message = String(error.message || '');
    if (/c6_bolepix_reservations|does not exist|schema cache|Could not find the table/i.test(message)) return [];
    throw new Error('Não foi possível ler a tentativa C6.');
  }
  const prepared = await loadPreparedAttemptIds(admin, companyId, installmentIds);
  return (data || []).flatMap((row) => {
    const record = row as Record<string, unknown>;
    const installmentId = String(record.finance_receipt_id || '');
    const httpStatus = record.last_http_status == null ? null : Number(record.last_http_status);
    const described = describeC6BolepixV2Outcome({
      status: record.status == null ? null : String(record.status),
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : null,
      chargeId: record.c6_charge_id == null ? null : String(record.c6_charge_id),
    });
    if (!installmentId || described.kind === 'succeeded') return [];
    return [
      {
        id: `c6-attempt-${installmentId}`,
        companyId,
        customerId: null,
        saleId: null,
        installmentId,
        asaasPaymentId: '',
        billingType: 'BOLETO',
        status: described.kind === 'rejected' || described.kind === 'authentication' ? 'FAILED' : 'PENDING',
        value: 0,
        dueDate: '',
        invoiceUrl: null,
        bankSlipUrl: null,
        bankSlipIdentification: null,
        pixQrCode: null,
        pixCopyPaste: null,
        financialAccountId: null,
        paymentLink: null,
        paidAt: null,
        createdAt: '',
        updatedAt: '',
        c6Attempt: {
          kind: described.kind,
          message: described.message,
          httpStatus: Number.isFinite(httpStatus) ? httpStatus : null,
          prepared: prepared.has(installmentId),
        },
      },
    ];
  });
}

async function loadPreparedAttemptIds(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<Set<string>> {
  const ready = new Set<string>();
  if (!installmentIds.length) return ready;
  const { data, error } = await admin
    .from('c6_bolepix_attempts')
    .select('finance_receipt_id, status, c6_charge_id, last_http_status')
    .eq('company_id', companyId)
    .in('finance_receipt_id', installmentIds);
  if (error) {
    const message = String(error.message || '');
    if (/c6_bolepix_attempts|does not exist|schema cache|Could not find the table/i.test(message)) return ready;
    throw new Error('Não foi possível ler a tentativa preparada.');
  }
  for (const row of data || []) {
    const record = row as Record<string, unknown>;
    const status = String(record.status || '').toUpperCase();
    if (status === 'RESERVED' && !record.c6_charge_id && record.last_http_status == null) {
      ready.add(String(record.finance_receipt_id || ''));
    }
  }
  return ready;
}

async function loadC6BolepixOfficial(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<C6BolepixOfficialRecord[]> {
  const { data, error } = await admin
    .from('c6_bolepix_official')
    .select(
      'company_id, integration_id, finance_receipt_id, c6_id, external_reference_id, digitable_line, bar_code, our_number, pix_copy_paste, pix_qr_image, pix_mime_type, pix_reference, pdf_path, pdf_sha256, bank_status, settlement_method, billing_type, billing_scheme, amount, due_date',
    )
    .eq('company_id', companyId)
    .in('finance_receipt_id', installmentIds);
  if (error) {
    const message = String(error.message || '');
    if (/c6_bolepix_official|does not exist|schema cache|Could not find the table/i.test(message)) return [];
    throw new Error(message);
  }
  return (data || []).map((row) => {
    const record = row as Record<string, unknown>;
    const settlement = record.settlement_method === 'BANK_SLIP' || record.settlement_method === 'PIX'
      ? record.settlement_method
      : null;
    return {
      companyId: String(record.company_id || ''),
      integrationId: String(record.integration_id || ''),
      financeReceiptId: String(record.finance_receipt_id || ''),
      c6Id: record.c6_id ? String(record.c6_id) : null,
      externalReferenceId: record.external_reference_id ? String(record.external_reference_id) : null,
      digitableLine: record.digitable_line ? String(record.digitable_line) : null,
      barCode: record.bar_code ? String(record.bar_code) : null,
      ourNumber: record.our_number ? String(record.our_number) : null,
      pixCopyPaste: record.pix_copy_paste ? String(record.pix_copy_paste) : null,
      pixQrImage: record.pix_qr_image ? String(record.pix_qr_image) : null,
      pixMimeType: record.pix_mime_type ? String(record.pix_mime_type) : null,
      pixReference: record.pix_reference ? String(record.pix_reference) : null,
      pdfPath: record.pdf_path ? String(record.pdf_path) : null,
      pdfSha256: record.pdf_sha256 ? String(record.pdf_sha256) : null,
      bankStatus: record.bank_status ? String(record.bank_status) : null,
      settlementMethod: settlement,
      billingType: record.billing_type ? String(record.billing_type) : null,
      billingScheme: record.billing_scheme ? String(record.billing_scheme) : null,
      amount: record.amount == null ? null : Number(record.amount),
      dueDate: record.due_date ? String(record.due_date) : null,
    };
  });
}
