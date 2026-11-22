import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';

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
  return Array.from(byInstallment.values());
}
