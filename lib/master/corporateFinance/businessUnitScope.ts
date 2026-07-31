/**
 * Escopo por unidade de negócio no Financeiro Corporativo Master.
 * Usado pelo Dashboard (Etapa 4) e APIs de summary/monthly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorporateBusinessUnit } from './businessUnit';

/** Unidade padrão do bloco corporativo no Dashboard (SV Topografia). */
export const DASHBOARD_CORPORATE_BUSINESS_UNIT: CorporateBusinessUnit = 'SV_TOPOGRAFIA';

/**
 * Contas da unidade. Históricos sem business_unit contam como SV_TOPOGRAFIA.
 * Retorna [] se nenhuma conta; null se unit omitida (sem filtro).
 */
export async function listCorporateAccountIdsForUnit(
  supabase: SupabaseClient,
  businessUnit?: CorporateBusinessUnit | string | null,
): Promise<string[] | null> {
  const unit = String(businessUnit || '').trim().toUpperCase();
  if (!unit) return null;

  let query = supabase.from('master_corporate_financial_accounts').select('id');
  if (unit === 'SV_TOPOGRAFIA') {
    query = query.or('business_unit.eq.SV_TOPOGRAFIA,business_unit.is.null');
  } else {
    query = query.eq('business_unit', unit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => String(r.id));
}

/** PostgREST filter fragment for receivables/payables.business_unit */
export function corporateBusinessUnitOrFilter(
  businessUnit: CorporateBusinessUnit | string,
): string {
  const unit = String(businessUnit).trim().toUpperCase();
  if (unit === 'SV_TOPOGRAFIA') {
    return 'business_unit.eq.SV_TOPOGRAFIA,business_unit.is.null';
  }
  return `business_unit.eq.${unit}`;
}
