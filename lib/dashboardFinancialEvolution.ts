/**
 * Evolução financeira do Dashboard — agrupamento mensal READ-ONLY.
 * Usa os mesmos critérios de calculateFinancialTotals; só recorta por mês
 * para apresentação (mês atual + 5 anteriores). Não altera a fórmula.
 */

import {
  collectInstallmentIdsWithCashEntrada,
  getCashMovementMetadata,
  shouldCountPaidReceiptInCashFlow,
} from '@/lib/financeCashFlow';

export const DASHBOARD_EVOLUTION_MONTHS = 6;

export type DashboardEvolutionPoint = {
  key: string;
  name: string;
  entradas: number;
  saidas: number;
};

const MONTH_LABELS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/** YYYY-MM a partir de data canônica (paid_at / movement_date / created_at). */
export function monthKeyFromFinanceDate(value: unknown): string | null {
  const iso = String(value || '').trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso) && !/^\d{4}-\d{2}$/.test(iso)) return null;
  return iso.slice(0, 7);
}

export function formatDashboardMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const idx = Number(month) - 1;
  if (!year || idx < 0 || idx > 11) return monthKey;
  return `${MONTH_LABELS_PT[idx]}/${year}`;
}

/** Janela móvel: mês de referência + 5 anteriores. Sem meses futuros. */
export function buildRollingMonthWindow(
  referenceDate: Date,
  size = DASHBOARD_EVOLUTION_MONTHS,
): string[] {
  const keys: string[] = [];
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();
  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(year, monthIndex - offset, 1);
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    keys.push(key);
  }
  return keys;
}

function isCashSaidaForTotals(typeStr: string): boolean {
  return ['saida', 'saída', 'saida ', 'despesa', 'expense'].some((val) =>
    typeStr.includes(val),
  );
}

function emptyPoint(key: string): DashboardEvolutionPoint {
  return {
    key,
    name: formatDashboardMonthLabel(key),
    entradas: 0,
    saidas: 0,
  };
}

/**
 * Agrupa em memória os mesmos componentes de calculateFinancialTotals.
 * Datas: receipts paid_at||due_date||created_at; caixa movement_date||created_at;
 * comissões paid_at||created_at — as mesmas de buildCashFlowItems.
 */
export function buildDashboardFinancialEvolution(
  receipts: any[],
  cashMvs: any[],
  comms: any[],
  referenceDate: Date,
): DashboardEvolutionPoint[] {
  const windowKeys = buildRollingMonthWindow(referenceDate);
  const byMonth = new Map(windowKeys.map((key) => [key, emptyPoint(key)]));

  const safeReceipts = receipts || [];
  const safeCash = cashMvs || [];
  const safeComms = comms || [];
  const installmentsWithCash = collectInstallmentIdsWithCashEntrada(safeCash);

  safeReceipts.forEach((r) => {
    const status = (r.status || '').toLowerCase();
    if (status !== 'pago' && status !== 'paid') return;
    if (!shouldCountPaidReceiptInCashFlow(String(r.id || ''), installmentsWithCash)) {
      return;
    }
    const amount = Number(r.paid_amount) || Number(r.amount) || 0;
    const key = monthKeyFromFinanceDate(r.paid_at || r.due_date || r.created_at);
    const bucket = key ? byMonth.get(key) : undefined;
    if (!bucket) return;
    bucket.entradas += amount;
  });

  safeCash.forEach((c) => {
    const status = (c.status || 'ativo').toLowerCase();
    if (status === 'estornado' || status === 'cancelado' || status === 'deleted') {
      return;
    }
    const typeStr = (c.type || '').toLowerCase();
    const isSaidaStr = isCashSaidaForTotals(typeStr);
    const isEntradaStr = typeStr.includes('entrada');
    const amount = Number(c.amount || 0);
    const key = monthKeyFromFinanceDate(c.movement_date || c.created_at);
    const bucket = key ? byMonth.get(key) : undefined;
    if (!bucket) return;
    if (isEntradaStr && !isSaidaStr) {
      bucket.entradas += amount;
    }
    if (isSaidaStr) {
      bucket.saidas += amount;
    }
  });

  safeComms.forEach((cm) => {
    const cmStatus = (cm.status || '').toLowerCase();
    const isCommPaid = ['pago', 'paga', 'paid', 'aprovado', 'aprovada'].includes(
      cmStatus,
    );
    if (!isCommPaid) return;

    const amount = Number(cm.amount || 0);
    const duplicatedInCash = safeCash.some((c) => {
      const st = (c.status || 'ativo').toLowerCase();
      if (st === 'estornado' || st === 'cancelado' || st === 'deleted') {
        return false;
      }
      const typeStr = (c.type || '').toLowerCase();
      const isSaidaStr = isCashSaidaForTotals(typeStr);
      if (!isSaidaStr) return false;
      const cMd = getCashMovementMetadata(c);
      const brokerMatch =
        cm.broker_id &&
        (cMd.broker_id === cm.broker_id || c.broker_id === cm.broker_id);
      return (
        (c.sale_id === cm.sale_id || brokerMatch) &&
        Math.abs(Number(c.amount) - amount) < 1
      );
    });
    if (duplicatedInCash) return;

    const key = monthKeyFromFinanceDate(cm.paid_at || cm.created_at);
    const bucket = key ? byMonth.get(key) : undefined;
    if (!bucket) return;
    bucket.saidas += amount;
  });

  return windowKeys.map((key) => byMonth.get(key) || emptyPoint(key));
}

export function sumEvolutionSeries(series: DashboardEvolutionPoint[]): {
  entradas: number;
  saidas: number;
} {
  return (series || []).reduce(
    (acc, point) => ({
      entradas: acc.entradas + Number(point.entradas || 0),
      saidas: acc.saidas + Number(point.saidas || 0),
    }),
    { entradas: 0, saidas: 0 },
  );
}
