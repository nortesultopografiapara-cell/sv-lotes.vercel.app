import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { CanonicalFinanceTotals, CanonicalFinanceReport } from './canonicalFinanceTypes';

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function isoDatePart(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const beforeT = raw.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(beforeT) ? beforeT : '';
}

export function isIsoDateInRange(iso: string, start: string, end: string): boolean {
  if (start && iso && iso < start) return false;
  if (end && iso && iso > end) return false;
  if ((start || end) && !iso) return false;
  return true;
}

export function formatDateBr(iso: string | null | undefined): string {
  const part = isoDatePart(iso);
  if (!part) return '—';
  const [y, m, d] = part.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  if (!/T\d{2}:/.test(raw)) return formatDateBr(raw);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return formatDateBr(raw);
  return parsed.toLocaleString('pt-BR');
}

export function formatMoneyBr(value: number): string {
  const formatted = formatCurrencyBRL(Number(value) || 0);
  return formatted || 'R$ 0,00';
}

export function formatInstallmentLabel(
  installmentNumber: unknown,
  installmentsCount?: unknown,
): string {
  const n = Number(installmentNumber);
  if (n === 0) return 'Entrada';
  if (n === -1) return 'Sinal';
  const current = Number.isFinite(n) ? n : 1;
  const max = Number(installmentsCount);
  if (Number.isFinite(max) && max > 0) return `Parcela ${current}/${max}`;
  return `Parcela ${current}`;
}

export function formatWalletStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pago' || s === 'paid') return 'Pago';
  if (s === 'atrasado' || s === 'overdue') return 'Vencido';
  if (s === 'cancelado' || s === 'canceled' || s === 'cancelled') return 'Cancelado';
  return 'Pendente';
}

export function computeWalletStatus(
  rawStatus: unknown,
  dueDateIso: string,
  todayIso: string,
): string {
  const pStatus = String(rawStatus || 'pendente').toLowerCase();
  if (
    (pStatus === 'pendente' || pStatus === 'pending') &&
    dueDateIso &&
    dueDateIso < todayIso
  ) {
    return 'atrasado';
  }
  if (pStatus === 'paid') return 'pago';
  if (pStatus === 'overdue') return 'atrasado';
  if (pStatus === 'canceled' || pStatus === 'cancelled') return 'cancelado';
  return pStatus;
}

export function getCanonicalFinanceTotals(
  report: CanonicalFinanceReport,
): CanonicalFinanceTotals {
  return {
    walletReceived: roundMoney(report.wallet.receivedInPeriod),
    walletToReceive: roundMoney(report.wallet.toReceive),
    walletOverdue: roundMoney(report.wallet.overdue),
    qtyPaid: report.wallet.qtyPaid,
    qtyPending: report.wallet.qtyPending,
    qtyOverdue: report.wallet.qtyOverdue,
    cashOpening: roundMoney(report.cash.openingBalance),
    cashInflows: roundMoney(report.cash.inflows),
    cashOutflows: roundMoney(report.cash.outflows),
    cashClosing: roundMoney(report.cash.closingBalance),
    destinationsTotal: roundMoney(report.destinations.grossPredictedTotal ?? report.destinations.total),
    destinationsGrossPredicted: roundMoney(
      report.destinations.grossPredictedTotal ?? report.destinations.total,
    ),
    destinationsNetConfirmed: roundMoney(report.destinations.netConfirmedTotal || 0),
    walletMovementCount: report.wallet.movements.length,
    cashMovementCount: report.cash.movements.length,
    destinationRowCount: report.destinations.rows.length,
  };
}

export function financeReportFilename(
  kind: 'resumido' | 'completo',
  ext: 'pdf' | 'xlsx',
  now = new Date(),
): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `relatorio-financeiro-${kind}-${y}-${m}-${d}.${ext}`;
}
