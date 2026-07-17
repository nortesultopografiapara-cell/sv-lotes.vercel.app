/**
 * Serviço Minhas Vendas — consultas escopadas ao corretor autenticado.
 * Schema real: sales + blocks (status Reservado). Sem reservation_logs.
 * Clientes: customers.name. Quadra/lote: block_name + number/lot_number.
 * Sem campos financeiros. Sem columns blocks.block / blocks.quadra.
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

/** Select whitelist — alinhado ao Financeiro/Contratos (sem colunas inexistentes). */
export const MY_SALES_CUSTOMER_EMBED = 'id, name, phone';

/** Quadra = block_name; Lote = number / lot_number (mesmo padrão finance/contracts). */
export const MY_SALES_BLOCK_EMBED =
  'id, block_name, name, number, lot_number, status, project_id, sale_id';

export const MY_SALES_SALES_SELECT = `
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
  customers:customer_id ( ${MY_SALES_CUSTOMER_EMBED} ),
  projects:project_id ( id, name ),
  blocks:block_id ( ${MY_SALES_BLOCK_EMBED} )
`;

export const MY_SALES_BLOCKS_RESERVATION_SELECT = `
  id,
  status,
  broker_id,
  customer_id,
  project_id,
  company_id,
  tenant_id,
  reservation_expires_at,
  reservation_date,
  created_at,
  updated_at,
  block_name,
  name,
  number,
  lot_number,
  sale_id,
  customers:customer_id ( ${MY_SALES_CUSTOMER_EMBED} ),
  projects:project_id ( id, name )
`;

/** Colunas proibidas / obrigatórias — contrato de schema para testes. */
export const MY_SALES_FORBIDDEN_BLOCK_COLUMNS = ['block', 'quadra'] as const;
export const MY_SALES_REQUIRED_BLOCK_FIELDS = ['block_name', 'number'] as const;

/**
 * Select de contracts — alinhado ao schema real (migrations + módulo Contratos).
 * Assinado = status assinado|signed; data complementar = signed_at.
 * Versão atual: is_current !== false, maior version.
 * Sem updated_at (coluna inexistente em public.contracts).
 */
export const MY_SALES_CONTRACTS_SELECT =
  'id, sale_id, status, is_current, version, signed_at, created_at, company_id, tenant_id';

/** Nomes de colunas que não devem entrar no select de contracts. */
export const MY_SALES_FORBIDDEN_CONTRACT_COLUMNS = [
  'customer_signed_at',
  'updated_at',
] as const;

export function parseSelectFieldList(select: string): string[] {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s+/g, ' '))
    .map((part) => {
      // "customers:customer_id ( ... )" → ignore embed wrappers in leaf lists
      const bare = part.split(/\s+/)[0] || part;
      return bare.replace(/\(.*$/, '').trim();
    })
    .filter((f) => f && !f.includes(':'));
}

export function assertMySalesBlockSelectSchema(select: string): void {
  const fields = parseSelectFieldList(select);
  for (const required of MY_SALES_REQUIRED_BLOCK_FIELDS) {
    if (!fields.includes(required) && !select.includes(required)) {
      throw new Error(`mySales block select missing required field: ${required}`);
    }
  }
  for (const forbidden of MY_SALES_FORBIDDEN_BLOCK_COLUMNS) {
    if (fields.includes(forbidden)) {
      throw new Error(`mySales block select must not request columns.${forbidden}`);
    }
  }
}
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

function customerDisplayName(customer: Record<string, unknown> | null): string {
  if (!customer) return '—';
  return String(customer.name || '').trim() || '—';
}

function customerPhone(customer: Record<string, unknown> | null): string | null {
  if (!customer) return null;
  if (customer.phone) return String(customer.phone);
  return null;
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
  // Lotes com status Reservado são a fonte real; outros status não-reservados
  // com sale_id já tratados acima.
  if (blockSt && blockSt !== 'reservado' && blockSt !== 'reserved') {
    if (blockSt === 'disponivel' || blockSt === 'available' || blockSt === 'disponível') {
      return 'cancelada';
    }
  }

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
  options?: { contractsAvailable?: boolean },
): MySalesListItem {
  const customer = firstEmbed(sale.customers) || firstEmbed(sale.customer);
  const project = firstEmbed(sale.projects) || firstEmbed(sale.project);
  const block = firstEmbed(sale.blocks) || firstEmbed(sale.block);
  const blockRow = (block || {}) as BlockLotRow;
  const saleStatus = String(sale.status || '');
  const contractsAvailable = options?.contractsAvailable !== false;
  const contractStatus = contract ? String(contract.status || '') : null;

  let statusKey = saleStatus || 'ativo';
  let statusLabel = formatSaleStatusLabel(saleStatus);
  if (isCanceledSale(sale)) {
    statusKey = 'cancelado';
    statusLabel = 'Cancelado';
  } else if (contractsAvailable && isContractSigned(contractStatus)) {
    statusKey = 'assinado';
    statusLabel = 'Assinado';
  } else if (contractsAvailable && contract && isContractPending(contractStatus)) {
    statusKey = 'contrato_pendente';
    statusLabel = 'Contrato pendente';
  } else if (contractsAvailable && !contract && !isCanceledSale(sale)) {
    statusKey = 'contrato_pendente';
    statusLabel = 'Contrato pendente';
  }

  let contractStatusLabel: string | null = null;
  if (contractsAvailable) {
    contractStatusLabel = contract
      ? formatContractStatusLabel(contractStatus)
      : 'Contrato pendente';
  }

  return {
    id: `sale:${String(sale.id)}`,
    type: 'sale',
    typeLabel: 'Venda',
    date: isoDate(sale.sale_date || sale.created_at),
    projectName: String(project?.name || '—'),
    blockLabel: resolveQuadraFromBlock(blockRow) || '—',
    lotLabel: resolveLoteFromBlock(blockRow) || '—',
    customerName: customerDisplayName(customer),
    customerPhone: customerPhone(customer),
    statusKey,
    statusLabel,
    contractStatusKey: contractsAvailable ? contractStatus : null,
    contractStatusLabel,
    reservationExpiresAt: null,
    // Data real de assinatura no módulo Contratos: contracts.signed_at
    contractSignedAt: contractsAvailable
      ? isoDate(contract?.signed_at || null)
      : null,
    saleId: String(sale.id),
    reservationId: null,
    contractId: contract?.id ? String(contract.id) : null,
    linkedSaleId: null,
  };
}

function mapBlockReservationItem(
  block: ReservationRow,
  linkedSaleId: string | null,
): MySalesListItem {
  const customer = firstEmbed(block.customers) || firstEmbed(block.customer);
  const project = firstEmbed(block.projects) || firstEmbed(block.project);
  const blockRow = block as BlockLotRow;
  const display = resolveReservationDisplayStatus({
    logStatus: 'active',
    expirationTime: isoDate(block.reservation_expires_at),
    blockStatus: String(block.status || ''),
    hasLinkedSale: Boolean(linkedSaleId || block.sale_id),
  });

  return {
    id: `reservation:${String(block.id)}`,
    type: 'reservation',
    typeLabel: 'Reserva',
    date: isoDate(block.reservation_date || block.updated_at || block.created_at),
    projectName: String(project?.name || '—'),
    blockLabel: resolveQuadraFromBlock(blockRow) || '—',
    lotLabel: resolveLoteFromBlock(blockRow) || '—',
    customerName: customerDisplayName(customer),
    customerPhone: customerPhone(customer),
    statusKey: display,
    statusLabel: formatReservationStatusLabel(display),
    contractStatusKey: null,
    contractStatusLabel: null,
    reservationExpiresAt: isoDate(block.reservation_expires_at),
    contractSignedAt: null,
    saleId: null,
    reservationId: String(block.id),
    contractId: null,
    linkedSaleId: linkedSaleId || (block.sale_id ? String(block.sale_id) : null),
  };
}

/** IDs legítimos do corretor (cadastro + auth legado em sales.broker_id). */
export function resolveBrokerMatchIds(input: {
  brokerId: string;
  authUserId?: string | null;
  userId?: string | null;
}): string[] {
  const ids = new Set<string>();
  for (const raw of [input.brokerId, input.authUserId, input.userId]) {
    const id = String(raw || '').trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

async function loadSalesForBroker(
  admin: SupabaseClient,
  companyId: string,
  brokerMatchIds: string[],
): Promise<SaleRow[]> {
  if (brokerMatchIds.length === 0) return [];

  const { data, error } = await admin
    .from('sales')
    .select(MY_SALES_SALES_SELECT)
    .in('broker_id', brokerMatchIds)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[mySalesService] sales', error.message);
    throw new Error(`Falha ao consultar vendas: ${error.message}`);
  }
  return (data || []) as SaleRow[];
}

export type MySalesContractsLoadResult = {
  map: Map<string, ContractRow>;
  unavailable: boolean;
  errorMessage: string | null;
};

/**
 * Consulta complementar — falha NÃO deve derrubar vendas/reservas.
 * Status assinado/pendente segue contracts.status (módulo Contratos).
 */
export async function loadContractsBySaleIds(
  admin: SupabaseClient,
  companyId: string,
  saleIds: string[],
): Promise<MySalesContractsLoadResult> {
  const map = new Map<string, ContractRow>();
  if (saleIds.length === 0) {
    return { map, unavailable: false, errorMessage: null };
  }

  const { data, error } = await admin
    .from('contracts')
    .select(MY_SALES_CONTRACTS_SELECT)
    .in('sale_id', saleIds)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('version', { ascending: false });

  if (error) {
    console.error('[mySalesService] contracts', error.message);
    return {
      map,
      unavailable: true,
      errorMessage: `Dados de contratos indisponíveis: ${error.message}`,
    };
  }

  for (const row of (data || []) as ContractRow[]) {
    const saleId = String(row.sale_id || '');
    if (!saleId || map.has(saleId)) continue;
    if (row.is_current === false) continue;
    const st = String(row.status || '').toLowerCase();
    if (st === 'superseded') continue;
    map.set(saleId, row);
  }
  return { map, unavailable: false, errorMessage: null };
}

/**
 * Reservas reais: lotes em `blocks` com status Reservado e broker_id do corretor.
 * (reservation_logs não existe no banco homolog/prod atual.)
 */
async function loadReservationsForBroker(
  admin: SupabaseClient,
  companyId: string,
  brokerMatchIds: string[],
): Promise<ReservationRow[]> {
  if (brokerMatchIds.length === 0) return [];

  const { data, error } = await admin
    .from('blocks')
    .select(MY_SALES_BLOCKS_RESERVATION_SELECT)
    .in('broker_id', brokerMatchIds)
    .eq('status', 'Reservado')
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('reservation_date', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[mySalesService] blocks(Reservado)', error.message);
    throw new Error(`Falha ao consultar reservas: ${error.message}`);
  }
  return (data || []) as ReservationRow[];
}

function buildSummary(
  saleItems: MySalesListItem[],
  reservationItems: MySalesListItem[],
  contractsBySale: Map<string, ContractRow>,
  contractsAvailable: boolean,
): MySalesSummary {
  const { start, end } = monthBoundsUtc();
  let salesThisMonth = 0;
  let pendingContracts = 0;
  let signedContracts = 0;

  for (const item of saleItems) {
    if (item.statusKey === 'cancelado') continue;
    const d = String(item.date || '');
    if (d >= start && d < end) salesThisMonth += 1;

    if (!contractsAvailable) continue;
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
    pendingContracts: contractsAvailable ? pendingContracts : null,
    signedContracts: contractsAvailable ? signedContracts : null,
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
    authUserId?: string | null;
    userId?: string | null;
    filters?: MySalesListFilters;
  },
): Promise<MySalesListResponse> {
  const filters = input.filters || {};
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || DEFAULT_PAGE_SIZE));
  const tab: MySalesListTab = filters.tab || 'all';
  const brokerMatchIds = resolveBrokerMatchIds({
    brokerId: input.brokerId,
    authUserId: input.authUserId,
    userId: input.userId,
  });

  const [sales, reservations] = await Promise.all([
    loadSalesForBroker(admin, input.companyId, brokerMatchIds),
    loadReservationsForBroker(admin, input.companyId, brokerMatchIds),
  ]);

  const saleIds = sales.map((s) => String(s.id));
  const contractsLoad = await loadContractsBySaleIds(admin, input.companyId, saleIds);
  const contractsBySale = contractsLoad.map;
  const contractsAvailable = !contractsLoad.unavailable;

  const salesByBlock = new Map<string, string>();
  for (const sale of sales) {
    const blockId = String(sale.block_id || '').trim();
    if (blockId && !salesByBlock.has(blockId)) {
      salesByBlock.set(blockId, String(sale.id));
    }
  }

  const saleItems = sales.map((sale) =>
    mapSaleItem(
      sale,
      sale.id ? contractsBySale.get(String(sale.id)) || null : null,
      { contractsAvailable },
    ),
  );

  const reservationItems = reservations.map((block) => {
    const blockId = String(block.id || '').trim();
    const linked =
      (block.sale_id ? String(block.sale_id) : null) ||
      (blockId ? salesByBlock.get(blockId) || null : null);
    return mapBlockReservationItem(block, linked);
  });

  const summary = buildSummary(
    saleItems,
    reservationItems,
    contractsBySale,
    contractsAvailable,
  );

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
        .filter((r) => String(r.project_id || '') === pid)
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
  for (const block of reservations) {
    const p = firstEmbed(block.projects);
    const id = String(block.project_id || p?.id || '');
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
    contractsUnavailable: contractsLoad.unavailable || undefined,
    contractsWarning: contractsLoad.errorMessage,
  };
}

export async function getMySalesDetailForBroker(
  admin: SupabaseClient,
  input: {
    companyId: string;
    brokerId: string;
    brokerName?: string | null;
    authUserId?: string | null;
    userId?: string | null;
    recordId: string;
    type: 'sale' | 'reservation';
  },
): Promise<MySalesDetail | null> {
  const list = await listMySalesForBroker(admin, {
    companyId: input.companyId,
    brokerId: input.brokerId,
    brokerName: input.brokerName,
    authUserId: input.authUserId,
    userId: input.userId,
    filters: { tab: input.type === 'sale' ? 'sales' : 'reservations', pageSize: 500 },
  });

  const prefix = input.type === 'sale' ? 'sale:' : 'reservation:';
  const targetId = input.recordId.startsWith(prefix)
    ? input.recordId
    : `${prefix}${input.recordId}`;
  const item = list.items.find(
    (i) =>
      i.id === targetId ||
      i.saleId === input.recordId ||
      i.reservationId === input.recordId,
  );
  if (!item) return null;

  return {
    ...item,
    brokerName: input.brokerName || null,
    projectId: null,
    blockId: item.reservationId || null,
    customerId: null,
  };
}

export { DEFAULT_PAGE_SIZE };
