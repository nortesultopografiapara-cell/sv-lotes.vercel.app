/**
 * Datas de assinatura SaaS (companies + company_subscriptions).
 * Regra: primeira cobrança = data de início; próximo vencimento = mês seguinte no dia de vencimento.
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

/** ISO date no mesmo mês/ano do anchor com o dia informado (ajustado ao fim do mês). */
export function isoDateWithDay(anchorIso: string, day: number): string {
  const anchor = toIsoDateOnly(anchorIso) || todayIsoDate();
  const [year, month] = anchor.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const d = Math.min(Math.max(1, clampDueDay(day)), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Dia de vencimento mensal explícito ou derivado da data de início. */
export function resolveSubscriptionDueDay(
  company?: CompanySubscriptionDatesSource | null,
  startDate?: string,
): number {
  const fromCompany = Number(company?.subscription_due_day);
  if (Number.isFinite(fromCompany) && fromCompany >= 1 && fromCompany <= 31) {
    return clampDueDay(fromCompany);
  }
  return dueDayFromDate(startDate);
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

/** Próximo vencimento = mês seguinte ao início, no dia de vencimento mensal. */
export function calculateNextDueDateWithDueDay(startDate: string, dueDay: number): string {
  const start = toIsoDateOnly(startDate) || todayIsoDate();
  const nextMonthAnchor = addOneMonthToIsoDate(start);
  return isoDateWithDay(nextMonthAnchor, dueDay);
}

/** Próximo vencimento (compatível: usa dia da start se dueDay omitido). */
export function calculateNextDueDate(startDate: string, dueDay?: number): string {
  const start = toIsoDateOnly(startDate) || todayIsoDate();
  const day = dueDay != null ? clampDueDay(dueDay) : dueDayFromDate(start);
  return calculateNextDueDateWithDueDay(start, day);
}

export function computeNextPaymentDate(startDate: string, dueDay?: number): string {
  const start = toIsoDateOnly(startDate) || todayIsoDate();
  const day = clampDueDay(dueDay ?? dueDayFromDate(start));
  return calculateNextDueDateWithDueDay(start, day);
}

export function validateSubscriptionDateOrder(
  dates: SubscriptionBillingDates,
): string | null {
  if (compareIsoDates(dates.first_payment_date, dates.start_date) < 0) {
    return 'Primeira cobrança não pode ser anterior à data de início.';
  }
  return null;
}

/** Datas do PDF: somente campos gravados em company_subscriptions (sem created_at / new Date). */
export function subscriptionDatesForContractPdf(subscription: {
  start_date?: string | null;
  first_payment_date?: string | null;
  next_due_date?: string | null;
}): SubscriptionBillingDates {
  const start_date = toIsoDateOnly(subscription.start_date);
  const first_payment_date = toIsoDateOnly(subscription.first_payment_date);
  const next_due_date = toIsoDateOnly(subscription.next_due_date);

  if (!start_date || !first_payment_date || !next_due_date) {
    throw new Error(
      'Datas da assinatura incompletas no banco (start_date, first_payment_date, next_due_date).',
    );
  }

  const dates = { start_date, first_payment_date, next_due_date };
  const orderError = validateSubscriptionDateOrder(dates);
  if (orderError) throw new Error(orderError);

  console.log('SAAS_CONTRACT_PDF_DATES_FROM_SUBSCRIPTION', dates);
  return dates;
}

/** Datas canônicas sincronizadas (contrato, tabela, ensureSaasSubscription). */
export function normalizeSubscriptionDates(
  company?: CompanySubscriptionDatesSource | null,
  subscription?: BillingSubscriptionLike | null,
): SubscriptionBillingDates {
  const start_date = resolveSubscriptionStartDate(company, subscription);
  const dueDay = resolveSubscriptionDueDay(company, start_date);
  const first_payment_date = calculateFirstPaymentDate(start_date);

  const explicitNext =
    toIsoDateOnly(company?.next_payment_date) ||
    toIsoDateOnly(company?.vencimento_plano);

  const next_due_date =
    explicitNext || calculateNextDueDateWithDueDay(start_date, dueDay);

  const normalized: SubscriptionBillingDates = {
    start_date,
    first_payment_date,
    next_due_date,
  };

  console.log('SAAS_SUBSCRIPTION_DATES_NORMALIZED', { ...normalized, dueDay });
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
  const dueDay = dueDayFromDate(start);
  return {
    subscription_start_date: start,
    first_payment_date: start,
    subscription_due_day: dueDay,
    next_payment_date: calculateNextDueDateWithDueDay(start, dueDay),
  };
}

export function resolveCompanySubscriptionDates(
  company?: CompanySubscriptionDatesSource | null,
): ResolvedSubscriptionDates {
  const billing = normalizeSubscriptionDates(company, null);
  const dueDay = resolveSubscriptionDueDay(company, billing.start_date);

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
  const explicitNext = toIsoDateOnly(input.next_payment_date);
  const next_payment_date =
    explicitNext || calculateNextDueDateWithDueDay(start, dueDay);
  const first_payment_date = calculateFirstPaymentDate(start);

  return {
    subscription_start_date: start,
    first_payment_date,
    subscription_due_day: dueDay,
    next_payment_date,
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
