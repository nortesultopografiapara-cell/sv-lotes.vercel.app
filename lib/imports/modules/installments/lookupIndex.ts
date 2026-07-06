/**
 * Índices de lookup — atualização de parcelas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSalesBlockIndex } from '@/lib/imports/modules/sales/lookupIndex';
import type { SalesBlockRecord } from '@/lib/imports/modules/sales/types';
import { normalizeImportEntityName } from '@/lib/imports/modules/sales/normalize';
import type {
  InstallmentImportContext,
  InstallmentReceiptRecord,
  InstallmentSaleRecord,
} from '@/lib/imports/modules/installments/types';

function buildProjectNameIndex(
  projects: Array<{ id: string; name?: string | null }>,
): InstallmentImportContext['projectsByName'] {
  const byName = new Map<string, { id: string; name: string }>();
  for (const project of projects) {
    const name = normalizeImportEntityName(project.name);
    if (!name) continue;
    byName.set(name, { id: String(project.id), name: project.name || '' });
  }
  return byName;
}

export async function loadInstallmentImportContext(
  admin: SupabaseClient,
  tenantId: string,
): Promise<InstallmentImportContext> {
  const projects = await loadTenantRows(admin, 'projects', tenantId, ['id', 'name']);
  const projectIds = projects.map((project) => String(project.id)).filter(Boolean);
  const blocks = (await loadBlocksForProjects(admin, projectIds)) as SalesBlockRecord[];
  const customers = await loadTenantRows(admin, 'customers', tenantId, ['id', 'name']);
  const customerNameById = new Map<string, string>();
  for (const customer of customers) {
    customerNameById.set(String(customer.id), String(customer.name || ''));
  }

  const sales = await loadTenantRows(admin, 'sales', tenantId, [
    'id',
    'customer_id',
    'block_id',
    'project_id',
    'status',
  ]);

  const salesById = new Map<string, InstallmentSaleRecord>();
  const salesByBlockId = new Map<string, InstallmentSaleRecord>();
  for (const sale of sales) {
    const status = String(sale.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'CANCELADO') continue;
    const customerId = String(sale.customer_id || '');
    const record: InstallmentSaleRecord = {
      id: String(sale.id),
      customer_id: customerId,
      block_id: sale.block_id ? String(sale.block_id) : null,
      project_id: sale.project_id ? String(sale.project_id) : null,
      customer_name: customerNameById.get(customerId) || '',
    };
    salesById.set(record.id, record);
    if (record.block_id) salesByBlockId.set(record.block_id, record);
  }

  const receipts = await loadTenantRows(admin, 'finance_receipts', tenantId, [
    'id',
    'sale_id',
    'customer_id',
    'project_id',
    'block_id',
    'installment_number',
    'due_date',
    'amount',
    'paid_amount',
    'paid_at',
    'status',
  ]);

  const receiptsById = new Map<string, InstallmentReceiptRecord>();
  const receiptsBySaleAndNumber = new Map<string, InstallmentReceiptRecord>();
  for (const receipt of receipts) {
    const record: InstallmentReceiptRecord = {
      id: String(receipt.id),
      sale_id: String(receipt.sale_id),
      customer_id: String(receipt.customer_id),
      project_id: receipt.project_id ? String(receipt.project_id) : null,
      block_id: receipt.block_id ? String(receipt.block_id) : null,
      installment_number: Number(receipt.installment_number),
      due_date: String(receipt.due_date || '').slice(0, 10),
      amount: Number(receipt.amount) || 0,
      paid_amount:
        receipt.paid_amount == null || receipt.paid_amount === ''
          ? null
          : Number(receipt.paid_amount),
      paid_at: receipt.paid_at ? String(receipt.paid_at) : null,
      status: String(receipt.status || 'pendente'),
    };
    receiptsById.set(record.id, record);
    receiptsBySaleAndNumber.set(
      `${record.sale_id}::${record.installment_number}`,
      record,
    );
  }

  const projectsById = new Map<string, { id: string; name: string }>();
  for (const project of projects) {
    projectsById.set(String(project.id), {
      id: String(project.id),
      name: String(project.name || ''),
    });
  }

  const { index: blockIndex } = buildSalesBlockIndex(blocks);

  return {
    projects: projectsById,
    projectsByName: buildProjectNameIndex(projects),
    blocks: blockIndex,
    receiptsById,
    receiptsBySaleAndNumber,
    salesById,
    salesByBlockId,
  };
}

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

  console.warn(`[loadInstallmentImportContext] ${table} query failed`);
  return [];
}

async function loadBlocksForProjects(
  admin: SupabaseClient,
  projectIds: string[],
): Promise<Array<Record<string, unknown>>> {
  if (projectIds.length === 0) return [];

  const { data, error } = await admin
    .from('blocks')
    .select('id, project_id, block_name, name, number, lot_number, status, sale_id, customer_id')
    .in('project_id', projectIds);

  if (error) {
    console.warn('[loadInstallmentImportContext] blocks:', error.message);
    return [];
  }

  return (data || []) as Array<Record<string, unknown>>;
}
