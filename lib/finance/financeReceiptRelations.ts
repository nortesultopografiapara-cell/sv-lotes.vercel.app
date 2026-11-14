/**
 * Leitura do Financeiro em duas etapas.
 *
 * A parcela continua com o embed original de venda e contrato.
 * O primeiro contrato é o que o PostgREST devolver, sem nova regra.
 * Cliente, projeto e quadra vêm de uma leitura paginada por cadastro.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RlsContext } from '@/lib/rls';
import { fetchAllTenantRowsPaged } from '@/lib/finance/fetchTenantRowsPaged';
import {
  FINANCE_RECEIPTS_SALE_CONTRACT_EMBED,
  FINANCE_RECEIPT_VALUE_COLUMNS,
} from '@/lib/finance/financeColumnCatalog';

export { FINANCE_RECEIPTS_SALE_CONTRACT_EMBED };

export const FINANCE_RECEIPTS_ESSENTIAL_SELECT = [
  ...FINANCE_RECEIPT_VALUE_COLUMNS,
  FINANCE_RECEIPTS_SALE_CONTRACT_EMBED,
].join(', ');

/** Se uma coluna opcional não existir, a parcela e o contrato continuam na leitura. */
export const FINANCE_RECEIPTS_ESSENTIAL_SELECT_FALLBACK = [
  'id',
  'status',
  'amount',
  'paid_amount',
  'paid_at',
  'due_date',
  'created_at',
  'installment_number',
  'sale_id',
  'customer_id',
  'project_id',
  'block_id',
  'financial_account_id',
  FINANCE_RECEIPTS_SALE_CONTRACT_EMBED,
].join(', ');

export type FinanceReceiptCustomerRef = {
  id: string;
  name: string | null;
  full_name: string | null;
  phone: string | null;
  document: string | null;
  cpf_cnpj: string | null;
};

export type FinanceReceiptProjectRef = {
  id: string;
  name: string | null;
};

export type FinanceReceiptBlockRef = {
  id: string;
  block_name: string | null;
  name: string | null;
  number: string | null;
  lot_number: string | null;
  project_id: string | null;
};

export type FinanceReceiptRelationMaps = {
  customers: Map<string, FinanceReceiptCustomerRef>;
  projects: Map<string, FinanceReceiptProjectRef>;
  blocks: Map<string, FinanceReceiptBlockRef>;
};

function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function asId(value: unknown): string {
  return String(value || '').trim();
}

function abortError(): Error {
  return Object.assign(new Error('AbortError'), { name: 'AbortError' });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

async function loadTable<T extends { id?: string }>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  table: string;
  select: string;
  selectFallback: string;
  signal?: AbortSignal;
}): Promise<T[]> {
  throwIfAborted(params.signal);
  const loaded = await fetchAllTenantRowsPaged<T>({
    supabase: params.supabase,
    rlsCtx: params.rlsCtx,
    table: params.table,
    select: params.select,
    selectFallback: params.selectFallback,
    orderColumn: 'id',
    fetchPageSize: 1000,
  });
  throwIfAborted(params.signal);
  return loaded.rows;
}

export async function loadFinanceReceiptRelations(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  signal?: AbortSignal;
  customerSelect?: string;
  customerSelectFallback?: string;
  blockSelect?: string;
  blockSelectFallback?: string;
}): Promise<FinanceReceiptRelationMaps> {
  throwIfAborted(params.signal);
  const [customers, projects, blocks] = await Promise.all([
    loadTable<FinanceReceiptCustomerRef>({
      supabase: params.supabase,
      rlsCtx: params.rlsCtx,
      table: 'customers',
      select: params.customerSelect || 'id, name, full_name, phone, document, cpf_cnpj',
      selectFallback: params.customerSelectFallback || 'id, name, phone, document',
      signal: params.signal,
    }),
    loadTable<FinanceReceiptProjectRef>({
      supabase: params.supabase,
      rlsCtx: params.rlsCtx,
      table: 'projects',
      select: 'id, name',
      selectFallback: 'id, name',
      signal: params.signal,
    }),
    loadTable<FinanceReceiptBlockRef>({
      supabase: params.supabase,
      rlsCtx: params.rlsCtx,
      table: 'blocks',
      select: params.blockSelect || 'id, block_name, name, number, lot_number, project_id',
      selectFallback: params.blockSelectFallback || 'id, name, number, project_id',
      signal: params.signal,
    }),
  ]);

  const customerMap = new Map<string, FinanceReceiptCustomerRef>();
  for (const row of customers) {
    const id = asId(row.id);
    if (!id || customerMap.has(id)) continue;
    customerMap.set(id, {
      id,
      name: asText(row.name),
      full_name: asText(row.full_name),
      phone: asText(row.phone),
      document: asText(row.document),
      cpf_cnpj: asText(row.cpf_cnpj),
    });
  }

  const projectMap = new Map<string, FinanceReceiptProjectRef>();
  for (const row of projects) {
    const id = asId(row.id);
    if (!id || projectMap.has(id)) continue;
    projectMap.set(id, { id, name: asText(row.name) });
  }

  const blockMap = new Map<string, FinanceReceiptBlockRef>();
  for (const row of blocks) {
    const id = asId(row.id);
    if (!id || blockMap.has(id)) continue;
    blockMap.set(id, {
      id,
      block_name: asText(row.block_name),
      name: asText(row.name),
      number: row.number == null ? null : String(row.number),
      lot_number: row.lot_number == null ? null : String(row.lot_number),
      project_id: asText(row.project_id),
    });
  }

  return {
    customers: customerMap,
    projects: projectMap,
    blocks: blockMap,
  };
}

export function applyFinanceReceiptRelations<T extends Record<string, unknown>>(
  rows: T[],
  maps: FinanceReceiptRelationMaps,
): T[] {
  return rows.map((row) => {
    const customerId = asId(row.customer_id);
    const projectId = asId(row.project_id);
    const blockId = asId(row.block_id);
    return {
      ...row,
      customers: customerId ? maps.customers.get(customerId) || null : null,
      projects: projectId ? maps.projects.get(projectId) || null : null,
      blocks: blockId ? maps.blocks.get(blockId) || null : null,
    };
  });
}
