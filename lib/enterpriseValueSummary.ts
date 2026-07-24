/** Resumo de valor do empreendimento com base nos lotes (`blocks`). */

export type EnterpriseLotStatus =
  | 'available'
  | 'reserved'
  | 'sold'
  | 'paid';

export type EnterpriseLotRow = {
  project_id?: string | null;
  status?: string | null;
  price?: number | string | null;
};

export type EnterpriseValueSummary = {
  totalValue: number;
  availableValue: number;
  reservedValue: number;
  soldValue: number;
  paidValue: number;
  availableCount: number;
  reservedCount: number;
  soldCount: number;
  paidCount: number;
  lotCount: number;
};

export function parseEnterpriseLotPrice(
  price: number | string | null | undefined,
): number {
  if (price === null || price === undefined || price === '') return 0;
  if (typeof price === 'number') {
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }
  const raw = String(price).trim();
  if (!raw) return 0;
  // Aceita "1234.56" (DB) e "1.234,56" (pt-BR).
  let normalized = raw;
  if (raw.includes(',') && raw.includes('.')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeEnterpriseLotStatus(
  status: string | null | undefined,
): EnterpriseLotStatus {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  if (!normalized || ['disponível', 'disponivel', 'available', 'livre'].includes(normalized)) {
    return 'available';
  }
  if (normalized.includes('reserv') || normalized === 'reserved') {
    return 'reserved';
  }
  if (
    normalized.includes('quit') ||
    normalized === 'paid_off' ||
    normalized === 'quitado'
  ) {
    return 'paid';
  }
  if (
    normalized.includes('vend') ||
    normalized === 'sold' ||
    normalized === 'sold_out' ||
    normalized === 'vendido'
  ) {
    return 'sold';
  }
  return 'available';
}

export function filterEnterpriseLotsByProject(
  lots: EnterpriseLotRow[],
  projectId?: string | null,
): EnterpriseLotRow[] {
  if (!projectId) return lots;
  return lots.filter((lot) => lot.project_id === projectId);
}

export function calculateEnterpriseValueSummary(
  lots: EnterpriseLotRow[],
): EnterpriseValueSummary {
  const summary: EnterpriseValueSummary = {
    totalValue: 0,
    availableValue: 0,
    reservedValue: 0,
    soldValue: 0,
    paidValue: 0,
    availableCount: 0,
    reservedCount: 0,
    soldCount: 0,
    paidCount: 0,
    lotCount: 0,
  };

  for (const lot of lots) {
    const price = parseEnterpriseLotPrice(lot.price);
    const status = normalizeEnterpriseLotStatus(lot.status);

    summary.lotCount += 1;
    summary.totalValue += price;

    if (status === 'available') {
      summary.availableCount += 1;
      summary.availableValue += price;
      continue;
    }
    if (status === 'reserved') {
      summary.reservedCount += 1;
      summary.reservedValue += price;
      continue;
    }
    if (status === 'paid') {
      summary.paidCount += 1;
      summary.paidValue += price;
      summary.soldValue += price;
      continue;
    }
    summary.soldCount += 1;
    summary.soldValue += price;
  }

  return summary;
}

export function formatEnterpriseCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
