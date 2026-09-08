/**
 * Distribuição de lotes do Dashboard — somente dados já calculados nos KPIs.
 * Não consulta o banco.
 */

export type DashboardLotPieSlice = {
  name: string;
  value: number;
  color: string;
};

export type DashboardLotDistribution = {
  pieData: DashboardLotPieSlice[];
  totalLotes: number;
};

const LOT_SLICE_COLORS = {
  available: '#10b981',
  reserved: '#f59e0b',
  soldPaid: '#ef4444',
} as const;

/** Mesmas categorias dos KPIs: disponíveis, reservados, vendidos+quitados. */
export function buildDashboardLotDistribution(stats: {
  available: number;
  reserved: number;
  sold: number;
  paid: number;
}): DashboardLotDistribution {
  const available = Math.max(0, Number(stats.available) || 0);
  const reserved = Math.max(0, Number(stats.reserved) || 0);
  const soldPaid = Math.max(0, (Number(stats.sold) || 0) + (Number(stats.paid) || 0));
  const pieData: DashboardLotPieSlice[] = [
    { name: 'Disponíveis', value: available, color: LOT_SLICE_COLORS.available },
    { name: 'Reservados', value: reserved, color: LOT_SLICE_COLORS.reserved },
    { name: 'Vendidos/quitados', value: soldPaid, color: LOT_SLICE_COLORS.soldPaid },
  ];
  const totalLotes = available + reserved + soldPaid;
  return { pieData, totalLotes };
}
