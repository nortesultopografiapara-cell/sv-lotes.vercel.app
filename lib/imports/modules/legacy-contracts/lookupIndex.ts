/**
 * Lookup de vendas e documentos existentes — contratos antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSalesBlockIndex,
  buildSalesCustomerIndex,
  buildSalesProjectIndex,
} from '@/lib/imports/modules/sales/lookupIndex';
import { buildLegacyContractSaleKey } from '@/lib/imports/modules/legacy-contracts/normalize';
import type {
  LegacyContractImportContext,
  LegacyContractSaleRecord,
} from '@/lib/imports/modules/legacy-contracts/types';

async function loadTenantRows(
  admin: SupabaseClient,
  table: string,
  tenantId: string,
  selectFields: string[],
): Promise<Array<Record<string, unknown>>> {
  const select = selectFields.join(', ');

  const byTenant = await admin.from(table).select(select).eq('tenant_id', tenantId);
  if (!byTenant.error) return (byTenant.data || []) as Array<Record<string, unknown>>;

  const byCompany = await admin.from(table).select(select).eq('company_id', tenantId);
  if (!byCompany.error) return (byCompany.data || []) as Array<Record<string, unknown>>;

  return [];
}

async function loadBlocksForProjects(
  admin: SupabaseClient,
  projectIds: string[],
): Promise<Array<Record<string, unknown>>> {
  if (projectIds.length === 0) return [];

  const { data, error } = await admin
    .from('blocks')
    .select('id, project_id, block_name, number, lot_number, status')
    .in('project_id', projectIds);

  if (error) {
    console.warn('[loadBlocksForProjects:legacy-contracts]', error.message);
    return [];
  }

  return (data || []) as Array<Record<string, unknown>>;
}

function buildSalesByCustomerBlockIndex(
  sales: Array<Record<string, unknown>>,
): Map<string, LegacyContractSaleRecord> {
  const index = new Map<string, LegacyContractSaleRecord>();

  for (const sale of sales) {
    const status = String(sale.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'CANCELADO') continue;

    const customerId = String(sale.customer_id || '');
    const blockId = String(sale.block_id || '');
    if (!customerId || !blockId) continue;

    const key = buildLegacyContractSaleKey(customerId, blockId);
    if (!index.has(key)) {
      index.set(key, {
        id: String(sale.id),
        customer_id: customerId,
        project_id: sale.project_id ? String(sale.project_id) : null,
        block_id: blockId,
        status: sale.status ? String(sale.status) : null,
      });
    }
  }

  return index;
}

export async function loadLegacyContractImportContext(
  admin: SupabaseClient,
  tenantId: string,
): Promise<LegacyContractImportContext> {
  const customers = await loadTenantRows(admin, 'customers', tenantId, [
    'id',
    'name',
    'cpf_cnpj',
    'document',
    'email',
  ]);
  const projects = await loadTenantRows(admin, 'projects', tenantId, ['id', 'name']);
  const projectIds = projects.map((project) => String(project.id)).filter(Boolean);
  const blocks = await loadBlocksForProjects(admin, projectIds);
  const sales = await loadTenantRows(admin, 'sales', tenantId, [
    'id',
    'customer_id',
    'project_id',
    'block_id',
    'status',
  ]);

  const { index: blockIndex, blocksByProject } = buildSalesBlockIndex(
    blocks.map((block) => ({
      id: String(block.id),
      project_id: String(block.project_id),
      block_name: block.block_name ? String(block.block_name) : null,
      number: block.number ? String(block.number) : null,
      lot_number: block.lot_number ? String(block.lot_number) : null,
      status: block.status ? String(block.status) : null,
      sale_id: null,
      customer_id: null,
      price: null,
    })),
  );

  let legacyDocuments: Array<Record<string, unknown>> = [];
  const legacyQuery = await admin
    .from('legacy_contract_documents')
    .select('id, sale_id, storage_path')
    .eq('company_id', tenantId);

  if (!legacyQuery.error) {
    legacyDocuments = (legacyQuery.data || []) as Array<Record<string, unknown>>;
  }

  const legacyDocumentBySaleId = new Map<string, { id: string; storage_path: string }>();
  for (const doc of legacyDocuments) {
    const saleId = String(doc.sale_id || '');
    if (!saleId) continue;
    legacyDocumentBySaleId.set(saleId, {
      id: String(doc.id),
      storage_path: String(doc.storage_path || ''),
    });
  }

  return {
    customers: buildSalesCustomerIndex(customers),
    projects: buildSalesProjectIndex(projects),
    blocks: blockIndex,
    blocksByProject,
    salesByCustomerBlock: buildSalesByCustomerBlockIndex(sales),
    legacyDocumentBySaleId,
  };
}

export function lookupLegacyContractCustomer(
  context: LegacyContractImportContext,
  cpfDigits: string,
  emailNormalized: string,
): { id: string; name: string } | null {
  if (cpfDigits) {
    const byCpf = context.customers.byCpfDigits.get(cpfDigits);
    if (byCpf) return byCpf;
  }
  if (emailNormalized) {
    const byEmail = context.customers.byEmail.get(emailNormalized);
    if (byEmail) return byEmail;
  }
  return null;
}
