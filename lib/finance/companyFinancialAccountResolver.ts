import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCompanyFinancialAccountById,
  getDefaultFinancialAccountForCompany,
} from './companyFinancialAccountRepository';
import type { CompanyFinancialAccountResponse } from './companyFinancialAccountTypes';

export type FinancialAccountResolutionSource =
  | 'installment'
  | 'sale'
  | 'project'
  | 'company_default';

export type ResolvedFinancialAccount = {
  account: CompanyFinancialAccountResponse;
  source: FinancialAccountResolutionSource;
};

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return null;
}

export async function resolveFinancialAccountById(
  admin: SupabaseClient,
  companyId: string,
  accountId: string | null | undefined,
  source: FinancialAccountResolutionSource,
): Promise<ResolvedFinancialAccount | null> {
  const normalized = String(accountId ?? '').trim();
  if (!normalized) return null;
  const account = await getCompanyFinancialAccountById(admin, companyId, normalized);
  if (!account || !account.active) return null;
  return { account, source };
}

export async function resolveFinancialAccountForInstallment(
  admin: SupabaseClient,
  companyId: string,
  installment: {
    financial_account_id?: string | null;
    sale_id?: string | null;
    project_id?: string | null;
    sales?: {
      financial_account_id?: string | null;
      project_id?: string | null;
      projects?: { financial_account_id?: string | null } | null;
    } | null;
    projects?: { financial_account_id?: string | null } | null;
  },
): Promise<ResolvedFinancialAccount> {
  const fromInstallment = await resolveFinancialAccountById(
    admin,
    companyId,
    installment.financial_account_id,
    'installment',
  );
  if (fromInstallment) return fromInstallment;

  const fromSale = await resolveFinancialAccountById(
    admin,
    companyId,
    installment.sales?.financial_account_id,
    'sale',
  );
  if (fromSale) return fromSale;

  const projectAccountId = firstNonEmpty(
    installment.projects?.financial_account_id,
    installment.sales?.projects?.financial_account_id,
  );
  const fromProject = await resolveFinancialAccountById(admin, companyId, projectAccountId, 'project');
  if (fromProject) return fromProject;

  const defaultAccount = await getDefaultFinancialAccountForCompany(admin, companyId);
  if (!defaultAccount) {
    throw new Error('Nenhuma conta financeira configurada para esta empresa.');
  }
  return { account: defaultAccount, source: 'company_default' };
}

export async function resolveFinancialAccountForProject(
  admin: SupabaseClient,
  companyId: string,
  project: { financial_account_id?: string | null },
): Promise<ResolvedFinancialAccount> {
  const fromProject = await resolveFinancialAccountById(
    admin,
    companyId,
    project.financial_account_id,
    'project',
  );
  if (fromProject) return fromProject;

  const defaultAccount = await getDefaultFinancialAccountForCompany(admin, companyId);
  if (!defaultAccount) {
    throw new Error('Nenhuma conta financeira configurada para esta empresa.');
  }
  return { account: defaultAccount, source: 'company_default' };
}

/**
 * Resolve conta financeira para venda/parcela quando existir.
 * Nunca lança — venda e contrato não dependem de integração financeira.
 */
export async function resolveFinancialAccountForSaleOptional(
  admin: SupabaseClient,
  companyId: string,
  input: {
    financialAccountId?: string | null;
    projectId?: string | null;
    projectFinancialAccountId?: string | null;
  },
): Promise<ResolvedFinancialAccount | null> {
  try {
    const explicit = await resolveFinancialAccountById(
      admin,
      companyId,
      input.financialAccountId,
      'sale',
    );
    if (explicit) return explicit;

    const fromProject = await resolveFinancialAccountById(
      admin,
      companyId,
      input.projectFinancialAccountId,
      'project',
    );
    if (fromProject) return fromProject;

    if (input.projectId) {
      const { data, error } = await admin
        .from('projects')
        .select('financial_account_id')
        .eq('id', input.projectId)
        .maybeSingle();
      if (!error) {
        const linked = await resolveFinancialAccountById(
          admin,
          companyId,
          (data as { financial_account_id?: string } | null)?.financial_account_id,
          'project',
        );
        if (linked) return linked;
      }
    }

    const defaultAccount = await getDefaultFinancialAccountForCompany(admin, companyId);
    if (!defaultAccount) return null;
    return { account: defaultAccount, source: 'company_default' };
  } catch {
    return null;
  }
}

/** Exige conta financeira — usar apenas em fluxos de cobrança Asaas. */
export async function resolveFinancialAccountForSale(
  admin: SupabaseClient,
  companyId: string,
  input: {
    financialAccountId?: string | null;
    projectId?: string | null;
    projectFinancialAccountId?: string | null;
  },
): Promise<ResolvedFinancialAccount> {
  const resolved = await resolveFinancialAccountForSaleOptional(admin, companyId, input);
  if (!resolved) {
    throw new Error('Nenhuma conta financeira configurada para esta empresa.');
  }
  return resolved;
}
