/**
 * Configurações do Financeiro SaaS Master.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const SAAS_CASH_START_AT_KEY = 'saas_cash_start_at';

export type SaasCashStartAtValue = {
  at: string;
};

function parseSettingRow(row: Record<string, unknown> | null): string | null {
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return null;
  }
  const at = String((row.value as SaasCashStartAtValue).at || '').trim();
  return at || null;
}

export async function getSaasCashStartAt(
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('saas_finance_settings')
    .select('value')
    .eq('key', SAAS_CASH_START_AT_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[saas-finance-settings] falha ao ler marco inicial:', error.message);
    return null;
  }

  return parseSettingRow(data as Record<string, unknown> | null);
}

export async function setSaasCashStartAt(
  supabaseAdmin: SupabaseClient,
  input: { at?: string; userId?: string | null },
): Promise<string> {
  const at = input.at?.trim() || new Date().toISOString();
  const now = new Date().toISOString();
  const value: SaasCashStartAtValue = { at };

  const { data: existing } = await supabaseAdmin
    .from('saas_finance_settings')
    .select('id')
    .eq('key', SAAS_CASH_START_AT_KEY)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('saas_finance_settings')
      .update({
        value,
        updated_at: now,
        updated_by: input.userId ?? null,
      })
      .eq('key', SAAS_CASH_START_AT_KEY);

    if (error) {
      throw new Error(error.message || 'Falha ao atualizar marco inicial do caixa');
    }
  } else {
    const { error } = await supabaseAdmin.from('saas_finance_settings').insert({
      key: SAAS_CASH_START_AT_KEY,
      value,
      updated_at: now,
      updated_by: input.userId ?? null,
    });

    if (error) {
      throw new Error(error.message || 'Falha ao salvar marco inicial do caixa');
    }
  }

  return at;
}

export function formatSaasCashStartAtLabel(iso: string | null | undefined): string | null {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Filtra movimentações anteriores ao marco inicial (não apaga dados). */
export function filterMovementsByCashStartAt<T extends {
  created_at?: string | null;
  movement_date: string;
}>(
  movements: T[],
  cashStartAt?: string | null,
): T[] {
  if (!cashStartAt) return movements;
  const startMs = new Date(cashStartAt).getTime();
  if (Number.isNaN(startMs)) return movements;

  return movements.filter((movement) => {
    if (movement.created_at) {
      return new Date(movement.created_at).getTime() >= startMs;
    }
    const dayEnd = new Date(`${movement.movement_date}T23:59:59.999`);
    return dayEnd.getTime() >= startMs;
  });
}

export function effectiveSaasCashFromDate(
  fromDate: string | undefined,
  cashStartAt: string | null | undefined,
): string | undefined {
  if (!fromDate && !cashStartAt) return fromDate;
  const from = fromDate || '1970-01-01';
  if (!cashStartAt) return from;
  const startDay = cashStartAt.split('T')[0];
  return from > startDay ? from : startDay;
}
