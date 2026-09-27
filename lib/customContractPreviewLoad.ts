/**
 * Carga somente leitura para prévia CUSTOM.
 * Não INSERT/UPDATE em sales, contracts ou finance_receipts.
 * Não lê nem grava HTML oficial de contrato.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomPreviewInput } from '@/lib/customContractPreviewResolver';

export type PreviewSaleOption = {
  id: string;
  label: string;
  projectId: string | null;
};

function tenantMatch(row: Record<string, unknown>, tenantId: string): boolean {
  const company = String(row.company_id || row.tenant_id || '');
  return company === tenantId;
}

export async function listSalesForCustomPreview(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PreviewSaleOption[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('id, company_id, tenant_id, customer_id, project_id, sale_date, created_at')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  const rows = (data || []).filter((row) => tenantMatch(row as Record<string, unknown>, tenantId));
  const customerIds = [...new Set(rows.map((row) => String(row.customer_id || '')).filter(Boolean))];
  const projectIds = [...new Set(rows.map((row) => String(row.project_id || '')).filter(Boolean))];
  const [customers, projects] = await Promise.all([
    customerIds.length
      ? supabase.from('customers').select('id, name, company_id, tenant_id').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name?: string }>, error: null }),
    projectIds.length
      ? supabase.from('projects').select('id, name, company_id, tenant_id').in('id', projectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name?: string }>, error: null }),
  ]);
  const customerName = new Map(
    (customers.data || [])
      .filter((row) => tenantMatch(row as Record<string, unknown>, tenantId))
      .map((row) => [String(row.id), String(row.name || 'Cliente')]),
  );
  const projectName = new Map(
    (projects.data || [])
      .filter((row) => tenantMatch(row as Record<string, unknown>, tenantId))
      .map((row) => [String(row.id), String(row.name || 'Empreendimento')]),
  );
  return rows.map((row) => {
    const id = String(row.id);
    const projectId = row.project_id ? String(row.project_id) : null;
    const who = customerName.get(String(row.customer_id || '')) || 'Cliente';
    const where = projectName.get(String(row.project_id || '')) || 'Empreendimento';
    const when = String(row.sale_date || row.created_at || '').slice(0, 10);
    return {
      id,
      projectId,
      label: `${when ? when + ' · ' : ''}${who} · ${where}`,
    };
  });
}

export async function loadCustomPreviewContext(
  supabase: SupabaseClient,
  tenantId: string,
  saleId: string,
): Promise<CustomPreviewInput> {
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();
  if (saleError) throw new Error(saleError.message);
  if (!sale) throw new Error('Venda não encontrada.');
  if (!tenantMatch(sale as Record<string, unknown>, tenantId)) {
    throw new Error('A venda escolhida pertence a outra empresa.');
  }

  const lotId = String(sale.block_id || sale.lot_id || '');
  const brokerId = String(sale.broker_id || '');
  const financialAccountId = String(sale.financial_account_id || '');
  const [
    companyRes,
    customerRes,
    projectRes,
    lotRes,
    contractRes,
    receiptsRes,
    commissionsRes,
    brokerRes,
    accountRes,
  ] = await Promise.all([
      supabase.from('companies').select('*').eq('id', tenantId).maybeSingle(),
      sale.customer_id
        ? supabase.from('customers').select('*').eq('id', sale.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sale.project_id
        ? supabase.from('projects').select('*').eq('id', sale.project_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lotId
        ? supabase.from('blocks').select('*').eq('id', lotId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('contracts')
        .select('id, sale_id, tenant_id, contract_number, forum_city_snapshot, created_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('finance_receipts')
        .select('id, sale_id, installment_number, amount, due_date, status')
        .eq('sale_id', saleId),
      supabase
        .from('broker_commissions')
        .select('id, sale_id, amount')
        .eq('sale_id', saleId),
      brokerId
        ? supabase
            .from('brokers')
            .select('id, company_id, tenant_id, name, cpf, creci, phone, email')
            .eq('id', brokerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      financialAccountId
        ? supabase
            .from('company_financial_accounts')
            .select('id, company_id, name, account_type, beneficiary_name, document')
            .eq('id', financialAccountId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (customerRes.data && !tenantMatch(customerRes.data as Record<string, unknown>, tenantId)) {
    throw new Error('Cliente de outra empresa.');
  }
  if (projectRes.data && !tenantMatch(projectRes.data as Record<string, unknown>, tenantId)) {
    throw new Error('Empreendimento de outra empresa.');
  }

  const contract = contractRes.data || null;
  const brokerRow = (brokerRes.data || null) as Record<string, unknown> | null;
  const accountRow = (accountRes.data || null) as Record<string, unknown> | null;
  const broker =
    brokerRow && tenantMatch(brokerRow, tenantId) ? brokerRow : null;
  const financialAccount =
    accountRow && String(accountRow.company_id || '') === tenantId ? accountRow : null;

  return {
    tenantId,
    company: (companyRes.data || null) as Record<string, unknown> | null,
    customer: (customerRes.data || null) as Record<string, unknown> | null,
    sale: sale as Record<string, unknown>,
    project: (projectRes.data || null) as Record<string, unknown> | null,
    lot: (lotRes.data || null) as Record<string, unknown> | null,
    contract: contract as Record<string, unknown> | null,
    receipts: (receiptsRes.data || []) as Array<Record<string, unknown>>,
    commissions: (commissionsRes.data || []) as Array<Record<string, unknown>>,
    broker,
    financialAccount,
  };
}
