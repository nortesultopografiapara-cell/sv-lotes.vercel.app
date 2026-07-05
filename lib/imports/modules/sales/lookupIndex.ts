/**
 * Índices de lookup — importação de vendas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { registerBlockInIndex } from '@/lib/imports/modules/sales/blockMatch';
import {
  normalizeImportEmail,
  normalizeImportEntityName,
} from '@/lib/imports/modules/sales/normalize';
import type {
  SalesBlockIndex,
  SalesBlockRecord,
  SalesBrokerIndex,
  SalesCustomerIndex,
  SalesImportContext,
  SalesProjectIndex,
} from '@/lib/imports/modules/sales/types';
import { normalizePhoneDigits } from '@/lib/inputMasks';

export function buildSalesCustomerIndex(
  customers: Array<{
    id: string;
    name?: string | null;
    cpf_cnpj?: string | null;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
  }>,
): SalesCustomerIndex {
  const byCpfDigits = new Map<string, { id: string; name: string }>();
  const byEmail = new Map<string, { id: string; name: string }>();
  const byPhone = new Map<string, { id: string; name: string }>();

  for (const customer of customers) {
    const cpfDigits =
      String(customer.cpf_cnpj || customer.document || '').replace(/\D/g, '') || '';
    if (cpfDigits) {
      byCpfDigits.set(cpfDigits, { id: customer.id, name: customer.name || '' });
    }

    const email = normalizeImportEmail(customer.email);
    if (email) {
      byEmail.set(email, { id: customer.id, name: customer.name || '' });
    }

    const phone = normalizePhoneDigits(customer.phone);
    if (phone) {
      byPhone.set(phone, { id: customer.id, name: customer.name || '' });
    }
  }

  return { byCpfDigits, byEmail, byPhone };
}

export function buildSalesBrokerIndex(
  brokers: Array<{
    id: string;
    name?: string | null;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
    commission_percent?: number | null;
  }>,
): SalesBrokerIndex {
  const byCpfDigits = new Map<
    string,
    { id: string; name: string; commission_percent?: number | null }
  >();
  const byEmail = new Map<
    string,
    { id: string; name: string; commission_percent?: number | null }
  >();
  const byName = new Map<
    string,
    { id: string; name: string; commission_percent?: number | null }
  >();

  for (const broker of brokers) {
    const entry = {
      id: broker.id,
      name: broker.name || '',
      commission_percent: broker.commission_percent,
    };

    const cpfDigits = String(broker.cpf || '').replace(/\D/g, '');
    if (cpfDigits) byCpfDigits.set(cpfDigits, entry);

    const email = normalizeImportEmail(broker.email);
    if (email) byEmail.set(email, entry);

    const name = normalizeImportEntityName(broker.name);
    if (name) byName.set(name, entry);
  }

  return { byCpfDigits, byEmail, byName };
}

export function buildSalesProjectIndex(
  projects: Array<{ id: string; name?: string | null }>,
): SalesProjectIndex {
  const index: SalesProjectIndex = new Map();
  for (const project of projects) {
    const key = normalizeImportEntityName(project.name);
    if (key && !index.has(key)) {
      index.set(key, { id: project.id, name: project.name || '' });
    }
  }
  return index;
}

export function buildSalesBlockIndex(blocks: SalesBlockRecord[]): {
  index: SalesBlockIndex;
  blocksByProject: Map<string, SalesBlockRecord[]>;
} {
  const index: SalesBlockIndex = new Map();
  const blocksByProject = new Map<string, SalesBlockRecord[]>();

  for (const block of blocks) {
    registerBlockInIndex(index, block);

    const projectBlocks = blocksByProject.get(block.project_id) || [];
    projectBlocks.push(block);
    blocksByProject.set(block.project_id, projectBlocks);
  }

  return { index, blocksByProject };
}

export function lookupCustomer(
  index: SalesCustomerIndex,
  cpfDigits: string,
  emailNormalized: string,
  phoneDigits: string,
): { id: string; name: string } | null {
  if (cpfDigits) {
    const byCpf = index.byCpfDigits.get(cpfDigits);
    if (byCpf) return byCpf;
  }
  if (emailNormalized) {
    const byEmail = index.byEmail.get(emailNormalized);
    if (byEmail) return byEmail;
  }
  if (phoneDigits) {
    const byPhone = index.byPhone.get(phoneDigits);
    if (byPhone) return byPhone;
  }
  return null;
}

export function lookupBroker(
  index: SalesBrokerIndex,
  cpfDigits: string,
  emailNormalized: string,
  nameNormalized: string,
): { id: string; name: string; commission_percent?: number | null } | null {
  if (cpfDigits) {
    const byCpf = index.byCpfDigits.get(cpfDigits);
    if (byCpf) return byCpf;
  }
  if (emailNormalized) {
    const byEmail = index.byEmail.get(emailNormalized);
    if (byEmail) return byEmail;
  }
  if (nameNormalized) {
    const byName = index.byName.get(nameNormalized);
    if (byName) return byName;
  }
  return null;
}

export function brokerFieldsProvided(
  cpfDigits: string,
  emailNormalized: string,
  nameNormalized: string,
): boolean {
  return Boolean(cpfDigits || emailNormalized || nameNormalized);
}

export async function loadSalesImportContext(
  admin: SupabaseClient,
  tenantId: string,
): Promise<SalesImportContext> {
  const customers = await loadTenantRows(admin, 'customers', tenantId, [
    'id',
    'name',
    'cpf_cnpj',
    'document',
    'email',
    'phone',
  ]);
  const brokers = await loadTenantRows(admin, 'brokers', tenantId, [
    'id',
    'name',
    'cpf',
    'email',
    'phone',
    'commission_percent',
  ]);
  const projects = await loadTenantRows(admin, 'projects', tenantId, ['id', 'name']);
  const projectIds = projects.map((project) => String(project.id)).filter(Boolean);
  const blocks = await loadBlocksForProjects(admin, projectIds);

  const activeSales = await loadTenantRows(admin, 'sales', tenantId, [
    'id',
    'block_id',
    'status',
  ]);
  const activeSaleBlockIds = new Set<string>();
  for (const sale of activeSales) {
    const blockId = String(sale.block_id || '');
    const status = String(sale.status || '').toUpperCase();
    if (blockId && status !== 'CANCELLED') {
      activeSaleBlockIds.add(blockId);
    }
  }

  const { index: blockIndex, blocksByProject } = buildSalesBlockIndex(blocks);

  return {
    customers: buildSalesCustomerIndex(customers),
    brokers: buildSalesBrokerIndex(brokers),
    projects: buildSalesProjectIndex(projects),
    blocks: blockIndex,
    blocksByProject,
    activeSaleBlockIds,
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

  if (table === 'blocks') {
    const byProjectTenant = await admin
      .from(table)
      .select(`${select}, projects!inner(tenant_id)`)
      .eq('projects.tenant_id', tenantId);
    if (!byProjectTenant.error) {
      return (byProjectTenant.data || []) as Array<Record<string, unknown>>;
    }
  }

  console.warn(`[loadSalesImportContext] ${table} query failed`);
  return [];
}

async function loadBlocksForProjects(
  admin: SupabaseClient,
  projectIds: string[],
): Promise<SalesBlockRecord[]> {
  if (projectIds.length === 0) return [];

  const { data, error } = await admin
    .from('blocks')
    .select(
      'id, project_id, block_name, number, lot_number, status, sale_id, customer_id, price',
    )
    .in('project_id', projectIds);

  if (error) {
    console.warn('[loadBlocksForProjects]', error.message);
    return [];
  }

  return (data || []) as SalesBlockRecord[];
}
