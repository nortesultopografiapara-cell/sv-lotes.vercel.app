/**
 * Formatação dos KPIs do dashboard — quantidade vs valor monetário.
 */

export function formatDashboardKpiPrimaryValue(
  value: number,
  isCurrency = false,
): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (isCurrency) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(safe);
  }
  return Math.round(safe).toLocaleString('pt-BR');
}

export function isDashboardLotCountKpiTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized === 'lotes disponíveis' ||
    normalized === 'lotes reservados' ||
    normalized === 'lotes vendidos'
  );
}
