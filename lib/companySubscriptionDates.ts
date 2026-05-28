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
  subscription_due_day: number;
  next_payment_date: string;
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

/** Próximo vencimento = início + 30 dias (ciclo mensal inicial). */
export function computeNextPaymentDate(
  startDate: string,
  _dueDay?: number,
  cycleDays = 30,
): string {
  return addDaysToIsoDate(startDate, cycleDays);
}

export function defaultNewCompanySubscriptionDates(): ResolvedSubscriptionDates {
  const start = todayIsoDate();
  return {
    subscription_start_date: start,
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

  const next =
    company?.next_payment_date ||
    company?.vencimento_plano ||
    computeNextPaymentDate(start, dueDay);

  return {
    subscription_start_date: start,
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
  const next =
    input.next_payment_date || computeNextPaymentDate(start, dueDay);
  return {
    subscription_start_date: start,
    subscription_due_day: dueDay,
    next_payment_date: next,
  };
}

export function resolvePaymentDisplayDate(
  company?: CompanySubscriptionDatesSource | null,
  subscriptionNextDue?: string | null,
): string | null {
  const dates = resolveCompanySubscriptionDates(company);
  return subscriptionNextDue || dates.next_payment_date || null;
}
