const PAID = new Set(['pago', 'paid']);
const CLOSED_SALE = new Set([
  'cancelada',
  'cancelado',
  'cancelled',
  'canceled',
  'distratada',
  'rescindida',
  'encerrada',
]);
const CLOSED_CHARGE = new Set(['CANCELLED', 'CANCELED']);

function saleStatus(payment: Record<string, unknown>): string {
  const sales = payment.sales;
  if (!sales || typeof sales !== 'object' || Array.isArray(sales)) return '';
  return String((sales as { status?: unknown }).status || '').trim().toLowerCase();
}

/** Ação discreta da parcela 0 marcada como paga por inteiro, ainda no cronograma antigo. */
export function legacySignalParcelActionVisible(
  payment: Record<string, unknown>,
  extras?: { asaasStatus?: string | null },
): boolean {
  const number = Number(payment.installment_number);
  if (number !== 0) return false;
  if (String(payment.schedule_group || '').trim()) return false;
  if (!PAID.has(String(payment.status || '').trim().toLowerCase())) return false;
  if (!String(payment.paid_at || '').trim()) return false;
  const amountCents = Math.round(Number(payment.amount) * 100);
  const paidCents = Math.round(Number(payment.paid_amount ?? payment.amount) * 100);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || paidCents !== amountCents) return false;
  if (String(payment.financial_account_id || '').trim()) return false;
  const status = saleStatus(payment);
  if (status && CLOSED_SALE.has(status)) return false;
  const charge = String(extras?.asaasStatus || '').trim().toUpperCase();
  if (charge && !CLOSED_CHARGE.has(charge)) return false;
  return true;
}
