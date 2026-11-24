/**
 * Conta financeira exclusiva do C6. Nasce sem bank_integration_id.
 * O vínculo com a integração ocorre só no save_company_c6_bank_config.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';

export const C6_FINANCIAL_ACCOUNT_NAME = 'Conta C6';
export const C6_FINANCIAL_ACCOUNT_NOTE =
  'Conta financeira C6 aguardando vínculo. Não usar no Asaas nem no Inter.';

/** A integração que já tem conta continua nela. Uma conta nova não recebe o mesmo vínculo. */
export function c6FinancialAccountIdForSave(
  requestedAccountId: string | null | undefined,
  ownedAccountId: string | null | undefined,
): string | null {
  const owned = String(ownedAccountId || '').trim();
  if (owned) return owned;
  const requested = String(requestedAccountId || '').trim();
  return requested || null;
}

export function isPendingC6FinancialAccount(account: {
  bankIntegrationId?: string | null;
  provider?: string | null;
  notes?: string | null;
} | null | undefined): boolean {
  if (!account) return false;
  if (account.bankIntegrationId) return false;
  if (account.provider) return false;
  return String(account.notes || '').includes('Conta financeira C6 aguardando vínculo');
}

export async function createUnlinkedC6FinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  environment: BankEnvironment,
): Promise<{ id: string; name: string; created: boolean }> {
  const owner = String(companyId || '').trim();
  if (!owner) throw new Error('Empresa não identificada.');
  const env = environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

  const { data: existing, error: existingError } = await admin
    .from('company_financial_accounts')
    .select('id, name, company_id, bank_integration_id, active, notes')
    .eq('company_id', owner)
    .is('bank_integration_id', null)
    .eq('active', true);
  if (existingError) throw new Error(existingError.message);
  const { data: integrations, error: integrationError } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider')
    .eq('company_id', owner)
    .eq('provider', 'C6');
  if (integrationError) throw new Error(integrationError.message);
  const c6IntegrationIds = new Set(
    (integrations || [])
      .filter(
        (row) => String(row.company_id) === owner && String(row.provider || '').toUpperCase() === 'C6',
      )
      .map((row) => String(row.id)),
  );
  const { data: companyAccounts, error: companyAccountsError } = await admin
    .from('company_financial_accounts')
    .select('id, name, company_id, bank_integration_id, active')
    .eq('company_id', owner)
    .eq('active', true);
  if (companyAccountsError) throw new Error(companyAccountsError.message);
  const owned = (companyAccounts || []).find(
    (row) =>
      String(row.company_id) === owner &&
      c6IntegrationIds.has(String(row.bank_integration_id || '')),
  );
  if (owned?.id) {
    return { id: String(owned.id), name: String(owned.name || C6_FINANCIAL_ACCOUNT_NAME), created: false };
  }

  const reusable = (existing || []).find(
    (row) =>
      String(row.company_id) === owner &&
      !row.bank_integration_id &&
      String(row.notes || '').includes('Conta financeira C6 aguardando vínculo'),
  );
  if (reusable?.id) {
    return { id: String(reusable.id), name: String(reusable.name || C6_FINANCIAL_ACCOUNT_NAME), created: false };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('company_financial_accounts')
    .insert({
      company_id: owner,
      name: C6_FINANCIAL_ACCOUNT_NAME,
      account_type: 'IMOBILIARIA',
      environment: env,
      bank_integration_id: null,
      is_default: false,
      active: true,
      notes: C6_FINANCIAL_ACCOUNT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .select('id, name, company_id, bank_integration_id')
    .single();
  if (error) throw new Error(error.message);
  if (String(data.company_id) !== owner || data.bank_integration_id) {
    throw new Error('A conta C6 não pôde ser criada nesta empresa.');
  }
  return { id: String(data.id), name: String(data.name), created: true };
}
