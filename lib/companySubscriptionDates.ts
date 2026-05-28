/**
 * Datas de assinatura SaaS (companies + company_subscriptions).
 */

export type CompanySubscriptionDatesSource = {
  subscription_start_date?: string | null;
  subscription_due_day?: number | string | null;
  next_payment_date?: string | null;
  vencimento_plano?: string | null;
  created_at?: string | null;
};

export type ResolvedSubscriptionDates = {
  subscription_start_date: string;
  first_payment_date: string;
  subscription_due_day: number;
  next_payment_date: string;
};

export type SubscriptionBillingDates = {
  start_date: string;
  first_payment_date: string;
  next_due_date: string;
};

export function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return todayIsoDate();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Próximo vencimento = mesmo dia no mês seguinte. */
export function addOneMonthToIsoDate(isoDate: string): string {
  const base = isoDate.split('T')[0];
  const parts = base.split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    return todayIsoDate();
  }
  let [year, month, day] = parts;
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const lastDay = new Date(year, month, 0).getDate();
  if (day > lastDay) day = lastDay;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dueDayFromDate(isoDate?: string | null): number {
  const d = isoDate
    ? new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`)
    : new Date();
  const day = d.getDate();
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
}

export function clampDueDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

/** Próximo vencimento mensal = início + 1 mês (mesmo dia). */
export function computeNextPaymentDate(
  startDate: string,
  _dueDay?: number,
): string {
  return addOneMonthToIsoDate(startDate);
}

export function defaultNewCompanySubscriptionDates(): ResolvedSubscriptionDates {
  const start = todayIsoDate();
  return {
    subscription_start_date: start,
    first_payment_date: start,
    subscription_due_day: dueDayFromDate(start),
    next_payment_date: computeNextPaymentDate(start),
  };
}

export function resolveCompanySubscriptionDates(
  company?: CompanySubscriptionDatesSource | null,
): ResolvedSubscriptionDates {
  const today = todayIsoDate();
  const created =
    company?.created_at?.split('T')[0] ||
    company?.created_at?.slice(0, 10) ||
    null;

  const start =
    company?.subscription_start_date ||
    created ||
    today;

  const dueDay = clampDueDay(
    Number(company?.subscription_due_day) || dueDayFromDate(start),
  );

  const first = start;
  const next = computeNextPaymentDate(start, dueDay);

  return {
    subscription_start_date: start,
    first_payment_date: first,
    subscription_due_day: dueDay,
    next_payment_date: next,
  };
}

export function buildCompanySubscriptionDatePayload(input: {
  subscription_start_date?: string | null;
  subscription_due_day?: number | string | null;
  next_payment_date?: string | null;
}): ResolvedSubscriptionDates {
  const start = input.subscription_start_date || todayIsoDate();
  const dueDay = clampDueDay(Number(input.subscription_due_day) || dueDayFromDate(start));
  const first = start;
  const next =
    input.next_payment_date || computeNextPaymentDate(start, dueDay);
  return {
    subscription_start_date: start,
    first_payment_date: first,
    subscription_due_day: dueDay,
    next_payment_date: next,
  };
}

type BillingSubscriptionLike = {
  start_date?: string | null;
  first_payment_date?: string | null;
  next_due_date?: string | null;
  payment_status?: string | null;
};

/** Datas canônicas para assinatura SaaS (sync, contrato, tabela). */
export function normalizeSubscriptionBillingDates(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): SubscriptionBillingDates {
  const dates = resolveCompanySubscriptionDates(company);
  const paymentPending =
    !subscription?.payment_status ||
    String(subscription.payment_status).toLowerCase() === 'pending';

  let start = company?.subscription_start_date || null;
  if (!start && paymentPending) {
    start = todayIsoDate();
  }
  if (!start) {
    start =
      subscription?.start_date ||
      subscription?.first_payment_date ||
      dates.subscription_start_date;
  }

  const first = subscription?.first_payment_date || start;
  const expectedNext = computeNextPaymentDate(start);
  const rawNext = subscription?.next_due_date;

  let next = rawNext || dates.next_payment_date;
  if (
    paymentPending &&
    (!rawNext ||
      rawNext === start ||
      rawNext === first ||
      rawNext !== expectedNext)
  ) {
    next = expectedNext;
  }

  return {
    start_date: start,
    first_payment_date: first,
    next_due_date: next,
  };
}

export function resolveFirstPaymentDate(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return normalizeSubscriptionBillingDates(company, subscription).first_payment_date;
}

export function resolveNextDueDate(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return normalizeSubscriptionBillingDates(company, subscription).next_due_date;
}

/** @deprecated Use resolveNextDueDate — não usar next_due como primeira cobrança. */
export function resolvePaymentDisplayDate(
  company?: CompanySubscriptionDatesSource | null,
  subscriptionNextDue?: string | null,
): string | null {
  return resolveNextDueDate(company, { next_due_date: subscriptionNextDue });
}
