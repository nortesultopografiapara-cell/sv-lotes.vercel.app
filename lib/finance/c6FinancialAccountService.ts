/**
 * Contas financeiras C6 Bank — criação/vínculo sem converter Asaas/Inter.
 * Sem emissão. Sem API externa C6.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCompanyFinancialAccountById,
  listCompanyFinancialAccounts,
} from '@/lib/finance/companyFinancialAccountRepository';
import {
  NEW_C6_FINANCIAL_ACCOUNT_NAME,
  type CompanyFinancialAccountResponse,
} from '@/lib/finance/companyFinancialAccountTypes';
import { resolveUniqueProviderAccount } from '@/lib/finance/financialAccountRequired';

const ASAAS_LINKED_ERROR =
  'Esta conta já está vinculada ao Asaas. Crie uma nova conta financeira C6 Bank.';

async function getAccountProvider(
  admin: SupabaseClient,
  companyId: string,
  bankIntegrationId: string | null,
): Promise<string | null> {
  if (!bankIntegrationId) return null;
  const { data, error } = await admin
    .from('bank_integrations')
    .select('provider')
    .eq('id', bankIntegrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.provider ? String(data.provider).toUpperCase() : null;
}

async function resolveC6IntegrationId(
  admin: SupabaseClient,
  companyId: string,
): Promise<string> {
  const unique = await resolveUniqueProviderAccount(admin, companyId, 'C6');
  if (!unique.integrationId) {
    throw new Error('Configure o C6 Bank antes de criar/vincular a conta financeira.');
  }
  return unique.integrationId;
}

/** Vincula FA sem provider (ou já C6 da mesma integração). Nunca converte Asaas/Inter. */
export async function linkFinancialAccountToC6Integration(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
  preferredIntegrationId?: string | null,
): Promise<CompanyFinancialAccountResponse> {
  const c6Id = String(preferredIntegrationId || '').trim() || (await resolveC6IntegrationId(admin, companyId));

  const { data: account, error: accErr } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id, active')
    .eq('id', financialAccountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!account?.id) throw new Error('Conta financeira não encontrada.');
  if (account.active === false) throw new Error('Conta financeira inativa.');

  const currentProvider = await getAccountProvider(
    admin,
    companyId,
    account.bank_integration_id ? String(account.bank_integration_id) : null,
  );

  if (currentProvider === 'ASAAS_COMPANY' || currentProvider === 'ASAAS') {
    throw new Error(ASAAS_LINKED_ERROR);
  }
  if (currentProvider === 'INTER') {
    throw new Error(
      'Esta conta já está vinculada ao Banco Inter. Crie uma nova conta financeira C6 Bank.',
    );
  }
  if (currentProvider && currentProvider !== 'C6') {
    throw new Error(
      `Esta conta já está vinculada ao provider ${currentProvider}. Crie uma nova conta financeira C6 Bank.`,
    );
  }
  if (currentProvider === 'C6' && String(account.bank_integration_id) === c6Id) {
    const existing = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
    if (!existing) throw new Error('Conta financeira não encontrada.');
    return existing;
  }

  const others = await listCompanyFinancialAccounts(admin, companyId, { activeOnly: false });
  const taken = others.find(
    (a) => a.id !== financialAccountId && a.bankIntegrationId === c6Id,
  );
  if (taken) {
    throw new Error(
      'Esta integração C6 já está vinculada a outra conta. Use "Nova conta C6 Bank" para credenciais próprias.',
    );
  }

  const { error } = await admin
    .from('company_financial_accounts')
    .update({
      bank_integration_id: c6Id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', financialAccountId)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);

  const updated = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
  if (!updated) throw new Error('Conta financeira não encontrada após vínculo.');
  return updated;
}

export type CreateC6FinancialAccountInput = {
  name?: string | null;
  beneficiaryName?: string | null;
  createAdditional?: boolean;
};

export async function createC6FinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  input?: CreateC6FinancialAccountInput,
): Promise<CompanyFinancialAccountResponse> {
  const existingList = await listCompanyFinancialAccounts(admin, companyId, {
    activeOnly: false,
  });
  const c6Accounts = existingList.filter(
    (a) => a.active && String(a.provider || '').toUpperCase() === 'C6',
  );
  const linkedIntegrationIds = new Set(
    c6Accounts.map((a) => a.bankIntegrationId).filter(Boolean) as string[],
  );

  const { data: integrations, error: intErr } = await admin
    .from('bank_integrations')
    .select('id, environment')
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .order('updated_at', { ascending: false });
  if (intErr) throw new Error(intErr.message);
  const c6Integrations =
    (integrations as Array<{ id: string; environment?: string }> | null) || [];
  const unused = c6Integrations.find((row) => !linkedIntegrationIds.has(String(row.id)));

  const name = String(input?.name || '').trim() || NEW_C6_FINANCIAL_ACCOUNT_NAME;
  const beneficiaryName = String(input?.beneficiaryName || '').trim() || null;

  if (!input?.createAdditional) {
    if (unused?.id) {
      return insertC6FinancialAccountRow(admin, companyId, {
        name,
        beneficiaryName,
        integrationId: String(unused.id),
        environment: (unused.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
      });
    }
    if (c6Accounts[0]) return c6Accounts[0];
  }

  const now = new Date().toISOString();
  const { data: createdInt, error: createIntErr } = await admin
    .from('bank_integrations')
    .insert({
      company_id: companyId,
      provider: 'C6',
      bank_provider: 'C6',
      environment: unused?.environment || 'SANDBOX',
      status: 'DRAFT',
      label: name,
      active: false,
      is_default: false,
      configured_at: now,
      updated_at: now,
      metadata: { createdForFinancialAccount: true },
    })
    .select('id, environment')
    .single();
  if (createIntErr) throw new Error(createIntErr.message);

  return insertC6FinancialAccountRow(admin, companyId, {
    name,
    beneficiaryName,
    integrationId: String(createdInt.id),
    environment: (createdInt.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
  });
}

async function insertC6FinancialAccountRow(
  admin: SupabaseClient,
  companyId: string,
  input: {
    name: string;
    beneficiaryName: string | null;
    integrationId: string;
    environment: string;
  },
): Promise<CompanyFinancialAccountResponse> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('company_financial_accounts')
    .insert({
      company_id: companyId,
      name: input.name,
      account_type: 'IMOBILIARIA',
      beneficiary_name: input.beneficiaryName,
      environment: input.environment,
      bank_integration_id: input.integrationId,
      is_default: false,
      active: true,
      notes: 'Conta financeira C6 Bank (provider C6). Emissão ainda não homologada.',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const created = await getCompanyFinancialAccountById(admin, companyId, String(data.id));
  if (!created) throw new Error('Falha ao carregar conta C6 criada.');
  return created;
}

export { ASAAS_LINKED_ERROR };
