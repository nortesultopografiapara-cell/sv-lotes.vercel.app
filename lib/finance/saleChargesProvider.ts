/**
 * Resolve o provider de cobrança da venda pela conta financeira vinculada.
 * ASAAS_COMPANY = fluxo atual (intocado). INTER = bank_charges.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFinancialAccountForSaleOptional } from '@/lib/finance/companyFinancialAccountResolver';

export type SaleChargesProviderCode = 'ASAAS_COMPANY' | 'INTER';

export async function resolveSaleChargesProvider(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<{
  provider: SaleChargesProviderCode;
  financialAccountId: string | null;
  financialAccountName: string | null;
  bankIntegrationId: string | null;
}> {
  const { data: sale, error: saleErr } = await admin
    .from('sales')
    .select(
      `
      id,
      company_id,
      tenant_id,
      financial_account_id,
      project_id,
      projects:project_id ( financial_account_id )
    `,
    )
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr) throw new Error(saleErr.message);
  if (sale) {
    const saleCompany = String(sale.company_id || sale.tenant_id || '');
    if (saleCompany && saleCompany !== companyId) {
      throw new Error('Venda não pertence a esta empresa.');
    }
  }

  const project = sale?.projects as { financial_account_id?: string | null } | null;
  const resolved = await resolveFinancialAccountForSaleOptional(admin, companyId, {
    financialAccountId: sale?.financial_account_id
      ? String(sale.financial_account_id)
      : null,
    projectId: sale?.project_id ? String(sale.project_id) : null,
    projectFinancialAccountId: project?.financial_account_id
      ? String(project.financial_account_id)
      : null,
  });

  const account = resolved?.account || null;
  if (!account?.bankIntegrationId) {
    return {
      provider: 'ASAAS_COMPANY',
      financialAccountId: account?.id || null,
      financialAccountName: account?.name || null,
      bankIntegrationId: null,
    };
  }

  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, provider')
    .eq('id', account.bankIntegrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const providerRaw = String(data?.provider || '').toUpperCase();
  if (providerRaw === 'INTER') {
    return {
      provider: 'INTER',
      financialAccountId: account.id,
      financialAccountName: account.name,
      bankIntegrationId: account.bankIntegrationId,
    };
  }

  return {
    provider: 'ASAAS_COMPANY',
    financialAccountId: account.id,
    financialAccountName: account.name,
    bankIntegrationId: account.bankIntegrationId,
  };
}

/** Vincula a conta financeira ao bank_integrations INTER (não cria Asaas). */
export async function linkFinancialAccountToInterIntegration(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
): Promise<void> {
  const { data: inter, error: interErr } = await admin
    .from('bank_integrations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (interErr) throw new Error(interErr.message);
  if (!inter?.id) throw new Error('Configure o Banco Inter antes de vincular a conta financeira.');

  const { data: account, error: accErr } = await admin
    .from('company_financial_accounts')
    .select('id, company_id')
    .eq('id', financialAccountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!account?.id) throw new Error('Conta financeira não encontrada.');

  const { error } = await admin
    .from('company_financial_accounts')
    .update({
      bank_integration_id: inter.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', financialAccountId)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
}
