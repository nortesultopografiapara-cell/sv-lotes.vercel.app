/**
 * Contas financeiras INTER — criação/vínculo seguro sem converter Asaas.
 * Isolado de createCompanyFinancialAccount (que sempre cria ASAAS_COMPANY).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCompanyFinancialAccountById,
  listCompanyFinancialAccounts,
} from '@/lib/finance/companyFinancialAccountRepository';
import type { CompanyFinancialAccountResponse } from '@/lib/finance/companyFinancialAccountTypes';

const ASAAS_LINKED_ERROR =
  'Esta conta já está vinculada ao Asaas. Crie uma nova conta financeira ou selecione outra conta.';

async function getInterIntegrationId(
  admin: SupabaseClient,
  companyId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Configure o Banco Inter antes de criar/vincular a conta financeira.');
  return String(data.id);
}

async function getAsaasCompanyIntegrationId(
  admin: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, is_default, updated_at')
    .eq('company_id', companyId)
    .eq('provider', 'ASAAS_COMPANY')
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

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

/** Vincula FA sem provider (ou já INTER) à integração INTER. Nunca converte Asaas. */
export async function linkFinancialAccountToInterIntegration(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
): Promise<CompanyFinancialAccountResponse> {
  const interId = await getInterIntegrationId(admin, companyId);

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

  if (currentProvider === 'ASAAS_COMPANY') {
    throw new Error(ASAAS_LINKED_ERROR);
  }
  if (currentProvider && currentProvider !== 'INTER') {
    throw new Error(
      `Esta conta já está vinculada ao provider ${currentProvider}. Crie uma nova conta financeira ou selecione outra conta.`,
    );
  }
  if (currentProvider === 'INTER' && String(account.bank_integration_id) === interId) {
    const existing = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
    if (!existing) throw new Error('Conta financeira não encontrada.');
    return existing;
  }

  const others = await listCompanyFinancialAccounts(admin, companyId, { activeOnly: false });
  const taken = others.find(
    (a) => a.id !== financialAccountId && a.bankIntegrationId === interId,
  );
  if (taken) {
    throw new Error(
      'Esta integração Inter já está vinculada a outra conta. Use "Nova conta Inter" para credenciais próprias.',
    );
  }

  const { error } = await admin
    .from('company_financial_accounts')
    .update({
      bank_integration_id: interId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', financialAccountId)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);

  const updated = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
  if (!updated) throw new Error('Conta financeira não encontrada após vínculo.');
  return updated;
}

export type CreateInterFinancialAccountInput = {
  name?: string | null;
  beneficiaryName?: string | null;
  /** true = cria nova integração Inter (segunda conta). false = reusa integração ainda sem FA. */
  createAdditional?: boolean;
};

/** Cria FA Inter. Sem createAdditional, reusa integração órfã ou a FA Inter já existente. */
export async function createInterFinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  input?: CreateInterFinancialAccountInput,
): Promise<CompanyFinancialAccountResponse> {
  const existingList = await listCompanyFinancialAccounts(admin, companyId, {
    activeOnly: false,
  });
  const interAccounts = existingList.filter(
    (a) => a.active && String(a.provider || '').toUpperCase() === 'INTER',
  );
  const linkedIntegrationIds = new Set(
    interAccounts.map((a) => a.bankIntegrationId).filter(Boolean) as string[],
  );

  const { data: integrations, error: intErr } = await admin
    .from('bank_integrations')
    .select('id, environment')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false });
  if (intErr) throw new Error(intErr.message);
  const interIntegrations = (integrations as Array<{ id: string; environment?: string }> | null) || [];
  const unused = interIntegrations.find((row) => !linkedIntegrationIds.has(String(row.id)));

  const { data: company } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  const companyName = String(company?.name || 'Empresa').trim() || 'Empresa';
  const name =
    String(input?.name || '').trim() || `${companyName} — Banco Inter`;

  if (!input?.createAdditional) {
    if (unused?.id) {
      return insertInterFinancialAccountRow(admin, companyId, {
        name,
        beneficiaryName: String(input?.beneficiaryName || companyName).trim() || companyName,
        integrationId: String(unused.id),
        environment: (unused.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
      });
    }
    if (interAccounts[0]) return interAccounts[0];
  }

  const now = new Date().toISOString();
  const { data: createdInt, error: createIntErr } = await admin
    .from('bank_integrations')
    .insert({
      company_id: companyId,
      provider: 'INTER',
      bank_provider: 'INTER',
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

  return insertInterFinancialAccountRow(admin, companyId, {
    name,
    beneficiaryName: String(input?.beneficiaryName || companyName).trim() || companyName,
    integrationId: String(createdInt.id),
    environment: (createdInt.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
  });
}

async function insertInterFinancialAccountRow(
  admin: SupabaseClient,
  companyId: string,
  input: {
    name: string;
    beneficiaryName: string;
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
      notes: 'Conta financeira Banco Inter (provider INTER).',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const created = await getCompanyFinancialAccountById(admin, companyId, String(data.id));
  if (!created) throw new Error('Falha ao carregar conta Inter criada.');
  return created;
}

export type RecoverInterFinancialAccountsResult = {
  restoredAsaasAccountIds: string[];
  interAccount: CompanyFinancialAccountResponse;
  message: string;
};

/**
 * Recupera FA redirecionada indevidamente para INTER → restaura ASAAS_COMPANY
 * (mesmo id de conta, preserva company_asaas_charges) e garante FA Inter nova.
 */
export async function recoverMislinkedAsaasAndEnsureInterAccount(
  admin: SupabaseClient,
  companyId: string,
): Promise<RecoverInterFinancialAccountsResult> {
  const interId = await getInterIntegrationId(admin, companyId);
  const asaasId = await getAsaasCompanyIntegrationId(admin, companyId);
  const restoredAsaasAccountIds: string[] = [];

  const { data: accounts, error } = await admin
    .from('company_financial_accounts')
    .select('id, name, notes, is_default, bank_integration_id, active')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);

  for (const row of accounts || []) {
    if (String(row.bank_integration_id || '') !== interId) continue;

    const accountId = String(row.id);
    let shouldRestore = false;

    if (asaasId) {
      const { count } = await admin
        .from('company_asaas_charges')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('financial_account_id', accountId);
      if ((count || 0) > 0) shouldRestore = true;

      const name = String(row.name || '');
      const notes = String(row.notes || '');
      const looksLikeInterName = /banco\s*inter|\binter\b/i.test(name);
      const looksLikeAsaasLegacy =
        /asaas|migrada automaticamente/i.test(notes) || Boolean(row.is_default);
      if (!looksLikeInterName && looksLikeAsaasLegacy) shouldRestore = true;
      if (!looksLikeInterName && row.is_default) shouldRestore = true;
    }

    if (shouldRestore && asaasId) {
      const { error: updErr } = await admin
        .from('company_financial_accounts')
        .update({
          bank_integration_id: asaasId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
        .eq('company_id', companyId);
      if (updErr) throw new Error(updErr.message);
      restoredAsaasAccountIds.push(accountId);
    }
  }

  const interAccount = await createInterFinancialAccount(admin, companyId);

  return {
    restoredAsaasAccountIds,
    interAccount,
    message:
      restoredAsaasAccountIds.length > 0
        ? `Restauradas ${restoredAsaasAccountIds.length} conta(s) Asaas; conta Inter garantida (${interAccount.name}).`
        : `Nenhuma restauração necessária; conta Inter: ${interAccount.name}.`,
  };
}

export { ASAAS_LINKED_ERROR };
