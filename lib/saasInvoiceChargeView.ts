import type { MasterSaasInvoice } from '@/lib/saasBilling';
import type { SaasCharge } from '@/lib/saasCharges';

export type SaasInvoiceChargeRow = {
  invoiceId: string;
  companyId: string;
  companyName: string;
  planLabel?: string;
  referenceMonth: string;
  amount: number;
  dueDate: string;
  invoiceStatus: string;
  chargeStatus: string | null;
  asaasStatus: string;
  paymentId: string | null;
  paymentProvider: string | null;
  pixCopyPaste: string | null;
  pixQrCode: string | null;
  paymentUrl: string | null;
  chargeId: string | null;
  hasCharge: boolean;
};

export function truncatePaymentId(paymentId?: string | null, head = 8, tail = 4): string {
  const id = String(paymentId || '').trim();
  if (!id) return '—';
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function mapAsaasStatusLabel(
  charge?: Pick<SaasCharge, 'status' | 'payment_id' | 'payment_provider'> | null,
  invoice?: Pick<MasterSaasInvoice, 'external_charge_id' | 'status'> | null,
): string {
  if (charge?.payment_id) {
    const key = String(charge.status || '').toUpperCase();
    if (key === 'PAID') return 'Pago (Asaas)';
    if (key === 'OVERDUE') return 'Vencido (Asaas)';
    if (key === 'CANCELLED') return 'Cancelado (Asaas)';
    return 'Pendente (Asaas)';
  }
  const ext = String(invoice?.external_charge_id || '').trim();
  if (ext.startsWith('mock_')) return 'Mock legado';
  if (ext.startsWith('pay_')) return 'Legado Asaas';
  if (ext) return 'Legado interno';
  return 'Sem cobrança Asaas';
}

export function mapInternalChargeStatus(
  charge?: Pick<SaasCharge, 'status'> | null,
  invoice?: Pick<MasterSaasInvoice, 'status'> | null,
): string {
  if (charge?.status) return String(charge.status).toUpperCase();
  return String(invoice?.status || 'PENDENTE').toUpperCase();
}

export function buildSaasInvoiceChargeRows(
  invoices: MasterSaasInvoice[],
  charges: SaasCharge[],
): SaasInvoiceChargeRow[] {
  const chargeByInvoice = new Map<string, SaasCharge>();
  for (const ch of charges) {
    if (ch.invoice_id && !chargeByInvoice.has(ch.invoice_id)) {
      chargeByInvoice.set(ch.invoice_id, ch);
    }
  }

  return invoices.map((inv) => {
    const ch = chargeByInvoice.get(inv.id) ?? null;
    const pixCopyPaste = ch?.pix_copy_paste || inv.pix_code || null;
    const pixQrCode = ch?.pix_qr_code || inv.pix_qrcode || null;
    const paymentId = ch?.payment_id || inv.external_charge_id || null;

    return {
      invoiceId: inv.id,
      companyId: inv.company_id,
      companyName: inv.company_name || '—',
      planLabel: inv.plan_label,
      referenceMonth: inv.reference_month,
      amount: inv.final_amount,
      dueDate: inv.due_date,
      invoiceStatus: String(inv.status || 'PENDENTE').toUpperCase(),
      chargeStatus: ch?.status ? String(ch.status).toUpperCase() : null,
      asaasStatus: mapAsaasStatusLabel(ch, inv),
      paymentId,
      paymentProvider: ch?.payment_provider || (paymentId?.startsWith('pay_') ? 'asaas' : null),
      pixCopyPaste,
      pixQrCode,
      paymentUrl: ch?.payment_url || null,
      chargeId: ch?.id || null,
      hasCharge: !!ch?.id,
    };
  });
}
