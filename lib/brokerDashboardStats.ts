/**
 * Estatísticas de corretores — fonte única para tela, ranking e PDF.
 * Conta vendas ativas (1 por sale_id), exclui canceladas, resolve broker_id legado.
 */

import {
  brokerDashboardPendingTotal,
  getSalePendingCommissionTotal,
  isCanceledBrokerCommission,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  resolveBrokerCommissionAmount,
  resolveSaleValueForCommission,
  type BrokerCommissionRow,
} from '@/lib/brokerCommission';
import { isLotReservedStatus } from '@/lib/lotReservationDisplay';
import {
  formatSaleLotsLabel,
  resolveBlocksForSale,
  resolveLoteFromBlock,
  resolveQuadraFromBlock,
  type BlockLotRow,
} from '@/lib/saleBlockLotLabel';
import {
  resolveBrokerDisplayName,
  resolveSaleBrokerId,
} from '@/lib/saleBrokerSnapshot';

export const CANCELED_SALE_STATUSES = [
  'cancelado',
  'cancelada',
  'cancelled',
  'canceled',
] as const;

export type BrokerStatsBrokerRef = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export type BrokerSaleDetailRow = {
  sale_id: string;
  broker_id: string;
  broker_name: string;
  cliente: string;
  empreendimento: string;
  quadra: string;
  lote: string;
  loteStr: string;
  contrato: string;
  data_venda: string;
  valor_venda: number;
  status: string;
  comissao_pendente: number;
};

export type BrokerStatsSummary = {
  broker_id: string;
  vendas_qtd: number;
  vendas_valor: number;
  comissao_paga: number;
  comissao_pendente: number;
  sale_details: BrokerSaleDetailRow[];
};

export const BROKER_DASHBOARD_PERIODS = ['month', 'last_30', 'year'] as const;
export type BrokerDashboardPeriod = (typeof BROKER_DASHBOARD_PERIODS)[number];
export type BrokerStatsPeriod = 'all' | BrokerDashboardPeriod;

export const BROKER_DASHBOARD_PERIOD_LABELS: Record<
  BrokerDashboardPeriod,
  string
> = {
  month: 'Este mês',
  last_30: 'Últimos 30 dias',
  year: 'Este ano',
};

export function labelBrokerStatsPeriod(period: BrokerStatsPeriod): string {
  if (period === 'all') return 'Todo o período';
  return BROKER_DASHBOARD_PERIOD_LABELS[period];
}

export function normalizeBrokerMatchKey(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function digitsOnlyPhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function brokerRecordMatchesSearch(
  broker: {
    name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    creci?: string | null;
  },
  query: string,
): boolean {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const name = String(broker.name || broker.full_name || '').toLowerCase();
  const email = String(broker.email || '').toLowerCase();
  const creci = String(broker.creci || '').toLowerCase();
  if (name.includes(q) || email.includes(q) || creci.includes(q)) return true;
  const phoneRaw = String(broker.phone || '').toLowerCase();
  if (phoneRaw.includes(q)) return true;
  const qDigits = digitsOnlyPhone(q);
  const phoneDigits = digitsOnlyPhone(broker.phone);
  return Boolean(qDigits) && phoneDigits.includes(qDigits);
}

/** Data da venda no calendário civil (YYYY-MM-DD), sem deslocar o dia por UTC. */
export function parseBrokerSaleDate(
  sale: Record<string, unknown>,
): Date | null {
  const raw = String(sale.sale_date || sale.created_at || '').trim();
  if (!raw) return null;
  const day = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) {
    return new Date(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      12,
      0,
      0,
      0,
    );
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getBrokerStatsPeriodBounds(
  period: BrokerStatsPeriod,
  referenceDate: Date = new Date(),
): { start: Date; endExclusive: Date } | null {
  if (period === 'all') return null;
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  if (period === 'month') {
    return {
      start: new Date(y, m, 1, 0, 0, 0, 0),
      endExclusive: new Date(y, m + 1, 1, 0, 0, 0, 0),
    };
  }
  if (period === 'year') {
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      endExclusive: new Date(y + 1, 0, 1, 0, 0, 0, 0),
    };
  }
  const start = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, endExclusive: new Date(referenceDate.getTime() + 1) };
}

export function countOpenReservedLots(
  blocks: Array<{ status?: string | null }>,
): number {
  return blocks.filter((block) => isLotReservedStatus(block.status)).length;
}

export function sumCommissionsForSaleIds(
  commissions: BrokerCommissionRow[],
  saleIds: Iterable<string>,
): { generated: number; paid: number; pending: number } {
  const allowed = new Set(
    [...saleIds].map((id) => String(id || '')).filter(Boolean),
  );
  let generated = 0;
  let paid = 0;
  let pending = 0;
  for (const row of commissions) {
    const saleId = String(row.sale_id || '');
    if (!saleId || !allowed.has(saleId)) continue;
    if (isCanceledBrokerCommission(row.status)) continue;
    const amount = resolveBrokerCommissionAmount(row);
    generated += amount;
    if (isPaidBrokerCommission(row.status)) paid += amount;
    else if (isPendingBrokerCommission(row.status)) pending += amount;
  }
  return { generated, paid, pending };
}

export function isCanceledSale(sale: Record<string, unknown>): boolean {
  const st = String(sale.status || '')
    .trim()
    .toLowerCase();
  return CANCELED_SALE_STATUSES.includes(
    st as (typeof CANCELED_SALE_STATUSES)[number],
  );
}

export function isSaleInStatsPeriod(
  sale: Record<string, unknown>,
  period: BrokerStatsPeriod,
  referenceDate: Date = new Date(),
): boolean {
  if (period === 'all') return true;
  const bounds = getBrokerStatsPeriodBounds(period, referenceDate);
  if (!bounds) return true;
  const saleDate = parseBrokerSaleDate(sale);
  if (!saleDate) return false;
  return saleDate >= bounds.start && saleDate < bounds.endExclusive;
}

export function sumPaidBrokerCommissions(
  commissions: BrokerCommissionRow[],
): number {
  return commissions
    .filter(
      (row) =>
        isPaidBrokerCommission(row.status) &&
        !isCanceledBrokerCommission(row.status),
    )
    .reduce((sum, row) => sum + resolveBrokerCommissionAmount(row), 0);
}

/** Resolve corretor da venda: sale → contrato → comissão → nome/e-mail legado. */
export function resolveSaleBrokerIdForStats(
  sale: Record<string, unknown>,
  contracts: Array<Record<string, unknown>>,
  commissions: BrokerCommissionRow[],
  brokers: BrokerStatsBrokerRef[],
): string | null {
  const contract =
    contracts.find(
      (c) => c.sale_id === sale.id || c.id === sale.contract_id,
    ) || null;

  const directId = resolveSaleBrokerId(sale, contract || undefined);
  if (directId) return directId;

  const comm = commissions.find(
    (c) => c.sale_id === sale.id && c.broker_id,
  );
  if (comm?.broker_id) return String(comm.broker_id);

  const brokerName = resolveBrokerDisplayName(sale);
  if (brokerName) {
    const key = normalizeBrokerMatchKey(brokerName);
    const byName = brokers.find(
      (b) => normalizeBrokerMatchKey(b.name || b.full_name) === key,
    );
    if (byName) return byName.id;
  }

  const email = String(sale.broker_email || '')
    .trim()
    .toLowerCase();
  if (email) {
    const byEmail = brokers.find(
      (b) => String(b.email || '').trim().toLowerCase() === email,
    );
    if (byEmail) return byEmail.id;
  }

  return null;
}

function resolveCustomerName(
  sale: Record<string, unknown>,
  customers: Array<{ id: string; name?: string | null }>,
): string {
  const customerId = sale.customer_id ? String(sale.customer_id) : '';
  if (customerId) {
    const row = customers.find((c) => c.id === customerId);
    if (row?.name) return String(row.name);
  }
  const fromSale = String(sale.customer_name || '').trim();
  return fromSale || '—';
}

function resolveProjectName(
  sale: Record<string, unknown>,
  blocks: BlockLotRow[],
  projects: Array<{ id: string; name?: string | null }>,
): string {
  const projectId = sale.project_id ? String(sale.project_id) : '';
  if (projectId) {
    const row = projects.find((p) => p.id === projectId);
    if (row?.name) return String(row.name);
  }
  const saleBlocks = resolveBlocksForSale(sale as BlockLotRow & { id?: string; block_id?: string; lot_id?: string }, blocks);
  const blockProjectId = saleBlocks[0]?.project_id
    ? String(saleBlocks[0].project_id)
    : '';
  if (blockProjectId) {
    const row = projects.find((p) => p.id === blockProjectId);
    if (row?.name) return String(row.name);
  }
  return String(sale.project_name || '').trim() || '—';
}

function buildSaleDetailRow(input: {
  sale: Record<string, unknown>;
  brokerId: string | null;
  brokerName: string;
  blocks: BlockLotRow[];
  projects: Array<{ id: string; name?: string | null }>;
  customers: Array<{ id: string; name?: string | null }>;
  contracts: Array<Record<string, unknown>>;
  commissions: BrokerCommissionRow[];
}): BrokerSaleDetailRow {
  const { sale, blocks, commissions } = input;
  const saleId = String(sale.id);
  const saleBlocks = resolveBlocksForSale(
    sale as BlockLotRow & { id?: string; block_id?: string; lot_id?: string },
    blocks,
  );
  const contract =
    input.contracts.find(
      (c) => c.sale_id === sale.id || c.id === sale.contract_id,
    ) || null;

  const quadraLabels = saleBlocks
    .map((b) => resolveQuadraFromBlock(b))
    .filter(Boolean);
  const loteLabels = saleBlocks.map((b) => resolveLoteFromBlock(b)).filter(Boolean);

  return {
    sale_id: saleId,
    broker_id: input.brokerId || '',
    broker_name: input.brokerName,
    cliente: resolveCustomerName(sale, input.customers),
    empreendimento: resolveProjectName(sale, blocks, input.projects),
    quadra: [...new Set(quadraLabels)].join(', ') || '—',
    lote: [...new Set(loteLabels)].join(', ') || '—',
    loteStr:
      formatSaleLotsLabel(
        sale as BlockLotRow & { id?: string; block_id?: string; lot_id?: string },
        blocks,
      ) || '—',
    contrato:
      String(
        contract?.contract_number ||
          contract?.number ||
          contract?.code ||
          '',
      ).trim() || '—',
    data_venda: String(sale.sale_date || sale.created_at || ''),
    valor_venda: resolveSaleValueForCommission(sale),
    status: String(sale.status || 'ativo'),
    comissao_pendente: input.brokerId
      ? getSalePendingCommissionTotal(commissions, saleId, input.brokerId)
      : 0,
  };
}

export function buildBrokerStatsFromData(input: {
  brokers: BrokerStatsBrokerRef[];
  sales: Array<Record<string, unknown>>;
  commissions: BrokerCommissionRow[];
  blocks: BlockLotRow[];
  projects: Array<{ id: string; name?: string | null }>;
  contracts: Array<Record<string, unknown>>;
  customers: Array<{ id: string; name?: string | null }>;
  period?: BrokerStatsPeriod;
  referenceDate?: Date;
}): {
  byBrokerId: Map<string, BrokerStatsSummary>;
  unassignedSales: BrokerSaleDetailRow[];
} {
  const period = input.period ?? 'all';
  const referenceDate = input.referenceDate ?? new Date();
  const byBrokerId = new Map<string, BrokerStatsSummary>();

  for (const broker of input.brokers) {
    const brokerComms = input.commissions.filter(
      (c) => c.broker_id === broker.id,
    );
    byBrokerId.set(broker.id, {
      broker_id: broker.id,
      vendas_qtd: 0,
      vendas_valor: 0,
      comissao_paga: sumPaidBrokerCommissions(brokerComms),
      comissao_pendente: brokerDashboardPendingTotal(brokerComms),
      sale_details: [],
    });
  }

  const unassignedSales: BrokerSaleDetailRow[] = [];
  const countedSaleIds = new Set<string>();

  for (const sale of input.sales) {
    if (!sale.id || isCanceledSale(sale)) continue;
    if (!isSaleInStatsPeriod(sale, period, referenceDate)) continue;

    const saleId = String(sale.id);
    if (countedSaleIds.has(saleId)) continue;
    countedSaleIds.add(saleId);

    const brokerId = resolveSaleBrokerIdForStats(
      sale,
      input.contracts,
      input.commissions,
      input.brokers,
    );

    const broker = brokerId
      ? input.brokers.find((b) => b.id === brokerId)
      : null;
    const brokerName = broker
      ? String(broker.name || broker.full_name || '')
      : 'Sem corretor';

    const detail = buildSaleDetailRow({
      sale,
      brokerId,
      brokerName,
      blocks: input.blocks,
      projects: input.projects,
      customers: input.customers,
      contracts: input.contracts,
      commissions: input.commissions,
    });

    if (!brokerId || !byBrokerId.has(brokerId)) {
      unassignedSales.push(detail);
      continue;
    }

    const summary = byBrokerId.get(brokerId)!;
    summary.vendas_qtd += 1;
    summary.vendas_valor += detail.valor_venda;
    summary.sale_details.push(detail);
  }

  return { byBrokerId, unassignedSales };
}

export type BrokerReportSummaryRow = {
  corretor: string;
  vendas_qtd: number;
  vendas_valor: number;
  comissao_paga: number;
  comissao_pendente: number;
};

export function buildBrokerReportSummaryRows(
  brokers: Array<{
    id: string;
    name?: string | null;
    stats: BrokerStatsSummary;
  }>,
): BrokerReportSummaryRow[] {
  return brokers.map((b) => ({
    corretor: String(b.name || ''),
    vendas_qtd: b.stats.vendas_qtd,
    vendas_valor: b.stats.vendas_valor,
    comissao_paga: b.stats.comissao_paga,
    comissao_pendente: b.stats.comissao_pendente,
  }));
}

export function buildBrokerReportDetailRows(
  brokers: Array<{
    id: string;
    name?: string | null;
    stats: BrokerStatsSummary;
  }>,
  unassignedSales: BrokerSaleDetailRow[] = [],
): BrokerSaleDetailRow[] {
  const rows: BrokerSaleDetailRow[] = [];
  for (const b of brokers) {
    for (const detail of b.stats.sale_details) {
      rows.push({
        ...detail,
        broker_name: String(b.name || detail.broker_name),
      });
    }
  }
  for (const detail of unassignedSales) {
    rows.push(detail);
  }
  rows.sort((a, b) => {
    const nameCmp = a.broker_name.localeCompare(b.broker_name, 'pt-BR');
    if (nameCmp !== 0) return nameCmp;
    return new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime();
  });
  return rows;
}

export function rankBrokersBySalesValue<T extends { vendas_mes_valor?: number }>(
  brokers: T[],
  limit = 3,
): T[] {
  return [...brokers]
    .filter((b) => (Number(b.vendas_mes_valor) || 0) > 0)
    .sort(
      (a, b) =>
        (Number(b.vendas_mes_valor) || 0) - (Number(a.vendas_mes_valor) || 0),
    )
    .slice(0, limit);
}
