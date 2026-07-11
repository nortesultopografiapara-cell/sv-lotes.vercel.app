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

/** Fuso do certificado de assinatura eletrônica — alinhado a formatSignatureDateBr. */
export const CONTRACT_BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Timestamp canônico da venda para contrato.
 * Usa sale_date; created_at apenas como legado quando sale_date ausente.
 * Nunca usa contractDate, updated_at ou data de geração/regeneração.
 */
export function resolveContractSaleDateRaw(sale: Record<string, unknown>): string | null {
  const saleDate = String(sale?.sale_date ?? '').trim();
  if (saleDate) return saleDate;
  const createdAt = String(sale?.created_at ?? '').trim();
  if (createdAt) return createdAt;
  return null;
}

/** Normaliza registro de venda quando datas vêm aninhadas em `sales`. */
export function normalizeSaleRecordForContractDates(
  sale: Record<string, unknown>,
): Record<string, unknown> {
  if (resolveContractSaleDateRaw(sale)) return sale;

  const nested = sale.sales;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedSale = nested as Record<string, unknown>;
    if (resolveContractSaleDateRaw(nestedSale)) {
      return { ...sale, ...nestedSale };
    }
  }

  return sale;
}

export function parseContractSaleDate(sale: Record<string, unknown>): Date | null {
  const saleRecord = normalizeSaleRecordForContractDates(sale);
  const raw = resolveContractSaleDateRaw(saleRecord);
  if (!raw) return null;

  const trimmed = raw.trim();
  const dateOnly = trimmed.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && trimmed.length <= 10) {
    const d = new Date(`${dateOnly}T12:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function resolveContractSaleDateTimeZone(raw: string): string {
  const trimmed = String(raw || '').trim();
  const dateOnly = trimmed.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && trimmed.length <= 10) {
    return 'UTC';
  }
  return CONTRACT_BRAZIL_TIMEZONE;
}

/** Data da venda em pt-BR — fuso America/Sao_Paulo para timestamps com hora. */
export function formatContractSaleDateBr(sale: Record<string, unknown>): string {
  const saleRecord = normalizeSaleRecordForContractDates(sale);
  const raw = resolveContractSaleDateRaw(saleRecord);
  if (!raw) return '';

  const trimmed = raw.trim();
  const dateOnly = trimmed.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && trimmed.length <= 10) {
    const d = new Date(`${dateOnly}T12:00:00Z`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('pt-BR', {
    timeZone: resolveContractSaleDateTimeZone(trimmed),
  });
}

/** Data da venda por extenso — ex.: 08 de julho de 2026. */
export function formatContractSaleDateLongBr(sale: Record<string, unknown>): string {
  const saleRecord = normalizeSaleRecordForContractDates(sale);
  const raw = resolveContractSaleDateRaw(saleRecord);
  const parsed = parseContractSaleDate(saleRecord);
  if (!raw || !parsed) return '';

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: resolveContractSaleDateTimeZone(raw),
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).formatToParts(parsed);

  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  if (!day || !month || !year) return '';
  return `${day} de ${month} de ${year}`;
}

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

/** Data YYYY-MM-DD por extenso sem deslocar fuso — ex.: 15 de janeiro de 2032. */
export function formatContractDueDateLongBr(dateStr: unknown): string {
  if (dateStr == null || dateStr === '') return '';
  const iso = String(dateStr).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatContractDueDateBr(dateStr);
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return formatContractDueDateBr(dateStr);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  if (!day || !month || !year) return formatContractDueDateBr(dateStr);
  return `${day} de ${month} de ${year}`;
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
