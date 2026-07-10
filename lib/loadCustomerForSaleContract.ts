/**
 * Carregamento canônico do comprador para gerar/regenerar/visualizar contrato.
 * Mesma fonte usada pela regeneração (GIS e API) — nunca o objeto resumido da lista.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mergeCustomerData,
  normalizeDocument,
} from '@/lib/customerIdentity';

/**
 * Carrega `customers` completo (select *) e mescla `clients` pelo CPF quando existir.
 * Espelha o comportamento de loadFreshRegenerationEntities.
 */
export async function loadCustomerForSaleContract(
  supabase: SupabaseClient,
  params: {
    customerId?: string | null;
    tenantId?: string | null;
  },
): Promise<Record<string, unknown>> {
  const customerId = String(params.customerId || '').trim();
  if (!customerId) return {};

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar cliente: ${error.message}`);
  }

  let customer = (data as Record<string, unknown>) || {};
  if (!customer.id) return {};

  const tenantId = String(params.tenantId || customer.tenant_id || '').trim();
  const doc = normalizeDocument(
    String(customer.cpf_cnpj || customer.document || customer.cpf || ''),
  );

  if (doc.length >= 11) {
    let clientQuery = supabase.from('clients').select('*').eq('cpf_cnpj', doc);
    if (tenantId) {
      clientQuery = clientQuery.eq('tenant_id', tenantId);
    }
    const { data: clientRow } = await clientQuery.maybeSingle();
    if (clientRow) {
      customer = mergeCustomerData(customer, clientRow as Record<string, unknown>);
    }
  }

  return customer;
}
