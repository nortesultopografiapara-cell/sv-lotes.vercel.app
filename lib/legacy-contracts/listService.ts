/**
 * Listagem e resumo — Contratos Antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
  quadra: string | null;
  lote: string | null;
  original_file_name: string;
  link_type: string;
  source: string;
  migration_id: string | null;
  notes: string | null;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  created_at: string;
  projects?: { id: string; name: string } | { id: string; name: string }[] | null;
  customers?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function pickRelationName(
  relation: LegacyContractRow['projects'] | LegacyContractRow['customers'],
): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    return relation[0]?.name ? String(relation[0].name) : null;
  }
  return relation.name ? String(relation.name) : null;
}

function mapRow(row: LegacyContractRow): LegacyContractListItem {
  return {
    id: String(row.id),
    sale_id: String(row.sale_id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    block_id: row.block_id ? String(row.block_id) : null,
    project_name: pickRelationName(row.projects),
    customer_name: pickRelationName(row.customers),
    quadra: row.quadra ? String(row.quadra) : null,
    lote: row.lote ? String(row.lote) : null,
    original_file_name: String(row.original_file_name || ''),
    link_type: (row.link_type === 'manual' ? 'manual' : 'automatic') as LegacyContractLinkType,
    source: String(row.source || 'legacy_migration'),
    migration_id: row.migration_id ? String(row.migration_id) : null,
    notes: row.notes ? String(row.notes) : null,
    contract_number: row.contract_number ? String(row.contract_number) : null,
    contract_date: row.contract_date ? String(row.contract_date) : null,
    status: String(row.status || 'ANTIGO'),
    created_at: String(row.created_at || ''),
  };
}

function applyTextFilters<T extends {
  eq: (column: string, value: string) => T;
  ilike: (column: string, pattern: string) => T;
}>(query: T, filters: LegacyContractListFilters): T {
  let next = query;

  if (filters.projectId) {
    next = next.eq('project_id', filters.projectId);
  }
  if (filters.quadra?.trim()) {
    next = next.ilike('quadra', `%${filters.quadra.trim()}%`);
  }
  if (filters.lote?.trim()) {
    next = next.ilike('lote', `%${filters.lote.trim()}%`);
  }
  if (filters.fileName?.trim()) {
    next = next.ilike('original_file_name', `%${filters.fileName.trim()}%`);
  }
  if (filters.linkType === 'automatic' || filters.linkType === 'manual') {
    next = next.eq('link_type', filters.linkType);
  }

  return next;
}

export async function listLegacyContractDocuments(params: {
  admin: SupabaseClient;
  tenantId: string;
  filters: LegacyContractListFilters;
  ownerProjectIds?: string[] | null;
}): Promise<LegacyContractListResult> {
  const page = Math.max(1, params.filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.filters.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = params.admin
    .from('legacy_contract_documents')
    .select(
      `
        id, sale_id, customer_id, project_id, block_id, quadra, lote,
        original_file_name, link_type, source, migration_id, notes,
        contract_number, contract_date, status, created_at,
        projects:project_id (id, name),
        customers:customer_id (id, name)
      `,
      { count: 'exact' },
    )
    .eq('company_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (params.ownerProjectIds && params.ownerProjectIds.length > 0) {
    query = query.in('project_id', params.ownerProjectIds);
  }

  query = applyTextFilters(query, params.filters);

  if (params.filters.customer?.trim()) {
    const customerTerm = params.filters.customer.trim();
    const { data: customers } = await params.admin
      .from('customers')
      .select('id')
      .eq('company_id', params.tenantId)
      .ilike('name', `%${customerTerm}%`)
      .limit(50);

    const customerIds = (customers || []).map((row) => String(row.id)).filter(Boolean);
    if (customerIds.length === 0) {
      const emptySummary = await loadLegacyContractSummary({
        admin: params.admin,
        tenantId: params.tenantId,
        ownerProjectIds: params.ownerProjectIds,
      });
      return {
        items: [],
        summary: emptySummary,
        total: 0,
        page,
        pageSize,
      };
    }
    query = query.in('customer_id', customerIds);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw new Error(`Erro ao listar contratos antigos: ${error.message}`);
  }

  const summary = await loadLegacyContractSummary({
    admin: params.admin,
    tenantId: params.tenantId,
    ownerProjectIds: params.ownerProjectIds,
  });

  return {
    items: ((data || []) as LegacyContractRow[]).map(mapRow),
    summary,
    total: count || 0,
    page,
    pageSize,
  };
}

export async function loadLegacyContractSummary(params: {
  admin: SupabaseClient;
  tenantId: string;
  ownerProjectIds?: string[] | null;
}): Promise<LegacyContractListSummary> {
  let query = params.admin
    .from('legacy_contract_documents')
    .select('id, link_type, sale_id')
    .eq('company_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (params.ownerProjectIds && params.ownerProjectIds.length > 0) {
    query = query.in('project_id', params.ownerProjectIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao calcular resumo: ${error.message}`);
  }

  const rows = data || [];
  const automatic = rows.filter((row) => row.link_type === 'automatic').length;
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
  const { data, error } = await params.admin
    .from('legacy_contract_documents')
    .select(
      `
        id, sale_id, customer_id, project_id, block_id, quadra, lote,
        original_file_name, storage_path, link_type, source, migration_id, notes,
        contract_number, contract_date, status, created_at,
        projects:project_id (id, name),
        customers:customer_id (id, name)
      `,
    )
    .eq('id', params.documentId)
    .eq('company_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

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

  return {
    ...mapRow(row),
    storage_path: String(row.storage_path || ''),
  };
}

export async function softDeleteLegacyContractDocument(params: {
  admin: SupabaseClient;
  tenantId: string;
  documentId: string;
  userId: string;
}): Promise<boolean> {
  const { data, error } = await params.admin
    .from('legacy_contract_documents')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: params.userId,
    })
    .eq('id', params.documentId)
    .eq('company_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao arquivar contrato antigo: ${error.message}`);
  }

  return Boolean(data?.id);
}
