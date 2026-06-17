/**
 * Datas de pagamento do contrato de compra e venda — fonte compartilhada.
 */

export type ContractFinanceReceiptRef = {
  due_date?: string | null;
  installment_number?: number | string | null;
  amount?: number | null;
  status?: string | null;
};

export type ContractPaymentDates = {
  entryDueRaw: string | null;
  firstInstallmentDueRaw: string | null;
  lastInstallmentDueRaw: string | null;
  entryDueFmt: string;
  firstInstallmentDueFmt: string;
  lastInstallmentDueFmt: string;
};

/** Data YYYY-MM-DD em pt-BR sem deslocar fuso (UTC noon). */
export function formatContractDueDateBr(dateStr: unknown): string {
  if (dateStr == null || dateStr === '') return '';
  const iso = String(dateStr).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}T12:00:00Z`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
  }
  const parsed = new Date(String(dateStr));
  if (isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleDateString('pt-BR');
}

function addMonthsToIsoDate(isoDate: string, months: number): string | null {
  const base = String(isoDate).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const d = new Date(`${base}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split('T')[0];
}

/**
 * Datas oficiais do contrato — mesma fonte do financeiro (parcelas geradas + sale).
 */
export function resolveContractPaymentDates(
  sale: Record<string, unknown>,
  receipts?: ContractFinanceReceiptRef[] | null,
): ContractPaymentDates {
  const recs = (
    receipts ??
    (sale.finance_receipts as ContractFinanceReceiptRef[] | undefined) ??
    []
  ).filter((r) => {
    if (!r?.due_date) return false;
    const st = String(r.status || '').toLowerCase();
    return st !== 'cancelado' && st !== 'cancelled';
  });

  const byInst = (n: number) =>
    recs
      .filter((r) => Number(r.installment_number) === n)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];

  const parcelRecs = recs
    .filter((r) => {
      const num = Number(r.installment_number);
      return Number.isFinite(num) && num >= 1;
    })
    .sort(
      (a, b) =>
        Number(a.installment_number) - Number(b.installment_number) ||
        String(a.due_date).localeCompare(String(b.due_date)),
    );

  const entryRec = byInst(0);
  const firstParcelRec = parcelRecs[0];
  const lastParcelRec = parcelRecs[parcelRecs.length - 1];

  const qtdParcelas = Math.max(1, Number(sale.installments_count) || 1);

  const entryDueRaw =
    (entryRec?.due_date as string | undefined) ||
    (sale.down_payment_due_date as string | undefined) ||
    (sale.entry_due_date as string | undefined) ||
    null;

  const firstInstallmentDueRaw =
    (firstParcelRec?.due_date as string | undefined) ||
    (sale.first_installment_due_date as string | undefined) ||
    null;

  let lastInstallmentDueRaw =
    (lastParcelRec?.due_date as string | undefined) || null;
  if (!lastInstallmentDueRaw && firstInstallmentDueRaw && qtdParcelas > 1) {
    lastInstallmentDueRaw = addMonthsToIsoDate(
      firstInstallmentDueRaw,
      qtdParcelas - 1,
    );
  }
  if (!lastInstallmentDueRaw && firstInstallmentDueRaw) {
    lastInstallmentDueRaw = firstInstallmentDueRaw;
  }

  return {
    entryDueRaw,
    firstInstallmentDueRaw,
    lastInstallmentDueRaw,
    entryDueFmt: formatContractDueDateBr(entryDueRaw),
    firstInstallmentDueFmt: formatContractDueDateBr(firstInstallmentDueRaw),
    lastInstallmentDueFmt: formatContractDueDateBr(lastInstallmentDueRaw),
  };
}
