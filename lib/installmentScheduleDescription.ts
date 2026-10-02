/**
 * Descrição contratual das parcelas a partir dos receipts reais.
 * Não recalcula valores — só agrupa o que a venda já gerou.
 */
import { formatCurrencyBRL } from '@/lib/currencyBrl';

export type InstallmentScheduleReceipt = {
  installment_number?: unknown;
  amount?: unknown;
};

function toCents(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function moneyFromCents(cents: number): string {
  return formatCurrencyBRL(cents / 100).replace(/\u00a0/g, ' ');
}

function ordinalFem(n: number): string {
  return `${n}ª`;
}

function formatGroup(from: number, to: number, cents: number): string {
  const money = moneyFromCents(cents);
  if (from === to) return `${ordinalFem(from)} de ${money}`;
  return `${ordinalFem(from)} à ${ordinalFem(to)} de ${money}`;
}

export function formatInstallmentScheduleDescription(
  receipts: InstallmentScheduleReceipt[] | null | undefined,
  fallback?: { count?: unknown; value?: unknown },
): string {
  const parcels = (receipts || [])
    .map((row) => ({
      n: Number(row.installment_number),
      cents: toCents(row.amount),
    }))
    .filter((row): row is { n: number; cents: number } =>
      Number.isFinite(row.n) && row.n >= 1 && row.cents != null,
    )
    .sort((a, b) => a.n - b.n);

  if (!parcels.length) {
    const count = Number(fallback?.count);
    const cents = toCents(fallback?.value);
    if (Number.isFinite(count) && count > 0 && cents != null) {
      return count === 1
        ? `1 parcela de ${moneyFromCents(cents)}`
        : `${count} parcelas de ${moneyFromCents(cents)}`;
    }
    return '';
  }

  const groups: Array<{ from: number; to: number; cents: number }> = [];
  for (const row of parcels) {
    const last = groups[groups.length - 1];
    if (last && last.cents === row.cents && row.n === last.to + 1) {
      last.to = row.n;
    } else {
      groups.push({ from: row.n, to: row.n, cents: row.cents });
    }
  }

  const count = parcels.length;
  if (groups.length === 1) {
    return count === 1
      ? `1 parcela de ${moneyFromCents(groups[0].cents)}`
      : `${count} parcelas de ${moneyFromCents(groups[0].cents)}`;
  }

  return `${count} parcelas — ${groups.map((g) => formatGroup(g.from, g.to, g.cents)).join('; ')}`;
}
