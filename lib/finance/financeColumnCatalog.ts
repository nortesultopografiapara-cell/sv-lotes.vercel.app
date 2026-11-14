/**
 * Descobre as colunas reais pelo catálogo do PostgREST antes da leitura.
 * A parcela não pede uma coluna ausente, e o campo continua na leitura
 * quando o catálogo do ambiente o lista.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';

/** Igual ao embed publicado. Não reordenar nem filtrar o contrato. */
export const FINANCE_RECEIPTS_SALE_CONTRACT_EMBED =
  'sales:sale_id(id, installments_count, projects(name), contracts(contract_number))';

export const FINANCE_RECEIPT_VALUE_COLUMNS = [
  'id',
  'status',
  'amount',
  'paid_amount',
  'paid_at',
  'due_date',
  'created_at',
  'description',
  'installment_number',
  'schedule_group',
  'sale_id',
  'customer_id',
  'project_id',
  'block_id',
  'contract_id',
  'broker_id',
  'financial_account_id',
] as const;

export const FINANCE_CUSTOMER_READ_COLUMNS = [
  'id',
  'name',
  'full_name',
  'phone',
  'document',
  'cpf_cnpj',
] as const;

export const FINANCE_BLOCK_READ_COLUMNS = [
  'id',
  'block_name',
  'name',
  'number',
  'lot_number',
  'project_id',
] as const;

const CATALOG_STORAGE_KEY = 'sv-lotes.finance-column-catalog';
const OMISSION_STORAGE_KEY = 'sv-lotes.finance-omitted-columns';
const CATALOG_TABLES = ['finance_receipts', 'customers', 'blocks'] as const;

export type FinanceColumnCatalog = Record<(typeof CATALOG_TABLES)[number], string[]>;

export type FinanceReadSelect = {
  select: string;
  fallback: string;
  omitted: string[];
};

type OpenApiSpec = {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
  components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
};

let memoryCatalog: FinanceColumnCatalog | null = null;

function columnsOf(spec: OpenApiSpec, table: string): string[] | null {
  const node =
    spec.definitions?.[table] ||
    spec.components?.schemas?.[table] ||
    spec.definitions?.[`public.${table}`] ||
    spec.components?.schemas?.[`public.${table}`];
  const properties = node?.properties;
  if (!properties) return null;
  const names = Object.keys(properties).filter((name) => /^[a-z_][a-z0-9_]*$/i.test(name));
  return names.length > 0 ? names : null;
}

export function catalogFromOpenApi(spec: OpenApiSpec): FinanceColumnCatalog | null {
  const finance = columnsOf(spec, 'finance_receipts');
  const customers = columnsOf(spec, 'customers');
  const blocks = columnsOf(spec, 'blocks');
  if (!finance?.includes('id') || !customers?.includes('id') || !blocks?.includes('id')) {
    return null;
  }
  return { finance_receipts: finance, customers, blocks };
}

function selectFromColumns(desired: readonly string[], present: Set<string> | null, fallbackDesired: readonly string[]): FinanceReadSelect {
  if (!present) {
    return {
      select: desired.join(', '),
      fallback: fallbackDesired.join(', '),
      omitted: [],
    };
  }
  const kept = desired.filter((column) => present.has(column));
  const omitted = desired.filter((column) => !present.has(column));
  const select = (kept.length > 0 ? kept : fallbackDesired.filter((column) => present.has(column))).join(', ');
  return { select, fallback: select, omitted };
}

export function buildReceiptReadSelect(columns: string[] | null): FinanceReadSelect {
  const present = columns ? new Set(columns) : null;
  const built = selectFromColumns(
    FINANCE_RECEIPT_VALUE_COLUMNS,
    present,
    FINANCE_RECEIPT_VALUE_COLUMNS.filter((column) => column !== 'description'),
  );
  if (!built.select.includes('id')) return built;
  const withEmbed = [built.select, FINANCE_RECEIPTS_SALE_CONTRACT_EMBED].filter(Boolean).join(', ');
  return { ...built, select: withEmbed, fallback: withEmbed };
}

export function buildCustomerReadSelect(columns: string[] | null): FinanceReadSelect {
  return selectFromColumns(
    FINANCE_CUSTOMER_READ_COLUMNS,
    columns ? new Set(columns) : null,
    ['id', 'name', 'phone', 'document'],
  );
}

export function buildBlockReadSelect(columns: string[] | null): FinanceReadSelect {
  return selectFromColumns(
    FINANCE_BLOCK_READ_COLUMNS,
    columns ? new Set(columns) : null,
    ['id', 'name', 'number', 'project_id'],
  );
}

function readStoredCatalog(): FinanceColumnCatalog | null {
  if (memoryCatalog) return memoryCatalog;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceColumnCatalog;
    if (!parsed.finance_receipts?.includes('id') || !parsed.customers?.includes('id')) return null;
    memoryCatalog = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function storeCatalog(catalog: FinanceColumnCatalog, omitted: string[]) {
  memoryCatalog = catalog;
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    sessionStorage.setItem(OMISSION_STORAGE_KEY, JSON.stringify(omitted));
  } catch {
    /* ambiente sem storage */
  }
}

export function financeOmittedColumns(catalog: FinanceColumnCatalog | null): string[] {
  if (!catalog) return [];
  const receipt = buildReceiptReadSelect(catalog.finance_receipts).omitted.map(
    (column) => `finance_receipts.${column}`,
  );
  const customer = buildCustomerReadSelect(catalog.customers).omitted.map(
    (column) => `customers.${column}`,
  );
  const block = buildBlockReadSelect(catalog.blocks).omitted.map((column) => `blocks.${column}`);
  return [...receipt, ...customer, ...block];
}

async function sampleTableColumns(
  supabase: SupabaseClient,
  rlsCtx: RlsContext,
  table: string,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (signal?.aborted) return null;
  let query = supabase.from(table).select('*').limit(1);
  query = applyTenantFilter(query, rlsCtx, table);
  const { data, error } = await query;
  if (error || !Array.isArray(data) || !data[0] || typeof data[0] !== 'object') return null;
  const names = Object.keys(data[0] as Record<string, unknown>).filter((name) =>
    /^[a-z_][a-z0-9_]*$/i.test(name),
  );
  return names.includes('id') ? names : null;
}

export async function loadFinanceColumnCatalog(
  supabase: SupabaseClient,
  rlsCtx: RlsContext,
  signal?: AbortSignal,
): Promise<FinanceColumnCatalog | null> {
  const stored = readStoredCatalog();
  if (stored) return stored;
  try {
    const [receipts, customers, blocks] = await Promise.all([
      sampleTableColumns(supabase, rlsCtx, 'finance_receipts', signal),
      sampleTableColumns(supabase, rlsCtx, 'customers', signal),
      sampleTableColumns(supabase, rlsCtx, 'blocks', signal),
    ]);
    if (!receipts || !customers || !blocks) return null;
    const catalog = { finance_receipts: receipts, customers, blocks };
    storeCatalog(catalog, financeOmittedColumns(catalog));
    return catalog;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
