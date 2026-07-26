/**
 * Persistência de customer_spouses (cadastro reutilizável por empresa + comprador).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formFieldsToCustomerSpousePayload,
  mergeCustomerSpouseSuggestions,
  saleRowToCustomerSpouseCandidate,
  type CustomerSpouseRecord,
  type CustomerSpouseSuggestion,
} from '@/lib/customerSpouses';
import type { SaleSpouseFormFields } from '@/lib/saleSpouseFields';

const REGISTRY_SELECT =
  'id, company_id, tenant_id, customer_id, full_name, nationality, marital_status, profession, rg, rg_issuer, cpf, cpf_digits, phone, email, address, is_current, last_used_at, last_sale_id, created_at, updated_at';

const SALE_SPOUSE_HISTORY_SELECT =
  'id, sale_date, created_at, sale_spouse_name, sale_spouse_nationality, sale_spouse_marital_status, sale_spouse_profession, sale_spouse_rg, sale_spouse_rg_issuer, sale_spouse_cpf, sale_spouse_phone, sale_spouse_email, sale_spouse_address';

export async function listCustomerSpouseSuggestions(
  supabase: SupabaseClient,
  params: { companyId: string; customerId: string },
): Promise<CustomerSpouseSuggestion[]> {
  const { companyId, customerId } = params;
  if (!companyId || !customerId) return [];

  const [registryRes, salesRes] = await Promise.all([
    supabase
      .from('customer_spouses')
      .select(REGISTRY_SELECT)
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .order('is_current', { ascending: false })
      .order('last_used_at', { ascending: false }),
    supabase
      .from('sales')
      .select(SALE_SPOUSE_HISTORY_SELECT)
      .eq('customer_id', customerId)
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .not('sale_spouse_name', 'is', null)
      .order('sale_date', { ascending: false })
      .limit(40),
  ]);

  // Tabela ainda não aplicada no ambiente: falha soft → só histórico de vendas.
  const registry = registryRes.error
    ? []
    : ((registryRes.data || []) as CustomerSpouseRecord[]);

  const fromSales: CustomerSpouseRecord[] = [];
  if (!salesRes.error) {
    for (const sale of salesRes.data || []) {
      const candidate = saleRowToCustomerSpouseCandidate(
        sale as Record<string, unknown>,
        companyId,
        customerId,
      );
      if (candidate) fromSales.push(candidate);
    }
  }

  return mergeCustomerSpouseSuggestions({ registry, fromSales });
}

export async function upsertCustomerSpouseFromSaleForm(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    customerId: string;
    fields: Partial<SaleSpouseFormFields>;
    saleId?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const payload = formFieldsToCustomerSpousePayload({
    companyId: params.companyId,
    customerId: params.customerId,
    fields: params.fields,
    lastSaleId: params.saleId,
  });
  if (!payload) return { ok: true };

  // Desmarca is_current dos demais do mesmo comprador.
  await supabase
    .from('customer_spouses')
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq('company_id', params.companyId)
    .eq('customer_id', params.customerId)
    .neq('cpf_digits', payload.cpf_digits);

  const { data: existing } = await supabase
    .from('customer_spouses')
    .select('id')
    .eq('company_id', params.companyId)
    .eq('customer_id', params.customerId)
    .eq('cpf_digits', payload.cpf_digits)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('customer_spouses')
      .update({
        ...payload,
        is_current: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('customer_spouses').insert({
    ...payload,
    is_current: true,
  });
  if (error) {
    // Ambiente sem migration: não bloqueia a venda.
    if (
      /does not exist|schema cache|Could not find the table/i.test(error.message)
    ) {
      console.warn('[customer_spouses] tabela ausente — skip upsert', error.message);
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
