/**
 * Listagem e resumo — Contratos Antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isLegacyContractSchemaColumnError,
  LEGACY_CONTRACT_BASE_SELECT,
  LEGACY_CONTRACT_EXTENDED_SELECT,
  type LegacyContractSchemaMode,
} from '@/lib/legacy-contracts/schemaCompat';
import { buildCustomerTenantOrFilter, buildLegacyContractTenantOrFilter } from '@/lib/legacy-contracts/tenantScope';
import type {
  LegacyContractLinkType,
  LegacyContractListFilters,
  LegacyContractListItem,
  LegacyContractListResult,
  LegacyContractListSummary,
} from '@/lib/legacy-contracts/types';

type LegacyContractRow = {
  id: string;
  sale_id: string;
  customer_id: string | null;
  project_id: string | null;
  block_id: string | null;
  quadra?: string | null;
  lote?: string | null;
  original_file_name: string;
  link_type?: string | null;
  source?: string | null;
  migration_id?: string | null;
  notes: string | null;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  created_at: string;
  company_id?: string | null;
  tenant_id?: string | null;
};

type ListQuery = {
  select: string;
  schemaMode: LegacyContractSchemaMode;
};

function resolveListQuery(schemaMode: LegacyContractSchemaMode): ListQuery {
  return {
    schemaMode,
    select:
      schemaMode === 'extended'
        ? LEGACY_CONTRACT_EXTENDED_SELECT
        : LEGACY_CONTRACT_BASE_SELECT,
  };
}

function applyTenantScope<T extends { or: (filters: string) => T }>(
  query: T,
  tenantId: string,
): T {
  return query.or(buildLegacyContractTenantOrFilter(tenantId));
}

function applyTextFilters<T extends {
  eq: (column: string, value: string) => T;
  ilike: (column: string, pattern: string) => T;
}>(
  query: T,
  filters: LegacyContractListFilters,
  schemaMode: LegacyContractSchemaMode,
): T {
  let next = query;

  if (filters.projectId) {
    next = next.eq('project_id', filters.projectId);
  }
  if (schemaMode === 'extended') {
    if (filters.quadra?.trim()) {
      next = next.ilike('quadra', `%${filters.quadra.trim()}%`);
    }
    if (filters.lote?.trim()) {
      next = next.ilike('lote', `%${filters.lote.trim()}%`);
    }
    if (filters.linkType === 'automatic' || filters.linkType === 'manual') {
      next = next.eq('link_type', filters.linkType);
    }
  }
  if (filters.fileName?.trim()) {
    next = next.ilike('original_file_name', `%${filters.fileName.trim()}%`);
  }

  return next;
}

function applyActiveScope<T extends {
  eq: (column: string, value: boolean) => T;
  is: (column: string, value: null) => T;
}>(query: T, schemaMode: LegacyContractSchemaMode): T {
  if (schemaMode !== 'extended') return query;
  return query.eq('is_active', true).is('deleted_at', null);
}

async function loadNameMaps(
  admin: SupabaseClient,
  rows: LegacyContractRow[],
): Promise<{
  projects: Map<string, string>;
  customers: Map<string, string>;
  blocks: Map<string, { quadra: string | null; lote: string | null }>;
}> {
  const projectIds = [...new Set(rows.map((row) => row.project_id).filter(Boolean))] as string[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[];
  const blockIds = [...new Set(rows.map((row) => row.block_id).filter(Boolean))] as string[];

  const projects = new Map<string, string>();
  const customers = new Map<string, string>();
  const blocks = new Map<string, { quadra: string | null; lote: string | null }>();

  if (projectIds.length > 0) {
    const { data } = await admin.from('projects').select('id, name').in('id', projectIds);
    for (const row of data || []) {
      projects.set(String(row.id), String(row.name || ''));
    }
  }

  if (customerIds.length > 0) {
    const { data } = await admin.from('customers').select('id, name').in('id', customerIds);
    for (const row of data || []) {
      customers.set(String(row.id), String(row.name || ''));
    }
  }

  if (blockIds.length > 0) {
    const { data } = await admin
      .from('blocks')
      .select('id, block_name, lot_number, number')
      .in('id', blockIds);
    for (const row of data || []) {
      blocks.set(String(row.id), {
        quadra: row.block_name ? String(row.block_name) : null,
        lote: row.lot_number
          ? String(row.lot_number)
          : row.number
            ? String(row.number)
            : null,
      });
    }
  }

  return { projects, customers, blocks };
}

function mapRow(
  row: LegacyContractRow,
  names: Awaited<ReturnType<typeof loadNameMaps>>,
  schemaMode: LegacyContractSchemaMode,
): LegacyContractListItem {
  const block = row.block_id ? names.blocks.get(String(row.block_id)) : undefined;

  return {
    id: String(row.id),
    sale_id: String(row.sale_id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    block_id: row.block_id ? String(row.block_id) : null,
    project_name: row.project_id ? names.projects.get(String(row.project_id)) || null : null,
    customer_name: row.customer_id ? names.customers.get(String(row.customer_id)) || null : null,
    quadra: row.quadra ? String(row.quadra) : block?.quadra || null,
    lote: row.lote ? String(row.lote) : block?.lote || null,
    original_file_name: String(row.original_file_name || ''),
    link_type:
      schemaMode === 'extended' && row.link_type === 'manual'
        ? 'manual'
        : ('automatic' as LegacyContractLinkType),
    source: String(row.source || 'legacy_migration'),
    migration_id: row.migration_id ? String(row.migration_id) : null,
    notes: row.notes ? String(row.notes) : null,
    contract_number: row.contract_number ? String(row.contract_number) : null,
    contract_date: row.contract_date ? String(row.contract_date) : null,
    status: String(row.status || 'ANTIGO'),
    created_at: String(row.created_at || ''),
  };
}

async function queryLegacyContractRows(params: {
  admin: SupabaseClient;
  tenantId: string;
  filters: LegacyContractListFilters;
  ownerProjectIds?: string[] | null;
  schemaMode: LegacyContractSchemaMode;
  page: number;
  pageSize: number;
}): Promise<{ rows: LegacyContractRow[]; count: number }> {
  const { select } = resolveListQuery(params.schemaMode);
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = params.admin
    .from('legacy_contract_documents')
    .select(select, { count: 'exact' })
    .order('created_at', { ascending: false });

  query = applyTenantScope(query, params.tenantId);
  query = applyActiveScope(query, params.schemaMode);

  if (params.ownerProjectIds && params.ownerProjectIds.length > 0) {
    query = query.in('project_id', params.ownerProjectIds);
  }

  query = applyTextFilters(query, params.filters, params.schemaMode);

  if (params.filters.customer?.trim()) {
    const customerTerm = params.filters.customer.trim();
    const { data: customers, error: customerError } = await params.admin
      .from('customers')
      .select('id')
      .or(buildCustomerTenantOrFilter(params.tenantId))
      .ilike('name', `%${customerTerm}%`)
      .limit(50);

    if (customerError) {
      throw new Error(`Erro ao filtrar clientes: ${customerError.message}`);
    }

    const customerIds = (customers || []).map((row) => String(row.id)).filter(Boolean);
    if (customerIds.length === 0) {
      return { rows: [], count: 0 };
    }
    query = query.in('customer_id', customerIds);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw error;
  }

  return {
    rows: (data || []) as LegacyContractRow[],
    count: count || 0,
  };
}

async function listWithSchemaFallback(params: {
  admin: SupabaseClient;
  tenantId: string;
  filters: LegacyContractListFilters;
  ownerProjectIds?: string[] | null;
  page: number;
  pageSize: number;
}): Promise<{ rows: LegacyContractRow[]; count: number; schemaMode: LegacyContractSchemaMode }> {
  try {
    const result = await queryLegacyContractRows({ ...params, schemaMode: 'extended' });
    return { ...result, schemaMode: 'extended' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isLegacyContractSchemaColumnError(message)) {
      throw new Error(`Erro ao listar contratos antigos: ${message}`);
    }
    console.warn('[legacy-contracts] fallback para schema base:', message);
    const result = await queryLegacyContractRows({ ...params, schemaMode: 'base' });
    return { ...result, schemaMode: 'base' };
  }
}

export async function listLegacyContractDocuments(params: {
  admin: SupabaseClient;
  tenantId: string;
  filters: LegacyContractListFilters;
  ownerProjectIds?: string[] | null;
}): Promise<LegacyContractListResult> {
  const page = Math.max(1, params.filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.filters.pageSize || 25));

  const listed = await listWithSchemaFallback({
    admin: params.admin,
    tenantId: params.tenantId,
    filters: params.filters,
    ownerProjectIds: params.ownerProjectIds,
    page,
    pageSize,
  });

  const names = await loadNameMaps(params.admin, listed.rows);
  const summary = await loadLegacyContractSummary({
    admin: params.admin,
    tenantId: params.tenantId,
    ownerProjectIds: params.ownerProjectIds,
  });

  return {
    items: listed.rows.map((row) => mapRow(row, names, listed.schemaMode)),
    summary,
    total: listed.count,
    page,
    pageSize,
  };
}

export async function loadLegacyContractSummary(params: {
  admin: SupabaseClient;
  tenantId: string;
  ownerProjectIds?: string[] | null;
}): Promise<LegacyContractListSummary> {
  const load = async (schemaMode: LegacyContractSchemaMode) => {
    const select =
      schemaMode === 'extended' ? 'id, link_type, sale_id' : 'id, sale_id';

    let query = params.admin.from('legacy_contract_documents').select(select);
    query = applyTenantScope(query, params.tenantId);
    query = applyActiveScope(query, schemaMode);

    if (params.ownerProjectIds && params.ownerProjectIds.length > 0) {
      query = query.in('project_id', params.ownerProjectIds);
    }

    return query;
  };

  let result = await load('extended');
  let { data, error } = await result;
  if (error && isLegacyContractSchemaColumnError(error.message)) {
    result = await load('base');
    ({ data, error } = await result);
  }

  if (error) {
    throw new Error(`Erro ao calcular resumo: ${error.message}`);
  }

  const rows = data || [];
  const automatic = rows.filter((row) => row.link_type === 'automatic' || row.link_type == null).length;
  const manual = rows.filter((row) => row.link_type === 'manual').length;
  const unlinked = rows.filter((row) => !row.sale_id).length;

  return {
    total: rows.length,
    automatic,
    manual,
    unlinked,
  };
}

export async function loadLegacyContractDocumentById(params: {
  admin: SupabaseClient;
  tenantId: string;
  documentId: string;
  ownerProjectIds?: string[] | null;
}): Promise<(LegacyContractListItem & { storage_path: string }) | null> {
  const load = async (schemaMode: LegacyContractSchemaMode) => {
    const select =
      schemaMode === 'extended'
        ? `${LEGACY_CONTRACT_EXTENDED_SELECT}, storage_path`
        : `${LEGACY_CONTRACT_BASE_SELECT}, storage_path`;

    let query = params.admin
      .from('legacy_contract_documents')
      .select(select)
      .eq('id', params.documentId);

    query = applyTenantScope(query, params.tenantId);
    query = applyActiveScope(query, schemaMode);

    return query.maybeSingle();
  };

  let { data, error } = await load('extended');
  let schemaMode: LegacyContractSchemaMode = 'extended';
  if (error && isLegacyContractSchemaColumnError(error.message)) {
    ({ data, error } = await load('base'));
    schemaMode = 'base';
  }

  if (error) {
    throw new Error(`Erro ao consultar contrato antigo: ${error.message}`);
  }
  if (!data) return null;

  const row = data as LegacyContractRow & { storage_path: string };
  if (
    params.ownerProjectIds &&
    params.ownerProjectIds.length > 0 &&
    row.project_id &&
    !params.ownerProjectIds.includes(String(row.project_id))
  ) {
    return null;
  }

  const names = await loadNameMaps(params.admin, [row]);

  return {
    ...mapRow(row, names, schemaMode),
    storage_path: String(row.storage_path || ''),
  };
}

export async function softDeleteLegacyContractDocument(params: {
  admin: SupabaseClient;
  tenantId: string;
  documentId: string;
  userId: string;
}): Promise<boolean> {
  const payload = {
    is_active: false,
    deleted_at: new Date().toISOString(),
    deleted_by: params.userId,
  };

  let { data, error } = await params.admin
    .from('legacy_contract_documents')
    .update(payload)
    .eq('id', params.documentId)
    .or(buildLegacyContractTenantOrFilter(params.tenantId))
    .eq('is_active', true)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error && isLegacyContractSchemaColumnError(error.message)) {
    ({ data, error } = await params.admin
      .from('legacy_contract_documents')
      .delete()
      .eq('id', params.documentId)
      .or(buildLegacyContractTenantOrFilter(params.tenantId))
      .select('id')
      .maybeSingle());
  }

  if (error) {
    throw new Error(`Erro ao arquivar contrato antigo: ${error.message}`);
  }

  return Boolean(data?.id);
}
