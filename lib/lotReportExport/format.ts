import type { EnterpriseLotStatus } from '@/lib/enterpriseValueSummary';

const EMPTY_TOKENS = new Set(['undefined', 'null', 'nan', 'n/a', 'na', '-', '—']);

export function sanitizeLotReportText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isNaN(value)) return '';
  const text = String(value).trim();
  if (!text || EMPTY_TOKENS.has(text.toLowerCase())) return '';
  return text;
}

export function parseLotReportNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatLotReportArea(value: unknown): string {
  const num = parseLotReportNumber(value);
  return `${num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

export function formatLotReportCurrency(value: unknown): string {
  const num = parseLotReportNumber(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

export function formatLotReportCurrencyLabel(value: unknown): string {
  return formatLotReportCurrency(value);
}

export function enterpriseStatusLabel(status: EnterpriseLotStatus): string {
  switch (status) {
    case 'available':
      return 'Disponível';
    case 'reserved':
      return 'Reservado';
    case 'sold':
      return 'Vendido';
    case 'paid':
      return 'Quitado';
    default:
      return 'Disponível';
  }
}

export function lotReportGroupByLabel(groupBy: string): string {
  switch (groupBy) {
    case 'quadra':
      return 'Quadra';
    case 'valor':
      return 'Valor';
    case 'status':
      return 'Status';
    default:
      return 'Sem agrupamento';
  }
}

export function lotReportSortByLabel(sortBy: string): string {
  switch (sortBy) {
    case 'valor_asc':
      return 'Valor crescente';
    case 'valor_desc':
      return 'Valor decrescente';
    case 'status':
      return 'Status';
    default:
      return 'Quadra/Lote';
  }
}

export function slugifyLotReportFilename(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'todos'
  );
}

export function buildLotReportFilename(
  projectLabel: string,
  format: 'excel' | 'pdf',
  issuedAt: Date = new Date(),
): string {
  const date = issuedAt.toISOString().slice(0, 10);
  const slug = slugifyLotReportFilename(projectLabel);
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  return `relatorio-lotes-${slug}-${date}.${ext}`;
}
