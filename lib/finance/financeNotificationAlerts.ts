/**
 * Alertas do sino. Lê todas as parcelas do tenant, em páginas,
 * só com as colunas usadas pelo critério atual.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RlsContext } from '@/lib/rls';
import {
  fetchFinanceReceiptsProgressive,
  financeDatasetReadyForTotals,
} from '@/lib/finance/fetchFinanceReceiptsPaged';

export const FINANCE_NOTIFICATION_RECEIPT_SELECT =
  'amount, due_date, status, sale_id';

export type FinanceNotificationAlertRow = {
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  sale_id?: string | null;
};

export type FinanceNotificationAlertCounts = {
  qtyLate: number;
  qtyDueToday: number;
  qtyNext7Days: number;
  qtyNoPaymentContracts: number;
};

let notificationReceiptsInflight: Promise<FinanceNotificationAlertRow[]> | null = null;
let publishedNotificationRows: FinanceNotificationAlertRow[] | null = null;
const notificationWaiters: Array<(rows: FinanceNotificationAlertRow[] | null) => void> = [];

/** O Dashboard e o Financeiro entregam o conjunto completo e o sino não repete a leitura. */
export function publishFinanceNotificationSource(rows: FinanceNotificationAlertRow[]) {
  publishedNotificationRows = rows;
  const pending = notificationWaiters.splice(0);
  pending.forEach((resolve) => resolve(rows));
}

export function waitForPublishedFinanceNotificationSource(
  timeoutMs: number,
): Promise<FinanceNotificationAlertRow[] | null> {
  if (publishedNotificationRows) return Promise.resolve(publishedNotificationRows);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (rows: FinanceNotificationAlertRow[] | null) => {
      clearTimeout(timer);
      resolve(rows);
    };
    timer = setTimeout(() => {
      const index = notificationWaiters.indexOf(finish);
      if (index >= 0) notificationWaiters.splice(index, 1);
      resolve(null);
    }, timeoutMs);
    notificationWaiters.push(finish);
  });
}

export function resetPublishedFinanceNotificationSource() {
  publishedNotificationRows = null;
  const pending = notificationWaiters.splice(0);
  pending.forEach((resolve) => resolve(null));
}

/** Mesma classificação que o sino já usava. Não publica contagem parcial. */
export function summarizeFinanceNotificationAlerts(
  data: FinanceNotificationAlertRow[],
  now: Date = new Date(),
): FinanceNotificationAlertCounts {
  let qtyLate = 0;
  let qtyDueToday = 0;
  let qtyNext7Days = 0;
  const paidContracts = new Set<string>();
  const allContracts = new Set<string>();

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const todayTime = today.getTime();

  data.forEach((p) => {
    const dueDate = new Date(p.due_date || '');
    const dueStr = String(p.due_date || '').split('T')[0];

    let computedStatus = p.status?.toLowerCase() || 'pendente';
    if (
      (computedStatus === 'pendente' || computedStatus === 'pending') &&
      dueStr < todayStr
    ) {
      computedStatus = 'atrasado';
    }

    if (p.sale_id) {
      allContracts.add(p.sale_id);
      if (computedStatus === 'pago' || computedStatus === 'paid') {
        paidContracts.add(p.sale_id);
      }
    }

    if (computedStatus === 'atrasado') {
      qtyLate += 1;
    } else if (computedStatus === 'pendente' || computedStatus === 'pending') {
      if (dueStr === todayStr) {
        qtyDueToday += 1;
      } else if (
        dueDate.getTime() > todayTime &&
        dueDate.getTime() <= todayTime + 7 * 24 * 60 * 60 * 1000
      ) {
        qtyNext7Days += 1;
      }
    }
  });

  let qtyNoPaymentContracts = 0;
  allContracts.forEach((contractId) => {
    if (!paidContracts.has(contractId)) qtyNoPaymentContracts += 1;
  });

  return { qtyLate, qtyDueToday, qtyNext7Days, qtyNoPaymentContracts };
}

export async function fetchFinanceNotificationReceipts(
  supabase: SupabaseClient,
  rlsCtx: RlsContext,
  signal?: AbortSignal,
): Promise<FinanceNotificationAlertRow[]> {
  if (notificationReceiptsInflight) return notificationReceiptsInflight;
  const pending = fetchFinanceReceiptsProgressive<FinanceNotificationAlertRow>({
    supabase,
    rlsCtx,
    select: FINANCE_NOTIFICATION_RECEIPT_SELECT,
    selectFallback: FINANCE_NOTIFICATION_RECEIPT_SELECT,
    signal,
  }).then((state) => {
    if (!financeDatasetReadyForTotals(state)) {
      throw new Error(
        state.error || 'Não foi possível carregar os alertas de parcelas.',
      );
    }
    return state.rows;
  });
  notificationReceiptsInflight = pending;
  try {
    return await pending;
  } finally {
    if (notificationReceiptsInflight === pending) {
      notificationReceiptsInflight = null;
    }
  }
}
