/**
 * Datas de assinatura SaaS (companies + company_subscriptions).
 * Regra: primeira cobrança = data de início; próximo vencimento = início + 1 mês.
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

type BillingSubscriptionLike = {
  start_date?: string | null;
  first_payment_date?: string | null;
  next_due_date?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
};

export function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function toIsoDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const base = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/** -1 se a < b, 0 se igual, 1 se a > b */
export function compareIsoDates(a?: string | null, b?: string | null): number {
  const da = toIsoDateOnly(a);
  const db = toIsoDateOnly(b);
  if (!da && !db) return 0;
  if (!da) return -1;
  if (!db) return 1;
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

/** Próximo vencimento = mesmo dia no mês seguinte. */
export function addOneMonthToIsoDate(isoDate: string): string {
  const base = toIsoDateOnly(isoDate) || todayIsoDate();
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

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date((toIsoDateOnly(isoDate) || todayIsoDate()) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return todayIsoDate();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function dueDayFromDate(isoDate?: string | null): number {
  const d = isoDate
    ? new Date((toIsoDateOnly(isoDate) || todayIsoDate()) + 'T12:00:00')
    : new Date();
  const day = d.getDate();
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1;
}

export function clampDueDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

/** Data de ativação SaaS (início da assinatura). */
export function resolveSubscriptionStartDate(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return (
    toIsoDateOnly(company?.subscription_start_date) ||
    toIsoDateOnly(subscription?.start_date) ||
    toIsoDateOnly(company?.created_at) ||
    toIsoDateOnly(subscription?.created_at) ||
    todayIsoDate()
  );
}

/** Primeira cobrança = data de início (ativação). */
export function calculateFirstPaymentDate(startDate: string): string {
  return toIsoDateOnly(startDate) || todayIsoDate();
}

/** Próximo vencimento = mesmo dia no mês seguinte. */
export function calculateNextDueDate(startDate: string): string {
  return addOneMonthToIsoDate(startDate);
}

/** @deprecated Use calculateNextDueDate */
export function computeNextPaymentDate(startDate: string, _dueDay?: number): string {
  return calculateNextDueDate(startDate);
}

export function validateSubscriptionDateOrder(
  dates: SubscriptionBillingDates,
): string | null {
  if (compareIsoDates(dates.first_payment_date, dates.start_date) < 0) {
    return 'Primeira cobrança não pode ser anterior à data de início.';
  }
  return null;
}

/** Datas canônicas sincronizadas (contrato, tabela, ensureSaasSubscription). */
export function normalizeSubscriptionDates(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): SubscriptionBillingDates {
  const start_date = resolveSubscriptionStartDate(company, subscription);
  const first_payment_date = calculateFirstPaymentDate(start_date);
  const next_due_date = calculateNextDueDate(start_date);

  const normalized: SubscriptionBillingDates = {
    start_date,
    first_payment_date,
    next_due_date,
  };

  console.log('SAAS_SUBSCRIPTION_DATES_NORMALIZED', normalized);
  return normalized;
}

/** Alias legado */
export function normalizeSubscriptionBillingDates(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): SubscriptionBillingDates {
  return normalizeSubscriptionDates(company, subscription);
}

export function defaultNewCompanySubscriptionDates(): ResolvedSubscriptionDates {
  const start = todayIsoDate();
  return {
    subscription_start_date: start,
    first_payment_date: start,
    subscription_due_day: dueDayFromDate(start),
    next_payment_date: calculateNextDueDate(start),
  };
}

export function resolveCompanySubscriptionDates(
  company?: CompanySubscriptionDatesSource | null,
): ResolvedSubscriptionDates {
  const billing = normalizeSubscriptionDates(company, null);
  const dueDay = clampDueDay(
    Number(company?.subscription_due_day) || dueDayFromDate(billing.start_date),
  );

  return {
    subscription_start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    subscription_due_day: dueDay,
    next_payment_date: billing.next_due_date,
  };
}

export function buildCompanySubscriptionDatePayload(input: {
  subscription_start_date?: string | null;
  subscription_due_day?: number | string | null;
  next_payment_date?: string | null;
}): ResolvedSubscriptionDates {
  const start = toIsoDateOnly(input.subscription_start_date) || todayIsoDate();
  const dueDay = clampDueDay(Number(input.subscription_due_day) || dueDayFromDate(start));
  const billing = normalizeSubscriptionDates(
    { subscription_start_date: start, subscription_due_day: dueDay },
    null,
  );

  return {
    subscription_start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    subscription_due_day: dueDay,
    next_payment_date: billing.next_due_date,
  };
}

export function resolveFirstPaymentDate(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return normalizeSubscriptionDates(company, subscription).first_payment_date;
}

export function resolveNextDueDate(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return normalizeSubscriptionDates(company, subscription).next_due_date;
}

export function resolveSubscriptionStartDateForDisplay(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): string {
  return normalizeSubscriptionDates(company, subscription).start_date;
}

/** @deprecated Use resolveNextDueDate */
export function resolvePaymentDisplayDate(
  company?: CompanySubscriptionDatesSource | null,
  subscriptionNextDue?: string | null,
): string | null {
  return resolveNextDueDate(company, { next_due_date: subscriptionNextDue });
}
