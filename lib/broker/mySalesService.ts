/**
 * Serviço Minhas Vendas — consultas escopadas ao corretor autenticado.
 * Sem campos financeiros.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveLoteFromBlock,
  resolveQuadraFromBlock,
  type BlockLotRow,
} from '@/lib/saleBlockLotLabel';
import { CANCELED_SALE_STATUSES, isCanceledSale } from '@/lib/brokerDashboardStats';
import type {
  MySalesDetail,
  MySalesListFilters,
  MySalesListItem,
  MySalesListResponse,
  MySalesListTab,
  MySalesSummary,
} from '@/lib/broker/mySalesTypes';

const DEFAULT_PAGE_SIZE = 20;

type SaleRow = Record<string, unknown>;
type ReservationRow = Record<string, unknown>;
type ContractRow = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstEmbed(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function isoDate(value: unknown): string | null {
  const s = String(value || '').trim();
  if (!s) return null;
  return s;
}

function monthBoundsUtc(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString();
  const end = new Date(Date.UTC(y, m + 1, 1)).toISOString();
  return { start, end };
}

export function formatSaleStatusLabel(status?: string | null): string {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return 'Em andamento';
  if (CANCELED_SALE_STATUSES.includes(s as (typeof CANCELED_SALE_STATUSES)[number])) {
    return 'Cancelado';
  }
  if (s === 'active' || s === 'ativo') return 'Em andamento';
  if (s === 'completed' || s === 'concluido' || s === 'concluído') return 'Concluída';
  return status ? String(status) : 'Em andamento';
}

export function formatContractStatusLabel(status?: string | null): string {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return 'Contrato pendente';
  if (s === 'assinado' || s === 'signed') return 'Assinado';
  if (s === 'cancelado' || s === 'cancelled' || s === 'canceled') return 'Cancelado';
  if (s === 'rascunho' || s === 'draft') return 'Aguardando assinatura';
  if (s === 'ativo' || s === 'active') return 'Aguardando assinatura';
  if (s === 'superseded') return 'Substituído';
  return String(status);
}

export function isContractPending(status?: string | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return true;
  if (s === 'assinado' || s === 'signed') return false;
  if (s === 'cancelado' || s === 'cancelled' || s === 'canceled' || s === 'superseded') {
    return false;
  }
  return true;
}

export function isContractSigned(status?: string | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  return s === 'assinado' || s === 'signed';
}

export type ReservationDisplayStatus =
  | 'ativa'
  | 'expirada'
  | 'convertida'
  | 'cancelada';

export function resolveReservationDisplayStatus(input: {
  logStatus?: string | null;
  expirationTime?: string | null;
  blockStatus?: string | null;
  hasLinkedSale?: boolean;
  now?: Date;
}): ReservationDisplayStatus {
  const logSt = String(input.logStatus || '').trim().toLowerCase();
  if (logSt === 'cancelled' || logSt === 'canceled' || logSt === 'cancelada') {
    return 'cancelada';
  }
  if (input.hasLinkedSale) return 'convertida';
  const blockSt = String(input.blockStatus || '').trim().toLowerCase();
  if (blockSt === 'vendido' || blockSt === 'sold') return 'convertida';

  const exp = input.expirationTime ? new Date(input.expirationTime) : null;
  const now = input.now || new Date();
  if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() < now.getTime()) {
    return 'expirada';
  }
  if (logSt === 'active' || logSt === 'ativa' || !logSt) return 'ativa';
  return 'ativa';
}

export function formatReservationStatusLabel(status: ReservationDisplayStatus): string {
  switch (status) {
    case 'ativa':
      return 'Ativa';
    case 'expirada':
      return 'Expirada';
    case 'convertida':
      return 'Convertida em venda';
    case 'cancelada':
      return 'Cancelada';
    default:
      return status;
  }
}

export function isReservationActiveForKpi(status: ReservationDisplayStatus): boolean {
  return status === 'ativa';
}

function matchesSearch(
  item: MySalesListItem,
  search: string | null | undefined,
): boolean {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    item.customerName,
    item.projectName,
    item.blockLabel,
    item.lotLabel,
    item.typeLabel,
    item.statusLabel,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesFilters(item: MySalesListItem, filters: MySalesListFilters): boolean {
  if (filters.projectId) {
    // projectId filtrado na query quando possível; aqui usa nome se só search
  }
  if (filters.blockLabel) {
    const b = String(filters.blockLabel).trim().toLowerCase();
    if (b && !item.blockLabel.toLowerCase().includes(b)) return false;
  }
  if (filters.lotLabel) {
    const l = String(filters.lotLabel).trim().toLowerCase();
    if (l && !item.lotLabel.toLowerCase().includes(l)) return false;
  }
  if (filters.status) {
    const st = String(filters.status).trim().toLowerCase();
    if (st && item.statusKey.toLowerCase() !== st && item.statusLabel.toLowerCase() !== st) {
      return false;
    }
  }
  if (filters.startDate) {
    const d = String(item.date || '').slice(0, 10);
    if (d && d < String(filters.startDate).slice(0, 10)) return false;
  }
  if (filters.endDate) {
    const d = String(item.date || '').slice(0, 10);
    if (d && d > String(filters.endDate).slice(0, 10)) return false;
  }
  return matchesSearch(item, filters.search);
}

function mapSaleItem(
  sale: SaleRow,
  contract: ContractRow | null,
): MySalesListItem {
  const customer = firstEmbed(sale.customers) || firstEmbed(sale.customer);
  const project = firstEmbed(sale.projects) || firstEmbed(sale.project);
  const block = firstEmbed(sale.blocks) || firstEmbed(sale.block);
  const blockRow = (block || {}) as BlockLotRow;
  const saleStatus = String(sale.status || '');
  const contractStatus = contract ? String(contract.status || '') : null;

  let statusKey = saleStatus || 'ativo';
  let statusLabel = formatSaleStatusLabel(saleStatus);
  if (isCanceledSale(sale)) {
    statusKey = 'cancelado';
    statusLabel = 'Cancelado';
  } else if (isContractSigned(contractStatus)) {
    statusKey = 'assinado';
    statusLabel = 'Assinado';
  } else if (isContractPending(contractStatus)) {
    statusKey = 'contrato_pendente';
    statusLabel = 'Contrato pendente';
  }

  return {
    id: `sale:${String(sale.id)}`,
    type: 'sale',
    typeLabel: 'Venda',
    date: isoDate(sale.sale_date || sale.created_at),
    projectName: String(project?.name || '—'),
    blockLabel: resolveQuadraFromBlock(blockRow) || '—',
    lotLabel: resolveLoteFromBlock(blockRow) || '—',
    customerName: String(customer?.name || customer?.full_name || '—'),
    customerPhone: customer?.phone ? String(customer.phone) : customer?.whatsapp ? String(customer.whatsapp) : null,
    statusKey,
    statusLabel,
    contractStatusKey: contractStatus,
    contractStatusLabel: contract ? formatContractStatusLabel(contractStatus) : 'Contrato pendente',
    reservationExpiresAt: null,
    contractSignedAt: isoDate(
      contract?.signed_at || contract?.customer_signed_at || contract?.updated_at,
    ),
    saleId: String(sale.id),
    reservationId: null,
    contractId: contract?.id ? String(contract.id) : null,
    linkedSaleId: null,
  };
}

function mapReservationItem(
  log: ReservationRow,
  linkedSaleId: string | null,
): MySalesListItem {
  const customer = firstEmbed(log.customers) || firstEmbed(log.customer);
  const block = firstEmbed(log.blocks) || firstEmbed(log.block);
  const project =
    firstEmbed(block?.projects) ||
    firstEmbed(log.projects) ||
    firstEmbed(log.project);
  const blockRow = (block || {}) as BlockLotRow;
  const display = resolveReservationDisplayStatus({
    logStatus: String(log.status || ''),
    expirationTime: isoDate(log.expiration_time),
    blockStatus: block ? String(block.status || '') : null,
    hasLinkedSale: Boolean(linkedSaleId),
  });

  return {
    id: `reservation:${String(log.id)}`,
    type: 'reservation',
    typeLabel: 'Reserva',
    date: isoDate(log.created_at || log.reservation_date),
    projectName: String(project?.name || '—'),
    blockLabel: resolveQuadraFromBlock(blockRow) || '—',
    lotLabel: resolveLoteFromBlock(blockRow) || '—',
    customerName: String(customer?.name || customer?.full_name || '—'),
    customerPhone: customer?.phone ? String(customer.phone) : null,
    statusKey: display,
    statusLabel: formatReservationStatusLabel(display),
    contractStatusKey: null,
    contractStatusLabel: null,
    reservationExpiresAt: isoDate(log.expiration_time),
    contractSignedAt: null,
    saleId: null,
    reservationId: String(log.id),
    contractId: null,
    linkedSaleId,
  };
}

async function loadSalesForBroker(
  admin: SupabaseClient,
  companyId: string,
  brokerId: string,
): Promise<SaleRow[]> {
  const { data, error } = await admin
    .from('sales')
    .select(
      `
      id,
      status,
      sale_date,
      created_at,
      broker_id,
      company_id,
      tenant_id,
      project_id,
      block_id,
      customer_id,
      customers:customer_id ( id, name, full_name, phone, whatsapp ),
      projects:project_id ( id, name ),
      blocks:block_id ( id, number, block_name, name, block, quadra, status, project_id )
    `,
    )
    .eq('broker_id', brokerId)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[mySalesService] sales', error.message);
    throw new Error(error.message);
  }
  return (data || []) as SaleRow[];
}

async function loadContractsBySaleIds(
  admin: SupabaseClient,
  companyId: string,
  saleIds: string[],
): Promise<Map<string, ContractRow>> {
  const map = new Map<string, ContractRow>();
  if (saleIds.length === 0) return map;

  const { data, error } = await admin
    .from('contracts')
    .select(
      'id, sale_id, status, is_current, version, signed_at, customer_signed_at, updated_at, company_id, tenant_id',
    )
    .in('sale_id', saleIds)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('version', { ascending: false });

  if (error) {
    console.warn('[mySalesService] contracts', error.message);
    return map;
  }

  for (const row of (data || []) as ContractRow[]) {
    const saleId = String(row.sale_id || '');
    if (!saleId || map.has(saleId)) continue;
    if (row.is_current === false) continue;
    const st = String(row.status || '').toLowerCase();
    if (st === 'superseded') continue;
    map.set(saleId, row);
  }
  return map;
}

async function loadReservationsForBroker(
  admin: SupabaseClient,
  companyId: string,
  brokerId: string,
): Promise<ReservationRow[]> {
  const { data, error } = await admin
    .from('reservation_logs')
    .select(
      `
      id,
      status,
      created_at,
      expiration_time,
      broker_id,
      block_id,
      customer_id,
      company_id,
      tenant_id,
      customers:customer_id ( id, name, full_name, phone ),
      blocks:block_id (
        id,
        number,
        block_name,
        name,
        block,
        quadra,
        status,
        project_id,
        sale_id,
        projects:project_id ( id, name )
      )
    `,
    )
    .eq('broker_id', brokerId)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[mySalesService] reservation_logs', error.message);
    throw new Error(error.message);
  }
  return (data || []) as ReservationRow[];
}

function buildSummary(
  saleItems: MySalesListItem[],
  reservationItems: MySalesListItem[],
  contractsBySale: Map<string, ContractRow>,
): MySalesSummary {
  const { start, end } = monthBoundsUtc();
  let salesThisMonth = 0;
  let pendingContracts = 0;
  let signedContracts = 0;

  for (const item of saleItems) {
    if (item.statusKey === 'cancelado') continue;
    const d = String(item.date || '');
    if (d >= start && d < end) salesThisMonth += 1;

    const contract = item.saleId ? contractsBySale.get(item.saleId) : null;
    const st = contract ? String(contract.status || '') : null;
    if (isContractSigned(st)) signedContracts += 1;
    else if (isContractPending(st)) pendingContracts += 1;
  }

  const activeReservations = reservationItems.filter((r) =>
    isReservationActiveForKpi(r.statusKey as ReservationDisplayStatus),
  ).length;

  return {
    totalSales: saleItems.filter((s) => s.statusKey !== 'cancelado').length,
    salesThisMonth,
    activeReservations,
    pendingContracts,
    signedContracts,
  };
}

function filterByTab(items: MySalesListItem[], tab: MySalesListTab): MySalesListItem[] {
  if (tab === 'sales') return items.filter((i) => i.type === 'sale');
  if (tab === 'reservations') return items.filter((i) => i.type === 'reservation');
  return items;
}

export async function listMySalesForBroker(
  admin: SupabaseClient,
  input: {
    companyId: string;
    brokerId: string;
    brokerName?: string | null;
    filters?: MySalesListFilters;
  },
): Promise<MySalesListResponse> {
  const filters = input.filters || {};
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || DEFAULT_PAGE_SIZE));
  const tab: MySalesListTab = filters.tab || 'all';

  const [sales, reservations] = await Promise.all([
    loadSalesForBroker(admin, input.companyId, input.brokerId),
    loadReservationsForBroker(admin, input.companyId, input.brokerId),
  ]);

  const saleIds = sales.map((s) => String(s.id));
  const contractsBySale = await loadContractsBySaleIds(admin, input.companyId, saleIds);

  const salesByBlock = new Map<string, string>();
  for (const sale of sales) {
    const blockId = String(sale.block_id || '').trim();
    if (blockId && !salesByBlock.has(blockId)) {
      salesByBlock.set(blockId, String(sale.id));
    }
  }

  const saleItems = sales.map((sale) =>
    mapSaleItem(sale, sale.id ? contractsBySale.get(String(sale.id)) || null : null),
  );

  const reservationItems = reservations.map((log) => {
    const block = firstEmbed(log.blocks) || firstEmbed(log.block);
    const blockId = String(log.block_id || block?.id || '').trim();
    const linked =
      (block?.sale_id ? String(block.sale_id) : null) ||
      (blockId ? salesByBlock.get(blockId) || null : null);
    return mapReservationItem(log, linked);
  });

  const summary = buildSummary(saleItems, reservationItems, contractsBySale);

  let combined = [...saleItems, ...reservationItems].sort((a, b) => {
    const da = String(a.date || '');
    const db = String(b.date || '');
    return db.localeCompare(da);
  });

  if (filters.projectId) {
    const pid = String(filters.projectId);
    const saleProjectIds = new Set(
      sales.filter((s) => String(s.project_id || '') === pid).map((s) => `sale:${s.id}`),
    );
    const resProjectIds = new Set(
      reservations
        .filter((r) => {
          const block = firstEmbed(r.blocks) || firstEmbed(r.block);
          return String(block?.project_id || '') === pid;
        })
        .map((r) => `reservation:${r.id}`),
    );
    combined = combined.filter(
      (i) => saleProjectIds.has(i.id) || resProjectIds.has(i.id),
    );
  }

  combined = filterByTab(combined, tab).filter((i) => matchesFilters(i, filters));

  const total = combined.length;
  const startIdx = (page - 1) * pageSize;
  const items = combined.slice(startIdx, startIdx + pageSize);

  const projectMap = new Map<string, string>();
  for (const sale of sales) {
    const p = firstEmbed(sale.projects);
    const id = String(sale.project_id || p?.id || '');
    const name = String(p?.name || '');
    if (id && name) projectMap.set(id, name);
  }
  for (const log of reservations) {
    const block = firstEmbed(log.blocks);
    const p = firstEmbed(block?.projects);
    const id = String(block?.project_id || p?.id || '');
    const name = String(p?.name || '');
    if (id && name) projectMap.set(id, name);
  }

  return {
    brokerName: input.brokerName || null,
    summary,
    items,
    total,
    page,
    pageSize,
    projects: [...projectMap.entries()].map(([id, name]) => ({ id, name })),
  };
}

export async function getMySalesDetailForBroker(
  admin: SupabaseClient,
  input: {
    companyId: string;
    brokerId: string;
    brokerName?: string | null;
    recordId: string;
    type: 'sale' | 'reservation';
  },
): Promise<MySalesDetail | null> {
  const list = await listMySalesForBroker(admin, {
    companyId: input.companyId,
    brokerId: input.brokerId,
    brokerName: input.brokerName,
    filters: { tab: input.type === 'sale' ? 'sales' : 'reservations', pageSize: 500 },
  });

  const prefix = input.type === 'sale' ? 'sale:' : 'reservation:';
  const targetId = input.recordId.startsWith(prefix)
    ? input.recordId
    : `${prefix}${input.recordId}`;
  const item = list.items.find((i) => i.id === targetId || i.saleId === input.recordId || i.reservationId === input.recordId);
  if (!item) return null;

  return {
    ...item,
    brokerName: input.brokerName || null,
    projectId: null,
    blockId: null,
    customerId: null,
  };
}

export { DEFAULT_PAGE_SIZE };
