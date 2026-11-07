/**
 * Rótulo visual das parcelas. Não altera valor, status, ordem nem identificador.
 * Vendas sem schedule_group, inclusive EMBEDDED, permanecem com o rótulo antigo.
 */

export type FinanceParcelLabelInput = {
  scheduleGroup?: string | null;
  installmentNumber?: number | string | null;
  lotInstallmentCount?: number | string | null;
  signalFutureCount?: number | string | null;
};

export type ScheduleReceiptIdentity = {
  saleId?: string | null;
  scheduleGroup?: string | null;
  installmentNumber?: number | string | null;
};

function wholeCount(value: number | string | null | undefined): number | null {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) return null;
  return count;
}

function groupOf(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

/** Contagem futura do sinal por venda. O pagamento inicial não entra. */
export function futureSignalCountsBySale(
  rows: ScheduleReceiptIdentity[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const saleId = String(row.saleId || '').trim();
    if (!saleId || groupOf(row.scheduleGroup) !== 'SIGNAL') continue;
    if (!(Number(row.installmentNumber) > 0)) continue;
    counts.set(saleId, (counts.get(saleId) || 0) + 1);
  }
  return counts;
}

/** Parcelas futuras do sinal, sem o pagamento inicial de número 0. */
export function countFutureSignalInstallments(
  rows: ScheduleReceiptIdentity[],
  saleId: string,
): number | null {
  const id = String(saleId || '').trim();
  if (!id) return null;
  const count = rows.filter((row) => {
    if (String(row.saleId || '') !== id) return false;
    if (groupOf(row.scheduleGroup) !== 'SIGNAL') return false;
    return Number(row.installmentNumber) > 0;
  }).length;
  return count > 0 ? count : null;
}

/**
 * Rótulo da listagem. Retorna o formato antigo quando não há cronograma separado.
 */
export function formatFinanceParcelLabel(input: FinanceParcelLabelInput): string {
  const group = groupOf(input.scheduleGroup);
  const number = Number(input.installmentNumber);
  const lotCount = wholeCount(input.lotInstallmentCount);
  if (group === 'SIGNAL' && number === 0) return 'SINAL — Pagamento inicial';
  if (group === 'SIGNAL' && Number.isInteger(number) && number >= 1) {
    const signalCount = wholeCount(input.signalFutureCount);
    return signalCount
      ? `SINAL — Parcela ${number}/${signalCount}`
      : `SINAL — Parcela ${number}`;
  }
  if (group === 'LOT' && Number.isInteger(number) && number >= 1) {
    return lotCount
      ? `LOTE — Parcela ${number}/${lotCount}`
      : `LOTE — Parcela ${number}`;
  }
  const isEntry = input.installmentNumber === 0 || input.installmentNumber === '0';
  if (isEntry) return 'Entrada';
  const shown = String(input.installmentNumber || 1);
  return lotCount ? `Parcela ${shown} / ${lotCount}` : `Parcela ${shown}`;
}
