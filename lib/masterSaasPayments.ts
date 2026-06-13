export type MasterSaasPayment = {
  id: string;
  company_id: string;
  subscription_id?: string | null;
  amount: number;
  paid_at: string;
  payment_method: string;
  reference_month: string;
  status: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  company_name?: string;
};

export type MasterSaasPaymentInput = {
  companyId: string;
  subscriptionId?: string | null;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  referenceMonth: string;
  notes?: string | null;
};

export function referenceMonthFromDate(isoDate: string): string {
  const d = new Date(`${isoDate.split('T')[0]}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatReferenceMonthLabel(referenceMonth: string): string {
  const [year, month] = referenceMonth.split('-');
  if (!year || !month) return referenceMonth;
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const idx = Number(month) - 1;
  if (idx < 0 || idx > 11) return referenceMonth;
  return `${monthNames[idx]}/${year}`;
}

export function isPaidMasterSaasPayment(payment: MasterSaasPayment): boolean {
  return String(payment.status || '').toLowerCase() === 'paid';
}

export function sumReceivedRevenue(payments: MasterSaasPayment[]): number {
  return payments
    .filter(isPaidMasterSaasPayment)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function lastSixMonthKeys(): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    months.push({ key, label });
  }
  return months;
}

export function buildReceivedRevenueByMonth(
  payments: MasterSaasPayment[],
): { month: string; label: string; value: number }[] {
  const template = lastSixMonthKeys();
  const map = new Map(template.map((m) => [m.key, 0]));

  for (const payment of payments) {
    if (!isPaidMasterSaasPayment(payment)) continue;
    const key = payment.reference_month || referenceMonthFromDate(payment.paid_at);
    if (!map.has(key)) continue;
    map.set(key, (map.get(key) ?? 0) + Number(payment.amount || 0));
  }

  return template.map((m) => ({
    month: m.key,
    label: m.label,
    value: map.get(m.key) ?? 0,
  }));
}

export function paymentMethodLabel(method?: string | null): string {
  const key = String(method || 'manual').toLowerCase();
  if (key === 'pix') return 'PIX';
  if (key === 'boleto') return 'Boleto';
  if (key === 'transfer') return 'Transferência';
  if (key === 'card') return 'Cartão';
  return 'Manual';
}
