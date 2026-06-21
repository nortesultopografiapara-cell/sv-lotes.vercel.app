import type { MasterSaasInvoice } from '@/lib/saasBilling';
import type { SaasCharge } from '@/lib/saasCharges';
import {
  canDeleteCancelledSaasCharge,
  isSaasChargeActiveForDisplay,
  isSaasChargeSelectableForInvoiceRow,
} from '@/lib/saasCharges';

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
  billingType: 'PIX' | 'BOLETO';
  pixCopyPaste: string | null;
  pixQrCode: string | null;
  paymentUrl: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  bankSlipIdentification: string | null;
  chargeId: string | null;
  hasCharge: boolean;
  finePercent?: number | null;
  interestPercent?: number | null;
  lateFeeEnabled?: boolean | null;
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

function chargeDisplayScore(charge: SaasCharge): number {
  let score = 0;
  if (isSaasChargeActiveForDisplay(charge)) score += 200;
  if (canDeleteCancelledSaasCharge(charge.status)) score += 50;
  if (String(charge.payment_id || '').trim()) score += 50;
  if (String(charge.pix_copy_paste || '').trim()) score += 30;
  if (String(charge.pix_qr_code || '').trim()) score += 20;
  if (String(charge.payment_url || '').trim()) score += 10;
  return score;
}

/** Prefer charge real (payment_id + PIX) sobre órfãs/canceladas na mesma fatura. */
export function pickBestChargeForInvoice(
  charges: SaasCharge[],
  invoiceId: string,
): SaasCharge | null {
  const candidates = charges.filter(
    (c) => c.invoice_id === invoiceId && isSaasChargeSelectableForInvoiceRow(c),
  );
  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const scoreDiff = chargeDisplayScore(b) - chargeDisplayScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  })[0];
}

export function buildSaasInvoiceChargeRows(
  invoices: MasterSaasInvoice[],
  charges: SaasCharge[],
): SaasInvoiceChargeRow[] {
  const chargeByInvoice = new Map<string, SaasCharge>();
  for (const inv of invoices) {
    const best = pickBestChargeForInvoice(charges, inv.id);
    if (best) chargeByInvoice.set(inv.id, best);
  }

  return invoices
    .map((inv) => {
    const ch = chargeByInvoice.get(inv.id) ?? null;
    const pixCopyPaste = ch?.pix_copy_paste || inv.pix_code || null;
    const pixQrCode = ch?.pix_qr_code || inv.pix_qrcode || null;
    const paymentId = ch?.payment_id || inv.external_charge_id || null;
    const billingType =
      ch?.billing_type === 'BOLETO' || String(inv.payment_method || '').toLowerCase() === 'boleto'
        ? 'BOLETO'
        : 'PIX';

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
      billingType,
      pixCopyPaste,
      pixQrCode,
      paymentUrl: ch?.payment_url || ch?.invoice_url || null,
      invoiceUrl: ch?.invoice_url || ch?.payment_url || null,
      bankSlipUrl: ch?.bank_slip_url || null,
      bankSlipIdentification: ch?.bank_slip_identification || null,
      chargeId: ch?.id || null,
      hasCharge: !!ch?.id,
      finePercent: ch?.fine_percent ?? null,
      interestPercent: ch?.interest_percent ?? null,
      lateFeeEnabled: ch?.late_fee_enabled ?? null,
    };
  })
    .filter((row) => {
      if (row.hasCharge) return true;
      const st = row.invoiceStatus.toUpperCase();
      if (st === 'PAGO' || st === 'VENCIDO') return true;
      if (String(row.paymentId || '').trim()) return true;
      return false;
    });
}
