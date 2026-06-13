import type { CompanySubscription } from '@/lib/saasSubscription';
import {
  formatReferenceMonthLabel,
  isPaidMasterSaasPayment,
  referenceMonthFromDate,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import { computeDaysLate } from '@/lib/masterSaasReports';

export type SaasFinancialSituation =
  | 'EM DIA'
  | 'VENCE EM BREVE'
  | 'VENCIDO'
  | 'INATIVO'
  | 'SUSPENSO';

export type SaasFinancialStatusResult = {
  situation: SaasFinancialSituation;
  companyOperationalStatus: string;
  daysLate: number;
  lastPaymentDate: string | null;
  lastPaymentReference: string | null;
  lastPaymentReferenceLabel: string | null;
};

export type SaasFinancialStatusInput = {
  company: {
    id?: string;
    active?: boolean | null;
    status_operacional?: string | null;
  };
  subscription?: CompanySubscription | null;
  nextDueDate?: string | null;
  paidReferenceMonths?: Map<string, Set<string>>;
  payments?: MasterSaasPayment[];
  today?: Date;
};

export function buildLatestPaymentByCompany(
  payments: MasterSaasPayment[],
): Map<string, MasterSaasPayment> {
  const map = new Map<string, MasterSaasPayment>();
  for (const payment of payments) {
    if (!isPaidMasterSaasPayment(payment)) continue;
    const companyId = payment.company_id;
    if (!companyId) continue;
    const existing = map.get(companyId);
    const paidAt = payment.paid_at || '';
    if (!existing || paidAt > (existing.paid_at || '')) {
      map.set(companyId, payment);
    }
  }
  return map;
}

export function formatPaymentRecordStatus(status?: string | null): string {
  const key = String(status || '').toLowerCase().trim();
  if (key === 'paid') return 'Pago';
  if (key === 'overdue') return 'Vencido';
  if (key === 'canceled') return 'Cancelado';
  if (key === 'pending') return 'Pendente';
  return status || 'Pendente';
}

export function formatPaymentHistoryDetails(payment: MasterSaasPayment): string {
  const ref = payment.reference_month
    ? formatReferenceMonthLabel(payment.reference_month)
    : '—';
  const paidAt = payment.paid_at
    ? new Date(`${payment.paid_at.split('T')[0]}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';
  const method =
    payment.payment_method === 'pix'
      ? 'PIX'
      : payment.payment_method === 'boleto'
        ? 'Boleto'
        : payment.payment_method === 'transfer'
          ? 'Transferência'
          : payment.payment_method === 'card'
            ? 'Cartão'
            : 'Manual';
  const amount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(payment.amount || 0));

  return [
    `Valor: ${amount}`,
    `Referência: ${ref}`,
    `Pago em: ${paidAt}`,
    `Forma: ${method}`,
    `Status do pagamento: ${formatPaymentRecordStatus(payment.status)}`,
  ].join(' · ');
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function resolveCompanyOperationalStatus(company: {
  active?: boolean | null;
  status_operacional?: string | null;
}): string {
  const op = (company.status_operacional || '').trim();
  if (op) return op;
  return company.active === false ? 'Inativa' : 'Ativa';
}

export function resolveSaasFinancialSituation(
  input: SaasFinancialStatusInput,
): SaasFinancialStatusResult {
  const companyId = String(input.company.id || '');
  const paidMonths = input.paidReferenceMonths ?? new Map<string, Set<string>>();
  const latestPayments = buildLatestPaymentByCompany(input.payments ?? []);
  const latest = companyId ? latestPayments.get(companyId) ?? null : null;
  const today = startOfDay(input.today ?? new Date());
  const opStatus = (input.company.status_operacional || '').toLowerCase().trim();
  const subscription = input.subscription ?? null;
  const nextDueRaw =
    input.nextDueDate ?? subscription?.next_due_date ?? null;

  const lastPaymentDate = latest?.paid_at ?? null;
  const lastPaymentReference = latest?.reference_month ?? null;
  const lastPaymentReferenceLabel = lastPaymentReference
    ? formatReferenceMonthLabel(lastPaymentReference)
    : null;

  if (subscription?.contract_status === 'suspended' || opStatus === 'suspensa') {
    return {
      situation: 'SUSPENSO',
      companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
      daysLate: 0,
      lastPaymentDate,
      lastPaymentReference,
      lastPaymentReferenceLabel,
    };
  }

  if (
    input.company.active === false ||
    opStatus === 'inativo' ||
    opStatus === 'inativa' ||
    opStatus === 'bloqueada' ||
    subscription?.contract_status === 'canceled'
  ) {
    return {
      situation: 'INATIVO',
      companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
      daysLate: 0,
      lastPaymentDate,
      lastPaymentReference,
      lastPaymentReferenceLabel,
    };
  }

  if (!nextDueRaw) {
    return {
      situation: 'EM DIA',
      companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
      daysLate: 0,
      lastPaymentDate,
      lastPaymentReference,
      lastPaymentReferenceLabel,
    };
  }

  const due = startOfDay(
    new Date(`${String(nextDueRaw).split('T')[0]}T12:00:00`),
  );
  const competencyMonth = referenceMonthFromDate(String(nextDueRaw).split('T')[0]);
  const hasCompetencyPaid = paidMonths.get(companyId)?.has(competencyMonth) ?? false;

  if (due.getTime() < today.getTime()) {
    if (!hasCompetencyPaid) {
      return {
        situation: 'VENCIDO',
        companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
        daysLate: computeDaysLate(nextDueRaw),
        lastPaymentDate,
        lastPaymentReference,
        lastPaymentReferenceLabel,
      };
    }
    return {
      situation: 'EM DIA',
      companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
      daysLate: 0,
      lastPaymentDate,
      lastPaymentReference,
      lastPaymentReferenceLabel,
    };
  }

  const daysUntil = daysBetween(today, due);
  if (daysUntil <= 7) {
    return {
      situation: 'VENCE EM BREVE',
      companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
      daysLate: 0,
      lastPaymentDate,
      lastPaymentReference,
      lastPaymentReferenceLabel,
    };
  }

  return {
    situation: 'EM DIA',
    companyOperationalStatus: resolveCompanyOperationalStatus(input.company),
    daysLate: 0,
    lastPaymentDate,
    lastPaymentReference,
    lastPaymentReferenceLabel,
  };
}

export function financialSituationTone(
  situation: SaasFinancialSituation | string,
): 'success' | 'warning' | 'danger' | 'muted' | 'orange' {
  switch (situation) {
    case 'EM DIA':
      return 'success';
    case 'VENCE EM BREVE':
      return 'warning';
    case 'VENCIDO':
      return 'danger';
    case 'SUSPENSO':
      return 'orange';
    default:
      return 'muted';
  }
}
