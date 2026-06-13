import { computeDaysLate } from '@/lib/masterSaasReports';

export type SubscriptionAction = 'suspend' | 'reactivate' | 'renew';

export async function runMasterSubscriptionAction(params: {
  userId: string;
  subscriptionId: string;
  companyId: string;
  action: SubscriptionAction;
}): Promise<void> {
  const res = await fetch('/api/master/subscription-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'Falha na operação de assinatura');
  }
}

export function subscriptionDaysLate(nextDueDate?: string | null, paymentStatus?: string | null): number {
  const status = String(paymentStatus || '').toLowerCase();
  if (status === 'overdue') {
    return Math.max(1, computeDaysLate(nextDueDate));
  }
  return computeDaysLate(nextDueDate);
}

export function subscriptionFinanceLabel(paymentStatus?: string | null): string {
  const key = String(paymentStatus || 'pending').toLowerCase();
  if (key === 'paid') return 'Em dia';
  if (key === 'overdue') return 'Inadimplente';
  if (key === 'canceled') return 'Cancelado';
  return 'Aguardando cobrança';
}
