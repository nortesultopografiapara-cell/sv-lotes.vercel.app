/** Utilitários de comissão de corretor — percentual 0% é valor válido. */

export const BROKER_COMMISSION_DEFAULT_PERCENT = 5;

export const BROKER_COMMISSION_PENDING_STATUSES = [
  'pendente',
  'pending',
] as const;

export const BROKER_COMMISSION_PAID_STATUSES = [
  'pago',
  'paga',
  'paid',
  'aprovado',
  'aprovada',
] as const;

export const BROKER_COMMISSION_CANCELED_STATUSES = [
  'cancelado',
  'cancelada',
  'canceled',
  'cancelled',
] as const;

export function normalizeBrokerCommissionStatus(
  status?: string | null,
): string {
  return String(status || 'pendente').trim().toLowerCase();
}

export function isPendingBrokerCommission(status?: string | null): boolean {
  const normalized = normalizeBrokerCommissionStatus(status);
  return (
    BROKER_COMMISSION_PENDING_STATUSES.includes(
      normalized as (typeof BROKER_COMMISSION_PENDING_STATUSES)[number],
    ) && !isCanceledBrokerCommission(status)
  );
}

export function isPaidBrokerCommission(status?: string | null): boolean {
  const normalized = normalizeBrokerCommissionStatus(status);
  return BROKER_COMMISSION_PAID_STATUSES.includes(
    normalized as (typeof BROKER_COMMISSION_PAID_STATUSES)[number],
  );
}

export function isCanceledBrokerCommission(status?: string | null): boolean {
  const normalized = normalizeBrokerCommissionStatus(status);
  return BROKER_COMMISSION_CANCELED_STATUSES.includes(
    normalized as (typeof BROKER_COMMISSION_CANCELED_STATUSES)[number],
  );
}

/** Leitura fiel do banco — 0 permanece 0. */
export function readBrokerCommissionPercent(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Padrão apenas para cadastro novo quando campo está vazio. */
export function defaultBrokerCommissionPercentForCreate(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined || value === '') {
    return BROKER_COMMISSION_DEFAULT_PERCENT;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return BROKER_COMMISSION_DEFAULT_PERCENT;
  return num;
}

export function resolveSaleValueForCommission(
  sale: Record<string, unknown> | null | undefined,
): number {
  if (!sale) return 0;
  const raw =
    sale.total_amount ??
    sale.agreed_price ??
    sale.lot_price ??
    sale.amount ??
    sale.sale_value ??
    sale.valor ??
    sale.price ??
    sale.total ??
    sale.value ??
    sale.total_value ??
    0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export function calculateCommissionAmount(
  saleValue: number,
  percent: number,
): number {
  if (!Number.isFinite(saleValue) || saleValue <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round(((saleValue * percent) / 100) * 100) / 100;
}

export function shouldAutoCreatePendingCommission(percent: number): boolean {
  return Number.isFinite(percent) && percent > 0;
}

export type BrokerCommissionRow = {
  id?: string;
  sale_id?: string | null;
  broker_id?: string | null;
  amount?: number | string | null;
  commission_value?: number | string | null;
  commission_percent?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
};

/** Valor monetário da comissão — compatível com `amount` e `commission_value`. */
export function resolveBrokerCommissionAmount(
  row?: BrokerCommissionRow | null,
): number {
  if (!row) return 0;
  const raw = row.amount ?? row.commission_value ?? 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export function withBrokerCommissionMonetaryFields(amount: number) {
  const value = Math.max(0, Number(amount) || 0);
  return {
    amount: value,
    commission_value: value,
  };
}

export function sumPendingBrokerCommissions(
  rows: BrokerCommissionRow[],
): number {
  return rows
    .filter((row) => isPendingBrokerCommission(row.status))
    .reduce((sum, row) => sum + resolveBrokerCommissionAmount(row), 0);
}

export function brokerDashboardPendingTotal(
  commissions: BrokerCommissionRow[],
): number {
  return sumPendingBrokerCommissions(commissions);
}

export function getSalePendingCommissionTotal(
  commissions: BrokerCommissionRow[],
  saleId: string,
  brokerId?: string | null,
): number {
  return sumPendingBrokerCommissions(
    commissions.filter((row) => {
      if (row.sale_id !== saleId) return false;
      if (brokerId && row.broker_id && row.broker_id !== brokerId) return false;
      return true;
    }),
  );
}
