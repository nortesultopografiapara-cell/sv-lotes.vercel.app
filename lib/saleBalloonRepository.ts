/**
 * Persistência de parcelas balão (tabela própria).
 * - Sem balão + migration ausente → no-op seguro (venda normal).
 * - Com balão + migration ausente → erro explícito (nunca perde dados silenciosamente).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SaleBalloonFormConfig,
  SaleBalloonMode,
  SaleBalloonPlan,
} from '@/lib/saleBalloonInstallments';
import {
  BALLOON_MIGRATION_REQUIRED_MESSAGE,
  balloonFormConfigFromRows,
  resolveSaleBalloonPlan,
} from '@/lib/saleBalloonInstallments';

export function isBalloonSchemaMissingError(message: string | undefined): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('sale_balloon_installments') ||
    m.includes('use_balloon_installments') ||
    m.includes('balloon_mode') ||
    m.includes('balloon_config') ||
    (m.includes('does not exist') && m.includes('balloon')) ||
    (m.includes('schema cache') && m.includes('balloon'))
  );
}

function isMissingRelationError(message: string | undefined): boolean {
  const m = String(message || '').toLowerCase();
  return (
    isBalloonSchemaMissingError(message) ||
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('could not find the table')
  );
}

export type SaleBalloonRow = {
  id?: string;
  sale_id: string;
  installment_number: number;
  additional_amount: number;
  due_date?: string | null;
};

export async function probeBalloonSchemaAvailable(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from('sale_balloon_installments')
    .select('id')
    .limit(1);
  if (!error) return true;
  if (isMissingRelationError(error.message)) return false;
  // Outros erros (RLS/auth) → schema existe
  return true;
}

export async function saleHasGeneratedCharges(
  supabase: SupabaseClient,
  saleId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('company_asaas_charges')
    .select('id', { count: 'exact', head: true })
    .eq('sale_id', saleId)
    .not('status', 'eq', 'CANCELLED');

  if (error) {
    if (isMissingRelationError(error.message)) return false;
    console.warn('[saleBalloon] charge check', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function loadSaleBalloonRows(
  supabase: SupabaseClient,
  saleId: string,
): Promise<SaleBalloonRow[]> {
  const { data, error } = await supabase
    .from('sale_balloon_installments')
    .select('id, sale_id, installment_number, additional_amount, due_date')
    .eq('sale_id', saleId)
    .order('installment_number', { ascending: true });

  if (error) {
    if (isMissingRelationError(error.message)) return [];
    console.warn('[saleBalloon] load rows', error.message);
    return [];
  }
  return (data || []) as SaleBalloonRow[];
}

export function planFromSaleBalloonFields(params: {
  useBalloon: boolean;
  balloonMode?: string | null;
  balloonConfig?: SaleBalloonFormConfig | null;
  rows: SaleBalloonRow[];
  installmentsCount: number;
  contractValue: number;
}): SaleBalloonPlan {
  if (!params.useBalloon && params.rows.length === 0) {
    return { enabled: false, mode: 'MANUAL', items: [], config: null };
  }

  const config =
    params.balloonConfig ||
    balloonFormConfigFromRows(
      params.rows.map((r) => ({
        installment_number: r.installment_number,
        additional_amount: Number(r.additional_amount) || 0,
        due_date: r.due_date,
      })),
      (params.balloonMode as SaleBalloonMode) || 'MANUAL',
    );

  if (params.rows.length > 0 && !params.balloonConfig) {
    return {
      enabled: true,
      mode: (params.balloonMode as SaleBalloonMode) || 'MANUAL',
      items: params.rows.map((r) => ({
        installmentNumber: r.installment_number,
        additionalAmount: Number(r.additional_amount) || 0,
        dueDate: r.due_date || null,
      })),
      config,
    };
  }

  return resolveSaleBalloonPlan({
    useBalloon: params.useBalloon || params.rows.length > 0,
    installmentsCount: params.installmentsCount,
    contractValue: params.contractValue,
    config,
  });
}

/**
 * Substitui balões da venda.
 * @throws se balão habilitado e schema ausente (nunca no-op silencioso com balão).
 */
export async function replaceSaleBalloonInstallments(
  supabase: SupabaseClient,
  saleId: string,
  plan: SaleBalloonPlan,
): Promise<void> {
  const wantsBalloon = Boolean(plan.enabled && plan.items.length > 0);

  const { error: delErr } = await supabase
    .from('sale_balloon_installments')
    .delete()
    .eq('sale_id', saleId);

  if (delErr) {
    if (isMissingRelationError(delErr.message)) {
      if (wantsBalloon) {
        throw new Error(BALLOON_MIGRATION_REQUIRED_MESSAGE);
      }
      return;
    }
    throw new Error(`Erro ao limpar parcelas balão: ${delErr.message}`);
  }

  if (!wantsBalloon) return;

  const rows = plan.items.map((item) => ({
    sale_id: saleId,
    installment_number: item.installmentNumber,
    additional_amount: item.additionalAmount,
    due_date: item.dueDate || null,
  }));

  const { error: insErr } = await supabase
    .from('sale_balloon_installments')
    .insert(rows);

  if (insErr) {
    if (isMissingRelationError(insErr.message)) {
      throw new Error(BALLOON_MIGRATION_REQUIRED_MESSAGE);
    }
    throw new Error(`Erro ao gravar parcelas balão: ${insErr.message}`);
  }
}

export function balloonSalesPatchFromPlan(plan: SaleBalloonPlan): {
  use_balloon_installments: boolean;
  balloon_mode: string | null;
  balloon_config: SaleBalloonFormConfig | null;
} {
  if (!plan.enabled || plan.items.length === 0) {
    return {
      use_balloon_installments: false,
      balloon_mode: null,
      balloon_config: null,
    };
  }
  return {
    use_balloon_installments: true,
    balloon_mode: plan.mode,
    balloon_config: plan.config || null,
  };
}
