/**
 * Formatação dos KPIs do dashboard — quantidade vs valor monetário.
 */

export function coerceDashboardKpiNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    let normalized = trimmed;
    // Aceita "1234.56" (DB) e "1.234,56" (pt-BR) — não remover todos os pontos.
    if (trimmed.includes(',') && trimmed.includes('.')) {
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (trimmed.includes(',')) {
      normalized = trimmed.replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDashboardKpiPrimaryValue(
  value: unknown,
  isCurrency = false,
): string {
  const safe = coerceDashboardKpiNumber(value);
  if (isCurrency) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }
  return Math.round(safe).toLocaleString('pt-BR');
}

export function formatDashboardKpiSubtitle(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatDashboardKpiPrimaryValue(value, true) : '';
  }
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null' || text === 'NaN') {
    return '';
  }
  return text;
}

export function isDashboardLotCountKpiTitle(title: string): boolean {
  const normalized = String(title || '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'lotes disponíveis' ||
    normalized === 'lotes reservados' ||
    normalized === 'lotes vendidos'
  );
}
