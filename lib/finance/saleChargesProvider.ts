/**
 * Resolve o provider de cobrança da venda pela conta financeira vinculada.
 * ASAAS_COMPANY = fluxo atual (intocado). INTER = bank_charges.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFinancialAccountForSaleOptional } from '@/lib/finance/companyFinancialAccountResolver';
import { formatFinancialAccountLabel } from '@/lib/finance/companyFinancialAccountTypes';

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
      financialAccountName: account
        ? formatFinancialAccountLabel(account)
        : null,
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
  const labeled = formatFinancialAccountLabel({
    ...account,
    provider: providerRaw || account.provider || null,
  });

  if (providerRaw === 'INTER') {
    return {
      provider: 'INTER',
      financialAccountId: account.id,
      financialAccountName: labeled,
      bankIntegrationId: account.bankIntegrationId,
    };
  }

  return {
    provider: 'ASAAS_COMPANY',
    financialAccountId: account.id,
    financialAccountName: labeled,
    bankIntegrationId: account.bankIntegrationId,
  };
}

/** @deprecated use lib/finance/interFinancialAccountService — reexport para compat. */
export {
  linkFinancialAccountToInterIntegration,
  createInterFinancialAccount,
  recoverMislinkedAsaasAndEnsureInterAccount,
} from '@/lib/finance/interFinancialAccountService';
