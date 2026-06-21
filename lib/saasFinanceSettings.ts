/**
 * Configurações do Financeiro SaaS Master.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sumReceivedRevenue, type MasterSaasPayment } from '@/lib/masterSaasPayments';

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

/** Valor para input datetime-local (YYYY-MM-DDTHH:mm). */
export function formatSaasCashStartAtForInput(iso: string | null | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converte datetime-local ou ISO em instante UTC para persistência. */
export function parseSaasCashStartAtInput(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw).toISOString();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data/hora do marco financeiro inválida.');
  }
  return parsed.toISOString();
}

/** Alias semântico — marco financeiro SaaS (Caixa + dashboards). */
export const getSaasFinanceStartAt = getSaasCashStartAt;

export type SaasFinancialRecord = {
  created_at?: string | null;
  paid_at?: string | null;
  due_date?: string | null;
  reference_month?: string | null;
  issued_at?: string | null;
  movement_date?: string | null;
};

function parseFinancialInstant(raw: string): number | null {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;
  const iso = normalized.includes('T')
    ? normalized
    : `${normalized.split('T')[0]}T12:00:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Data financeira principal do registro (pagamento, fatura, receita). */
export function resolveSaasFinancialRecordDate(
  record: SaasFinancialRecord,
): string | null {
  if (record.paid_at) return record.paid_at;
  if (record.due_date) return record.due_date;
  if (record.movement_date) return record.movement_date;
  if (record.issued_at) return record.issued_at;
  if (record.reference_month) {
    const [year, month] = record.reference_month.split('-');
    if (year && month) {
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      return `${year}-${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
    }
  }
  if (record.created_at) return record.created_at;
  return null;
}

/** Registro entra nos KPIs financeiros SaaS somente se a data financeira >= marco. */
export function isSaasFinancialRecordAfterStartAt(
  record: SaasFinancialRecord,
  startAt?: string | null,
): boolean {
  if (!startAt) return true;
  const startMs = parseFinancialInstant(startAt);
  if (startMs == null) return true;

  const recordDate = resolveSaasFinancialRecordDate(record);
  if (!recordDate) return false;
  const recordMs = parseFinancialInstant(recordDate);
  if (recordMs == null) return false;
  return recordMs >= startMs;
}

/** Filtra registros financeiros anteriores ao marco (não apaga dados). */
export function applySaasFinanceStartAtFilter<T extends SaasFinancialRecord>(
  records: T[],
  startAt?: string | null,
): T[] {
  if (!startAt) return records;
  return records.filter((record) => isSaasFinancialRecordAfterStartAt(record, startAt));
}

/** Receita recebida SaaS — somente pagamentos confirmados após o marco (sem fallback em faturas). */
export function sumSaasReceivedRevenue(
  payments: MasterSaasPayment[],
  startAt?: string | null,
): number {
  return sumReceivedRevenue(applySaasFinanceStartAtFilter(payments, startAt));
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
  return movements.filter((movement) =>
    isSaasFinancialRecordAfterStartAt(
      {
        movement_date: movement.movement_date,
        created_at: movement.created_at,
      },
      cashStartAt,
    ),
  );
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
