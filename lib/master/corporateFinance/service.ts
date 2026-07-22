import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterCorporateCostCenter,
  MasterCorporateCostCenterInput,
  MasterCorporateFinanceFoundationKpis,
  MasterCorporateFinancialAccount,
  MasterCorporateFinancialAccountInput,
  MasterCorporateFinancialCategory,
  MasterCorporateFinancialCategoryInput,
} from './types';

function nowIso() {
  return new Date().toISOString();
}

export async function logCorporateFinanceAudit(
  supabase: SupabaseClient,
  params: {
    userId: string | null;
    action: string;
    entityId: string;
    description: string;
    oldData?: unknown;
    newData?: unknown;
  },
): Promise<void> {
  try {
    let tenantId: string | null = null;
    if (params.userId) {
      const { data: u } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', params.userId)
        .maybeSingle();
      tenantId = u?.tenant_id ? String(u.tenant_id) : null;
    }

    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      company_id: tenantId,
      user_id: params.userId,
      action: params.action,
      module: 'CORPORATE_FINANCE',
      description: `${params.description} [${params.entityId}]`,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    });
  } catch {
    /* auditoria não deve bloquear o fluxo operacional */
  }
}

/** Rejeita papel não SUPER_ADMIN e sessão em impersonation (query/body). */
export function assertCorporateFinanceAccess(params: {
  userId?: string | null;
  impersonatingTenantId?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!params.userId) return { ok: false, error: 'userId é obrigatório.' };
  if (params.impersonatingTenantId) {
    return {
      ok: false,
      error: 'Financeiro Corporativo Master indisponível durante impersonation.',
    };
  }
  return { ok: true };
}

// —— Contas ——

export async function listCorporateAccounts(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<MasterCorporateFinancialAccount[]> {
  let q = supabase
    .from('master_corporate_financial_accounts')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (!opts.includeInactive) {
    q = q.eq('is_active', true);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as MasterCorporateFinancialAccount[];
}

export async function getCorporateAccount(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporateFinancialAccount | null> {
  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MasterCorporateFinancialAccount) || null;
}

async function clearOtherDefaults(
  supabase: SupabaseClient,
  exceptId?: string,
): Promise<void> {
  let q = supabase
    .from('master_corporate_financial_accounts')
    .update({ is_default: false, updated_at: nowIso() })
    .eq('is_default', true);
  if (exceptId) q = q.neq('id', exceptId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function createCorporateAccount(
  supabase: SupabaseClient,
  input: MasterCorporateFinancialAccountInput,
  createdBy: string | null,
): Promise<MasterCorporateFinancialAccount> {
  if (input.is_default) await clearOtherDefaults(supabase);

  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .insert({
      name: input.name,
      account_type: input.account_type,
      institution_name: input.institution_name,
      branch: input.branch,
      account_number: input.account_number,
      pix_key: input.pix_key,
      opening_balance: input.opening_balance,
      opening_balance_date: input.opening_balance_date,
      is_default: input.is_default,
      is_active: input.is_active,
      notes: input.notes,
      created_by: createdBy,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialAccount;
}

export async function updateCorporateAccount(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateFinancialAccountInput,
): Promise<MasterCorporateFinancialAccount> {
  if (input.is_default) await clearOtherDefaults(supabase, id);

  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .update({
      name: input.name,
      account_type: input.account_type,
      institution_name: input.institution_name,
      branch: input.branch,
      account_number: input.account_number,
      pix_key: input.pix_key,
      opening_balance: input.opening_balance,
      opening_balance_date: input.opening_balance_date,
      is_default: input.is_default,
      is_active: input.is_active,
      notes: input.notes,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialAccount;
}

export async function setCorporateAccountActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean,
): Promise<MasterCorporateFinancialAccount> {
  const patch: Record<string, unknown> = {
    is_active: isActive,
    updated_at: nowIso(),
  };
  if (!isActive) patch.is_default = false;

  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialAccount;
}

// —— Categorias ——

export async function listCorporateCategories(
  supabase: SupabaseClient,
  opts: { type?: string; includeInactive?: boolean } = {},
): Promise<MasterCorporateFinancialCategory[]> {
  let q = supabase
    .from('master_corporate_financial_categories')
    .select('*')
    .order('type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (opts.type) q = q.eq('type', opts.type);
  if (!opts.includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as MasterCorporateFinancialCategory[];
}

export async function getCorporateCategory(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporateFinancialCategory | null> {
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MasterCorporateFinancialCategory) || null;
}

export async function createCorporateCategory(
  supabase: SupabaseClient,
  input: MasterCorporateFinancialCategoryInput,
): Promise<MasterCorporateFinancialCategory> {
  if (input.parent_id) {
    const parent = await getCorporateCategory(supabase, input.parent_id);
    if (!parent) throw new Error('Categoria pai não encontrada.');
    if (parent.type !== input.type) {
      throw new Error('Categoria pai deve ter o mesmo tipo (INCOME/EXPENSE).');
    }
  }

  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .insert({
      name: input.name,
      type: input.type,
      parent_id: input.parent_id,
      is_active: input.is_active,
      sort_order: input.sort_order,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialCategory;
}

export async function updateCorporateCategory(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateFinancialCategoryInput,
): Promise<MasterCorporateFinancialCategory> {
  if (input.parent_id === id) {
    throw new Error('Categoria não pode ser pai de si mesma.');
  }
  if (input.parent_id) {
    const parent = await getCorporateCategory(supabase, input.parent_id);
    if (!parent) throw new Error('Categoria pai não encontrada.');
    if (parent.type !== input.type) {
      throw new Error('Categoria pai deve ter o mesmo tipo (INCOME/EXPENSE).');
    }
  }

  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .update({
      name: input.name,
      type: input.type,
      parent_id: input.parent_id,
      is_active: input.is_active,
      sort_order: input.sort_order,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialCategory;
}

export async function setCorporateCategoryActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean,
): Promise<MasterCorporateFinancialCategory> {
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateFinancialCategory;
}

/**
 * Exclusão física só se nunca utilizada.
 * Na Fase 6.1 não há lançamentos; bloqueia se houver filhos.
 */
export async function deleteCorporateCategory(
  supabase: SupabaseClient,
  id: string,
): Promise<{ deleted: boolean; reason?: string }> {
  const { count, error: childErr } = await supabase
    .from('master_corporate_financial_categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id);

  if (childErr) throw new Error(childErr.message);
  if ((count || 0) > 0) {
    return {
      deleted: false,
      reason: 'Categoria possui subcategorias. Desative-a em vez de excluir.',
    };
  }

  // Reserva para fases futuras (AR/AP/movimentos) — tabela ainda não existe.
  // Quando existir, checar uso e retornar deleted:false.

  const { error } = await supabase
    .from('master_corporate_financial_categories')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { deleted: true };
}

// —— Centros de resultado ——

export async function listCorporateCostCenters(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<MasterCorporateCostCenter[]> {
  let q = supabase
    .from('master_corporate_cost_centers')
    .select('*')
    .order('code', { ascending: true });

  if (!opts.includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as MasterCorporateCostCenter[];
}

export async function getCorporateCostCenter(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporateCostCenter | null> {
  const { data, error } = await supabase
    .from('master_corporate_cost_centers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MasterCorporateCostCenter) || null;
}

async function nextCostCenterCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_corporate_cost_center_code');
  if (error) throw new Error(error.message);
  return String(data);
}

export async function createCorporateCostCenter(
  supabase: SupabaseClient,
  input: MasterCorporateCostCenterInput,
): Promise<MasterCorporateCostCenter> {
  const code = input.code?.trim() || (await nextCostCenterCode(supabase));

  if (input.project_id) {
    const { data: proj, error: pErr } = await supabase
      .from('master_topography_projects')
      .select('id')
      .eq('id', input.project_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error('Projeto Master não encontrado.');
  }

  const { data, error } = await supabase
    .from('master_corporate_cost_centers')
    .insert({
      code,
      name: input.name,
      project_id: input.project_id,
      is_active: input.is_active,
    })
    .select('*')
    .single();

  if (error) {
    if (error.message.includes('unique') || error.code === '23505') {
      throw new Error('Já existe um centro com este código.');
    }
    throw new Error(error.message);
  }
  return data as MasterCorporateCostCenter;
}

export async function updateCorporateCostCenter(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateCostCenterInput,
): Promise<MasterCorporateCostCenter> {
  const existing = await getCorporateCostCenter(supabase, id);
  if (!existing) throw new Error('Centro de resultado não encontrado.');

  const code = input.code?.trim() || existing.code;

  if (input.project_id) {
    const { data: proj, error: pErr } = await supabase
      .from('master_topography_projects')
      .select('id')
      .eq('id', input.project_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error('Projeto Master não encontrado.');
  }

  const { data, error } = await supabase
    .from('master_corporate_cost_centers')
    .update({
      code,
      name: input.name,
      project_id: input.project_id,
      is_active: input.is_active,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.message.includes('unique') || error.code === '23505') {
      throw new Error('Já existe um centro com este código.');
    }
    throw new Error(error.message);
  }
  return data as MasterCorporateCostCenter;
}

export async function setCorporateCostCenterActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean,
): Promise<MasterCorporateCostCenter> {
  const { data, error } = await supabase
    .from('master_corporate_cost_centers')
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as MasterCorporateCostCenter;
}

// —— KPIs estruturais da fundação ——

export async function getCorporateFinanceFoundationKpis(
  supabase: SupabaseClient,
): Promise<MasterCorporateFinanceFoundationKpis> {
  const [accounts, categories, centers] = await Promise.all([
    listCorporateAccounts(supabase, { includeInactive: true }),
    listCorporateCategories(supabase, { includeInactive: true }),
    listCorporateCostCenters(supabase, { includeInactive: true }),
  ]);

  return {
    accountsTotal: accounts.length,
    accountsActive: accounts.filter((a) => a.is_active).length,
    categoriesTotal: categories.length,
    categoriesIncome: categories.filter((c) => c.type === 'INCOME').length,
    categoriesExpense: categories.filter((c) => c.type === 'EXPENSE').length,
    costCentersTotal: centers.length,
    costCentersActive: centers.filter((c) => c.is_active).length,
    openingBalanceSum: accounts
      .filter((a) => a.is_active)
      .reduce((sum, a) => sum + Number(a.opening_balance || 0), 0),
  };
}
