/**
 * Multi-conta: nunca escolher credencial “mais recente” / .limit(1)
 * quando houver 2+ contas ativas do mesmo provider.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const FINANCIAL_ACCOUNT_REQUIRED = 'FINANCIAL_ACCOUNT_REQUIRED' as const;

export type FinancialProviderLookup = 'INTER' | 'ASAAS_COMPANY';

export type ProviderFinancialAccountRef = {
  id: string;
  bankIntegrationId: string;
};

export function financialAccountRequiredMessage(provider: FinancialProviderLookup): string {
  const label = provider === 'INTER' ? 'Banco Inter' : 'Asaas';
  return `${FINANCIAL_ACCOUNT_REQUIRED}: há mais de uma conta ${label} ativa. Informe financial_account_id.`;
}

export function isFinancialAccountRequiredError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return message.includes(FINANCIAL_ACCOUNT_REQUIRED);
}

export async function listActiveFinancialAccountsForProvider(
  admin: SupabaseClient,
  companyId: string,
  provider: FinancialProviderLookup,
): Promise<ProviderFinancialAccountRef[]> {
  const { data: integrations, error: intErr } = await admin
    .from('bank_integrations')
    .select('id, provider')
    .eq('company_id', companyId)
    .eq('provider', provider);
  if (intErr) throw new Error(intErr.message);

  const integrationIds = new Set(
    (integrations || [])
      .map((row) => String(row.id || '').trim())
      .filter(Boolean),
  );
  if (integrationIds.size === 0) return [];

  const { data: accounts, error: accErr } = await admin
    .from('company_financial_accounts')
    .select('id, bank_integration_id, active')
    .eq('company_id', companyId)
    .eq('active', true);
  if (accErr) throw new Error(accErr.message);

  const out: ProviderFinancialAccountRef[] = [];
  for (const row of accounts || []) {
    const integrationId = String(row.bank_integration_id || '').trim();
    if (!integrationId || !integrationIds.has(integrationId)) continue;
    out.push({ id: String(row.id), bankIntegrationId: integrationId });
  }
  return out;
}

export async function listProviderIntegrations(
  admin: SupabaseClient,
  companyId: string,
  provider: FinancialProviderLookup,
): Promise<string[]> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', provider);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.id)).filter(Boolean);
}

/**
 * 1 conta/integração ativa → usa ela (legado).
 * 2+ sem financial_account_id → erro explícito.
 * 0 → null.
 */
export async function resolveUniqueProviderAccount(
  admin: SupabaseClient,
  companyId: string,
  provider: FinancialProviderLookup,
): Promise<{ financialAccountId: string | null; integrationId: string | null }> {
  const accounts = await listActiveFinancialAccountsForProvider(admin, companyId, provider);
  if (accounts.length >= 2) {
    throw new Error(financialAccountRequiredMessage(provider));
  }
  if (accounts.length === 1) {
    return {
      financialAccountId: accounts[0].id,
      integrationId: accounts[0].bankIntegrationId,
    };
  }

  const integrationIds = await listProviderIntegrations(admin, companyId, provider);
  if (integrationIds.length >= 2) {
    throw new Error(financialAccountRequiredMessage(provider));
  }
  if (integrationIds.length === 1) {
    return { financialAccountId: null, integrationId: integrationIds[0] };
  }
  return { financialAccountId: null, integrationId: null };
}
