/**
 * Caixa SaaS Master — movimentações automáticas e consultas.
 *
 * Fontes de evento financeiro (anti-duplicidade Etapa 3):
 * | Evento                         | Fonte principal              | Tabela / destino              |
 * |--------------------------------|------------------------------|-------------------------------|
 * | Mensalidade SaaS paga          | Webhook Asaas / charge paid  | saas_cash_movements (income)  |
 * | Extrato Asaas (taxa/saque/pix) | Sync financialTransactions   | saas_cash_movements           |
 * | Receita extraordinária SV      | Manual Caixa SaaS            | saas_cash_movements (manual)  |
 * | AR SV LOTES / Topografia       | Contas a Receber Master      | master_corporate_receivables  |
 * | Pagamentos corporativos        | Caixa / settle corporativo   | master_corporate_*            |
 *
 * Dedup Caixa SaaS: asaas_payment_id, saas_charge_id, metadata.asaas_movement_id,
 * metadata.external_reference (receita extraordinária).
 * NÃO há ponte automática AR SV LOTES ↔ saas_cash_movements nesta etapa.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIsoDate } from '@/lib/companySubscriptionDates';
import type { SaasCharge } from '@/lib/saasCharges';
import {
  mapAsaasFinancialTransaction,
  type MappedAsaasCashMovement,
} from '@/lib/asaasFinancialTransactions';
import {
  effectiveSaasCashFromDate,
  filterMovementsByCashStartAt,
  getSaasCashStartAt,
  isSaasFinancialRecordAfterStartAt,
} from '@/lib/saasFinanceSettings';
import {
  isAsaasConfigured,
  listAsaasFinancialTransactions,
  type AsaasFinancialTransaction,
} from '@/lib/payments/providers/asaas';
import { logMasterApiStep } from '@/lib/masterApiPerfLog';

/** Origem explícita de receita extraordinária (metadata; source DB permanece `manual`). */
export const MANUAL_EXTRAORDINARY_INCOME_ORIGIN = 'MANUAL_EXTRAORDINARY_INCOME';

export type SaasCashMovementType = 'income' | 'expense' | 'transfer';

export type SaasCashMovementSource =
  | 'asaas_webhook'
  | 'manual'
  | 'asaas_transfer'
  | 'asaas_fee'
  | 'asaas_refund';

export type SaasCashMovement = {
  id: string;
  company_id: string | null;
  saas_charge_id: string | null;
  asaas_payment_id: string | null;
  type: SaasCashMovementType;
  category: string;
  description: string | null;
  amount: number;
  movement_date: string;
  source: SaasCashMovementSource;
  metadata: Record<string, unknown>;
  created_at: string | null;
  created_by: string | null;
  company_name?: string | null;
};

export type SaasCashSummary = {
  periodIncome: number;
  periodExpense: number;
  periodTransfer: number;
  netResult: number;
  movementCount: number;
};

export type ListSaasCashMovementsOptions = {
  companyId?: string;
  type?: SaasCashMovementType | 'all';
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cashStartAt?: string | null;
};

export type CreateSaasCashIncomeInput = {
  charge: Pick<
    SaasCharge,
    'id' | 'company_id' | 'amount' | 'payment_id' | 'paid_at'
  >;
  paidAt?: string;
  createdBy?: string | null;
};

export type SaasCashIncomeSkipReason =
  | 'zero_amount'
  | 'duplicate_asaas_payment'
  | 'duplicate_charge'
  | 'movement_exists'
  | 'insert_failed'
  | 'hidden_by_cash_start_at';

export type SaasCashIncomeDiagnostic = {
  payment_id: string | null;
  charge_id: string;
  paid_at: string | null;
  movement_date: string;
  cashStartAt: string | null;
  amount: number;
  outcome: 'created' | 'existing' | 'skipped';
  skip_reason?: SaasCashIncomeSkipReason;
  visible_in_cash?: boolean;
  error_message?: string;
};

export type CreateSaasCashManualIncomeInput = {
  masterPaymentId: string;
  companyId: string;
  amount: number;
  paidAt: string;
  referenceMonth?: string;
  saasChargeId?: string | null;
  asaasPaymentId?: string | null;
  createdBy?: string | null;
};

export type BackfillSaasCashResult = {
  checked: number;
  backfilled: number;
  alreadyHadMovement: number;
  hiddenByCashStartAt: number;
  hiddenByCashStartAtAmount: number;
  existingButHidden: number;
  existingButHiddenAmount: number;
  diagnostics: SaasCashIncomeDiagnostic[];
};

export type SaasCashHiddenByMarcoSummary = {
  hiddenCount: number;
  hiddenIncome: number;
  hiddenExpense: number;
  hiddenNet: number;
  latestHiddenAt: string | null;
};

export type SaasCashReceivedIncomeSummary = {
  visibleTotal: number;
  hiddenTotal: number;
  hiddenCount: number;
};

/** Agregação anual Jan–Dez para gráficos Receita × Despesa (Caixa SaaS). */
export type MonthlyRevenueExpense = {
  month: number;
  label: string;
  revenue: number;
  expense: number;
};

export const SAAS_CASH_MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

export function buildEmptyMonthlyRevenueExpense(): MonthlyRevenueExpense[] {
  return SAAS_CASH_MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    revenue: 0,
    expense: 0,
  }));
}

/**
 * Agrega receita e despesa mensais do Caixa SaaS (12 meses, zeros quando vazio).
 * Fonte única: saas_cash_movements (já consolidado — evita dupla contagem com
 * master_saas_payments, finance_receipts ou extrato Asaas).
 */
export async function aggregateSaasCashMonthlyRevenueExpense(
  supabaseAdmin: SupabaseClient,
  year: number,
  cashStartAt?: string | null,
): Promise<MonthlyRevenueExpense[]> {
  const resolvedStartAt =
    cashStartAt !== undefined ? cashStartAt : await getSaasCashStartAt(supabaseAdmin);
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const movements = await listSaasCashMovements(supabaseAdmin, {
    fromDate,
    toDate,
    type: 'all',
    cashStartAt: resolvedStartAt,
  });

  const months = buildEmptyMonthlyRevenueExpense();

  for (const row of movements) {
    const day = String(row.movement_date || '').split('T')[0] || '';
    if (!day.startsWith(String(year))) continue;
    const monthNum = Number(day.slice(5, 7));
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) continue;
    const amount = Number(row.amount || 0);
    if (!Number.isFinite(amount)) continue;
    const bucket = months[monthNum - 1];
    if (!bucket) continue;
    if (row.type === 'expense') {
      bucket.expense += amount;
    } else if (row.type === 'income') {
      bucket.revenue += amount;
    }
    // transfer: fora do P&L (não altera receita/despesa do gráfico)
  }

  return months;
}

export type SyncAsaasCashMovementsInput = {
  fromDate: string;
  toDate: string;
  createdBy?: string | null;
  cashStartAt?: string | null;
};

export type SyncAsaasCashMovementsResult = {
  fetched: number;
  created: number;
  incomeCreated: number;
  expenseCreated: number;
  transferCreated: number;
  skipped: number;
  skippedDuplicate: number;
  skippedBeforeStartAt: number;
  skippedWebhookIncome: number;
  unknown: number;
  unknownTypes: string[];
  period: { fromDate: string; toDate: string };
  sampleTypes: string[];
};

export type SyncAsaasCashMovementsDeps = {
  fetchTransactions?: (
    fromDate: string,
    toDate: string,
  ) => Promise<AsaasFinancialTransaction[]>;
  mapTransaction?: typeof mapAsaasFinancialTransaction;
};

const INCOME_CATEGORY = 'Assinatura SaaS';
const INCOME_DESCRIPTION = 'Recebimento de assinatura SaaS';

function parseMovementRow(row: Record<string, unknown>): SaasCashMovement {
  const metadata = row.metadata;
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    saas_charge_id: row.saas_charge_id ? String(row.saas_charge_id) : null,
    asaas_payment_id: row.asaas_payment_id ? String(row.asaas_payment_id) : null,
    type: String(row.type || 'income') as SaasCashMovementType,
    category: String(row.category || ''),
    description: row.description ? String(row.description) : null,
    amount: Number(row.amount || 0),
    movement_date: String(row.movement_date || '').split('T')[0],
    source: String(row.source || 'manual') as SaasCashMovementSource,
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {},
    created_at: row.created_at ? String(row.created_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    company_name: row.company_name ? String(row.company_name) : null,
  };
}

function normalizeMovementDate(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return todayIsoDate();
  return raw.split('T')[0];
}

function resolveCompanyId(companyId?: string | null): string | null {
  const id = String(companyId || '').trim();
  return id || null;
}

export function saasCashSourceLabel(source: SaasCashMovementSource | string): string {
  switch (String(source || '').toLowerCase()) {
    case 'asaas_webhook':
      return 'Asaas';
    case 'manual':
      return 'Manual';
    case 'asaas_transfer':
      return 'Transferência';
    case 'asaas_fee':
      return 'Tarifa';
    case 'asaas_refund':
      return 'Estorno';
    default:
      return String(source || '—');
  }
}

export function saasCashTypeLabel(type: SaasCashMovementType | string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'expense') return 'Saída';
  if (t === 'transfer') return 'Transferência';
  return 'Entrada';
}

export function computeSaasCashSummaryFromRows(
  movements: Pick<SaasCashMovement, 'type' | 'amount'>[],
): SaasCashSummary {
  let periodIncome = 0;
  let periodExpense = 0;
  let periodTransfer = 0;

  for (const row of movements) {
    const amount = Number(row.amount || 0);
    if (row.type === 'expense') {
      periodExpense += amount;
    } else if (row.type === 'transfer') {
      periodTransfer += amount;
    } else if (row.type === 'income') {
      periodIncome += amount;
    }
  }

  return {
    periodIncome,
    periodExpense,
    periodTransfer,
    netResult: periodIncome - periodExpense,
    movementCount: movements.length,
  };
}

async function findExistingAsaasWebhookIncome(
  supabaseAdmin: SupabaseClient,
  asaasPaymentId: string,
): Promise<SaasCashMovement | null> {
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('asaas_payment_id', asaasPaymentId)
    .eq('source', 'asaas_webhook')
    .eq('type', 'income')
    .maybeSingle();

  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function findExistingChargeWebhookIncome(
  supabaseAdmin: SupabaseClient,
  saasChargeId: string,
): Promise<SaasCashMovement | null> {
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('saas_charge_id', saasChargeId)
    .eq('source', 'asaas_webhook')
    .eq('type', 'income')
    .maybeSingle();

  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function findExistingIncomeByChargeId(
  supabaseAdmin: SupabaseClient,
  saasChargeId: string,
): Promise<SaasCashMovement | null> {
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('saas_charge_id', saasChargeId)
    .eq('type', 'income')
    .maybeSingle();

  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function findExistingManualIncomeByMasterPayment(
  supabaseAdmin: SupabaseClient,
  masterPaymentId: string,
): Promise<SaasCashMovement | null> {
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('type', 'income')
    .contains('metadata', { master_payment_id: masterPaymentId })
    .maybeSingle();

  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function findExistingIncomeForCharge(
  supabaseAdmin: SupabaseClient,
  saasChargeId: string,
  asaasPaymentId?: string | null,
): Promise<SaasCashMovement | null> {
  const byCharge = await findExistingIncomeByChargeId(supabaseAdmin, saasChargeId);
  if (byCharge) return byCharge;

  const paymentId = String(asaasPaymentId || '').trim();
  if (paymentId) {
    return findExistingAsaasWebhookIncome(supabaseAdmin, paymentId);
  }

  return null;
}

function logSaasCashIncomeDiagnostic(diagnostic: SaasCashIncomeDiagnostic): void {
  console.warn('[saas-cash-income]', JSON.stringify(diagnostic));
}

function cashVisibilityAfterStartAt(
  movementDate: string,
  cashStartAt: string | null,
): boolean {
  if (!cashStartAt) return true;
  return isSaasFinancialRecordAfterStartAt({ movement_date: movementDate }, cashStartAt);
}

function movementRowVisibility(
  row: Pick<SaasCashMovement, 'movement_date' | 'created_at'>,
  cashStartAt: string | null,
): boolean {
  if (!cashStartAt) return true;
  return isSaasFinancialRecordAfterStartAt(
    {
      movement_date: row.movement_date,
      created_at: row.created_at,
    },
    cashStartAt,
  );
}

/** Estatísticas de movimentações ocultas pelo marco financeiro no período. */
export function computeSaasCashHiddenByMarcoFromRows(
  movements: Pick<SaasCashMovement, 'type' | 'amount' | 'movement_date' | 'created_at'>[],
  cashStartAt: string | null,
): SaasCashHiddenByMarcoSummary {
  if (!cashStartAt) {
    return {
      hiddenCount: 0,
      hiddenIncome: 0,
      hiddenExpense: 0,
      hiddenNet: 0,
      latestHiddenAt: null,
    };
  }

  let hiddenCount = 0;
  let hiddenIncome = 0;
  let hiddenExpense = 0;
  let latestHiddenMs: number | null = null;
  let latestHiddenAt: string | null = null;

  for (const row of movements) {
    if (movementRowVisibility(row, cashStartAt)) continue;

    hiddenCount += 1;
    const amount = Number(row.amount || 0);
    if (row.type === 'expense') {
      hiddenExpense += amount;
    } else if (row.type === 'income') {
      hiddenIncome += amount;
    }
    // transfer: fora do P&L oculto

    const instant =
      parseFinancialInstant(String(row.created_at || '')) ??
      parseFinancialInstant(String(row.movement_date || ''));
    if (instant != null && (latestHiddenMs == null || instant > latestHiddenMs)) {
      latestHiddenMs = instant;
      latestHiddenAt = row.created_at || `${row.movement_date}T12:00:00.000Z`;
    }
  }

  return {
    hiddenCount,
    hiddenIncome,
    hiddenExpense,
    hiddenNet: hiddenIncome - hiddenExpense,
    latestHiddenAt,
  };
}

function parseFinancialInstant(raw: string): number | null {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;
  const iso = normalized.includes('T')
    ? normalized
    : `${normalized.split('T')[0]}T12:00:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Registra entrada automática quando cobrança SaaS é paga (idempotente por asaas_payment_id). */
export async function createSaasCashIncomeFromChargePaid(
  supabaseAdmin: SupabaseClient,
  input: CreateSaasCashIncomeInput,
): Promise<{ movement: SaasCashMovement | null; created: boolean }> {
  const asaasPaymentId = String(input.charge.payment_id || '').trim() || null;
  const movementDate = normalizeMovementDate(
    input.paidAt || input.charge.paid_at || todayIsoDate(),
  );
  const companyId = resolveCompanyId(input.charge.company_id);
  const amount = Number(input.charge.amount || 0);

  if (amount <= 0) {
    console.warn('[saas-cash] valor inválido — entrada ignorada', {
      chargeId: input.charge.id,
      amount,
    });
    return { movement: null, created: false };
  }

  if (asaasPaymentId) {
    const existing = await findExistingAsaasWebhookIncome(supabaseAdmin, asaasPaymentId);
    if (existing) {
      return { movement: existing, created: false };
    }
  } else {
    const existingByCharge = await findExistingChargeWebhookIncome(
      supabaseAdmin,
      input.charge.id,
    );
    if (existingByCharge) {
      return { movement: existingByCharge, created: false };
    }
  }

  const insertRow = {
    company_id: companyId,
    saas_charge_id: input.charge.id,
    asaas_payment_id: asaasPaymentId,
    type: 'income' as const,
    category: INCOME_CATEGORY,
    description: INCOME_DESCRIPTION,
    amount,
    movement_date: movementDate,
    source: 'asaas_webhook' as const,
    metadata: {
      charge_id: input.charge.id,
      asaas_payment_id: asaasPaymentId,
      auto: true,
    },
    created_by: input.createdBy ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && asaasPaymentId) {
      const existing = await findExistingAsaasWebhookIncome(supabaseAdmin, asaasPaymentId);
      if (existing) {
        return { movement: existing, created: false };
      }
    }
    console.warn('[saas-cash] falha ao registrar entrada:', {
      chargeId: input.charge.id,
      asaasPaymentId,
      message: error.message,
    });
    return { movement: null, created: false };
  }

  return {
    movement: parseMovementRow(data as Record<string, unknown>),
    created: true,
  };
}

/** Garante entrada no caixa para cobrança paga — idempotente, com diagnóstico completo. */
export async function ensureSaasCashIncomeForPaidCharge(
  supabaseAdmin: SupabaseClient,
  input: CreateSaasCashIncomeInput,
  options?: { cashStartAt?: string | null },
): Promise<{ movement: SaasCashMovement | null; created: boolean; diagnostic: SaasCashIncomeDiagnostic }> {
  const cashStartAt =
    options?.cashStartAt !== undefined
      ? options.cashStartAt
      : await getSaasCashStartAt(supabaseAdmin);

  const asaasPaymentId = String(input.charge.payment_id || '').trim() || null;
  const paidAtRaw = input.paidAt || input.charge.paid_at || null;
  const paidAt = paidAtRaw ? normalizeMovementDate(paidAtRaw) : null;
  const movementDate = normalizeMovementDate(paidAtRaw || todayIsoDate());
  const amount = Number(input.charge.amount || 0);

  const diagnostic: SaasCashIncomeDiagnostic = {
    payment_id: asaasPaymentId,
    charge_id: input.charge.id,
    paid_at: paidAt,
    movement_date: movementDate,
    cashStartAt,
    amount,
    outcome: 'skipped',
  };

  if (amount <= 0) {
    diagnostic.skip_reason = 'zero_amount';
    logSaasCashIncomeDiagnostic(diagnostic);
    return { movement: null, created: false, diagnostic };
  }

  if (asaasPaymentId) {
    const existingByPayment = await findExistingAsaasWebhookIncome(
      supabaseAdmin,
      asaasPaymentId,
    );
    if (existingByPayment) {
      diagnostic.outcome = 'existing';
      diagnostic.skip_reason = 'duplicate_asaas_payment';
      diagnostic.visible_in_cash = cashVisibilityAfterStartAt(
        existingByPayment.movement_date,
        cashStartAt,
      );
      logSaasCashIncomeDiagnostic(diagnostic);
      return { movement: existingByPayment, created: false, diagnostic };
    }
  }

  const existingByCharge = await findExistingIncomeByChargeId(
    supabaseAdmin,
    input.charge.id,
  );
  if (existingByCharge) {
    diagnostic.outcome = 'existing';
    diagnostic.skip_reason =
      existingByCharge.source === 'asaas_webhook'
        ? 'duplicate_charge'
        : 'movement_exists';
    diagnostic.visible_in_cash = cashVisibilityAfterStartAt(
      existingByCharge.movement_date,
      cashStartAt,
    );
    logSaasCashIncomeDiagnostic(diagnostic);
    return { movement: existingByCharge, created: false, diagnostic };
  }

  const result = await createSaasCashIncomeFromChargePaid(supabaseAdmin, input);

  if (result.created && result.movement) {
    diagnostic.outcome = 'created';
    diagnostic.visible_in_cash = cashVisibilityAfterStartAt(movementDate, cashStartAt);
    if (cashStartAt && !diagnostic.visible_in_cash) {
      diagnostic.skip_reason = 'hidden_by_cash_start_at';
    }
  } else if (result.movement) {
    diagnostic.outcome = 'existing';
    diagnostic.visible_in_cash = cashVisibilityAfterStartAt(
      result.movement.movement_date,
      cashStartAt,
    );
  } else {
    diagnostic.skip_reason = 'insert_failed';
    diagnostic.error_message = 'Falha ao inserir movimentação no caixa SaaS';
  }

  logSaasCashIncomeDiagnostic(diagnostic);
  return { ...result, diagnostic };
}

/** Entrada manual quando pagamento não tem cobrança Asaas vinculada. */
export async function createSaasCashIncomeFromMasterPayment(
  supabaseAdmin: SupabaseClient,
  input: CreateSaasCashManualIncomeInput,
  options?: { cashStartAt?: string | null },
): Promise<{ movement: SaasCashMovement | null; created: boolean; diagnostic: SaasCashIncomeDiagnostic }> {
  const cashStartAt =
    options?.cashStartAt !== undefined
      ? options.cashStartAt
      : await getSaasCashStartAt(supabaseAdmin);

  const movementDate = normalizeMovementDate(input.paidAt);
  const amount = Number(input.amount || 0);
  const asaasPaymentId = String(input.asaasPaymentId || '').trim() || null;

  const diagnostic: SaasCashIncomeDiagnostic = {
    payment_id: asaasPaymentId,
    charge_id: String(input.saasChargeId || input.masterPaymentId),
    paid_at: movementDate,
    movement_date: movementDate,
    cashStartAt,
    amount,
    outcome: 'skipped',
  };

  if (amount <= 0) {
    diagnostic.skip_reason = 'zero_amount';
    logSaasCashIncomeDiagnostic(diagnostic);
    return { movement: null, created: false, diagnostic };
  }

  const existingManual = await findExistingManualIncomeByMasterPayment(
    supabaseAdmin,
    input.masterPaymentId,
  );
  if (existingManual) {
    diagnostic.outcome = 'existing';
    diagnostic.skip_reason = 'movement_exists';
    diagnostic.visible_in_cash = cashVisibilityAfterStartAt(
      existingManual.movement_date,
      cashStartAt,
    );
    logSaasCashIncomeDiagnostic(diagnostic);
    return { movement: existingManual, created: false, diagnostic };
  }

  if (asaasPaymentId) {
    const existingByPayment = await findExistingAsaasWebhookIncome(
      supabaseAdmin,
      asaasPaymentId,
    );
    if (existingByPayment) {
      diagnostic.outcome = 'existing';
      diagnostic.skip_reason = 'duplicate_asaas_payment';
      diagnostic.visible_in_cash = cashVisibilityAfterStartAt(
        existingByPayment.movement_date,
        cashStartAt,
      );
      logSaasCashIncomeDiagnostic(diagnostic);
      return { movement: existingByPayment, created: false, diagnostic };
    }
  }

  const insertRow = {
    company_id: resolveCompanyId(input.companyId),
    saas_charge_id: input.saasChargeId ?? null,
    asaas_payment_id: asaasPaymentId,
    type: 'income' as const,
    category: INCOME_CATEGORY,
    description: INCOME_DESCRIPTION,
    amount,
    movement_date: movementDate,
    source: 'manual' as const,
    metadata: {
      master_payment_id: input.masterPaymentId,
      reference_month: input.referenceMonth ?? null,
      auto: true,
    },
    created_by: input.createdBy ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const dup = await findExistingManualIncomeByMasterPayment(
        supabaseAdmin,
        input.masterPaymentId,
      );
      if (dup) {
        diagnostic.outcome = 'existing';
        diagnostic.skip_reason = 'movement_exists';
        logSaasCashIncomeDiagnostic(diagnostic);
        return { movement: dup, created: false, diagnostic };
      }
    }
    diagnostic.skip_reason = 'insert_failed';
    diagnostic.error_message = error.message;
    logSaasCashIncomeDiagnostic(diagnostic);
    return { movement: null, created: false, diagnostic };
  }

  diagnostic.outcome = 'created';
  diagnostic.visible_in_cash = cashVisibilityAfterStartAt(movementDate, cashStartAt);
  if (cashStartAt && !diagnostic.visible_in_cash) {
    diagnostic.skip_reason = 'hidden_by_cash_start_at';
  }
  logSaasCashIncomeDiagnostic(diagnostic);

  return {
    movement: parseMovementRow(data as Record<string, unknown>),
    created: true,
    diagnostic,
  };
}

/** Após markInvoicePaid — usa cobrança vinculada ou entrada manual. */
export async function ensureSaasCashAfterInvoicePaid(
  supabaseAdmin: SupabaseClient,
  input: {
    invoiceId: string;
    paymentId: string;
    paidAt: string;
    amount: number;
    companyId: string;
    referenceMonth?: string;
    createdBy?: string | null;
  },
): Promise<{ movement: SaasCashMovement | null; created: boolean }> {
  const cashStartAt = await getSaasCashStartAt(supabaseAdmin);

  const { data: chargeRow } = await supabaseAdmin
    .from('saas_charges')
    .select('id, company_id, amount, payment_id, paid_at')
    .eq('invoice_id', input.invoiceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (chargeRow) {
    const result = await ensureSaasCashIncomeForPaidCharge(
      supabaseAdmin,
      {
        charge: {
          id: String(chargeRow.id),
          company_id: String(chargeRow.company_id),
          amount: Number(chargeRow.amount || input.amount),
          payment_id: chargeRow.payment_id ? String(chargeRow.payment_id) : null,
          paid_at: chargeRow.paid_at ? String(chargeRow.paid_at) : null,
        },
        paidAt: input.paidAt,
        createdBy: input.createdBy ?? null,
      },
      { cashStartAt },
    );
    return { movement: result.movement, created: result.created };
  }

  const manual = await createSaasCashIncomeFromMasterPayment(
    supabaseAdmin,
    {
      masterPaymentId: input.paymentId,
      companyId: input.companyId,
      amount: input.amount,
      paidAt: input.paidAt,
      referenceMonth: input.referenceMonth,
      createdBy: input.createdBy ?? null,
    },
    { cashStartAt },
  );
  return { movement: manual.movement, created: manual.created };
}

/** Repara cobranças PAID sem movimentação no caixa (backfill idempotente). */
export async function backfillSaasCashForPaidCharges(
  supabaseAdmin: SupabaseClient,
  options: {
    companyId?: string;
    fromDate?: string;
    toDate?: string;
    createdBy?: string | null;
    cashStartAt?: string | null;
  } = {},
): Promise<BackfillSaasCashResult> {
  const cashStartAt =
    options.cashStartAt !== undefined
      ? options.cashStartAt
      : await getSaasCashStartAt(supabaseAdmin);

  let query = supabaseAdmin
    .from('saas_charges')
    .select('id, company_id, amount, payment_id, paid_at')
    .eq('status', 'PAID')
    .is('deleted_at', null);

  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  if (options.fromDate) {
    query = query.gte('paid_at', `${options.fromDate}T00:00:00.000Z`);
  }
  if (options.toDate) {
    query = query.lte('paid_at', `${options.toDate}T23:59:59.999Z`);
  }

  const { data: charges, error } = await query;
  if (error) {
    throw new Error(error.message || 'Falha ao listar cobranças pagas para backfill');
  }

  const diagnostics: SaasCashIncomeDiagnostic[] = [];
  let backfilled = 0;
  let alreadyHadMovement = 0;
  let hiddenByCashStartAt = 0;
  let hiddenByCashStartAtAmount = 0;
  let existingButHidden = 0;
  let existingButHiddenAmount = 0;

  for (const row of charges || []) {
    const charge = row as Pick<
      SaasCharge,
      'id' | 'company_id' | 'amount' | 'payment_id' | 'paid_at'
    >;

    const existing = await findExistingIncomeForCharge(
      supabaseAdmin,
      charge.id,
      charge.payment_id,
    );
    if (existing) {
      alreadyHadMovement += 1;
      if (cashStartAt && !movementRowVisibility(existing, cashStartAt)) {
        existingButHidden += 1;
        if (existing.type === 'income') {
          existingButHiddenAmount += Number(existing.amount || 0);
        }
      }
      continue;
    }

    const result = await ensureSaasCashIncomeForPaidCharge(
      supabaseAdmin,
      {
        charge,
        paidAt: charge.paid_at ? String(charge.paid_at).split('T')[0] : undefined,
        createdBy: options.createdBy ?? null,
      },
      { cashStartAt },
    );
    diagnostics.push(result.diagnostic);
    if (result.created) {
      backfilled += 1;
      if (result.diagnostic.skip_reason === 'hidden_by_cash_start_at') {
        hiddenByCashStartAt += 1;
        hiddenByCashStartAtAmount += Number(result.diagnostic.amount || 0);
      }
    }
  }

  if (
    backfilled > 0 ||
    hiddenByCashStartAt > 0 ||
    existingButHidden > 0 ||
    diagnostics.some((d) => d.skip_reason === 'hidden_by_cash_start_at')
  ) {
    console.warn(
      '[saas-cash-backfill]',
      JSON.stringify({
        checked: (charges || []).length,
        backfilled,
        alreadyHadMovement,
        hiddenByCashStartAt,
        hiddenByCashStartAtAmount,
        existingButHidden,
        existingButHiddenAmount,
        cashStartAt,
        fromDate: options.fromDate ?? null,
        toDate: options.toDate ?? null,
      }),
    );
  }

  return {
    checked: (charges || []).length,
    backfilled,
    alreadyHadMovement,
    hiddenByCashStartAt,
    hiddenByCashStartAtAmount,
    existingButHidden,
    existingButHiddenAmount,
    diagnostics,
  };
}

/** Lista movimentações do período sem filtrar pelo marco (para estatísticas de ocultos). */
export async function listSaasCashMovementsInPeriod(
  supabaseAdmin: SupabaseClient,
  options: Omit<ListSaasCashMovementsOptions, 'cashStartAt'> = {},
): Promise<SaasCashMovement[]> {
  let query = supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.fromDate) {
    query = query.gte('movement_date', options.fromDate);
  }
  if (options.toDate) {
    query = query.lte('movement_date', options.toDate);
  }
  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  if (options.type && options.type !== 'all') {
    query = query.eq('type', options.type);
  }
  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Falha ao listar movimentações do caixa SaaS');
  }

  const rows = (data || []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const companyIds = [
    ...new Set(
      rows
        .map((row) => (row.company_id ? String(row.company_id) : ''))
        .filter(Boolean),
    ),
  ];

  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name, fantasy_name')
      .in('id', companyIds);

    for (const company of companies || []) {
      const id = String((company as { id?: string }).id || '');
      const name =
        String((company as { fantasy_name?: string }).fantasy_name || '') ||
        String((company as { name?: string }).name || '');
      if (id) companyNames.set(id, name || '—');
    }
  }

  return rows.map((row) => {
    const movement = parseMovementRow(row);
    if (movement.company_id) {
      movement.company_name = companyNames.get(movement.company_id) || null;
    }
    return movement;
  });
}

export async function computeSaasCashHiddenByMarcoInPeriod(
  supabaseAdmin: SupabaseClient,
  options: ListSaasCashMovementsOptions,
): Promise<SaasCashHiddenByMarcoSummary> {
  const rows = await listSaasCashMovementsInPeriod(supabaseAdmin, {
    fromDate: options.fromDate,
    toDate: options.toDate,
    companyId: options.companyId,
    type: options.type,
  });
  return computeSaasCashHiddenByMarcoFromRows(rows, options.cashStartAt ?? null);
}

/** Receita recebida visível/oculta — mesma fonte do Caixa SaaS (entradas). */
export async function sumSaasCashReceivedIncome(
  supabaseAdmin: SupabaseClient,
  cashStartAt: string | null,
): Promise<SaasCashReceivedIncomeSummary> {
  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('type, amount, movement_date, created_at')
    .eq('type', 'income');

  if (error) {
    throw new Error(error.message || 'Falha ao somar entradas do caixa SaaS');
  }

  let visibleTotal = 0;
  let hiddenTotal = 0;
  let hiddenCount = 0;

  for (const row of data || []) {
    const amount = Number(row.amount || 0);
    const movement = {
      movement_date: String(row.movement_date || '').split('T')[0],
      created_at: row.created_at ? String(row.created_at) : null,
      type: 'income' as const,
      amount,
    };
    if (movementRowVisibility(movement, cashStartAt)) {
      visibleTotal += amount;
    } else {
      hiddenTotal += amount;
      hiddenCount += 1;
    }
  }

  return { visibleTotal, hiddenTotal, hiddenCount };
}

export async function reprocessSaasCashForPaidCharges(
  supabaseAdmin: SupabaseClient,
  input: {
    fromDate?: string;
    toDate?: string;
    companyId?: string;
    createdBy?: string | null;
    cashStartAt?: string | null;
    syncAsaas?: boolean;
  },
): Promise<{
  backfill: BackfillSaasCashResult;
  sync?: SyncAsaasCashMovementsResult;
  cashStartAt: string | null;
}> {
  const cashStartAt =
    input.cashStartAt !== undefined
      ? input.cashStartAt
      : await getSaasCashStartAt(supabaseAdmin);

  const backfill = await backfillSaasCashForPaidCharges(supabaseAdmin, {
    companyId: input.companyId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    createdBy: input.createdBy ?? null,
    cashStartAt,
  });

  let sync: SyncAsaasCashMovementsResult | undefined;
  if (input.syncAsaas && input.fromDate && input.toDate) {
    sync = await syncAsaasCashMovements(supabaseAdmin, {
      fromDate: input.fromDate,
      toDate: input.toDate,
      createdBy: input.createdBy ?? null,
      cashStartAt,
    });
  }

  return { backfill, sync, cashStartAt };
}

export type CreateExtraordinarySaasIncomeInput = {
  amount: number;
  movementDate: string;
  description: string;
  category?: string;
  companyId?: string | null;
  asaasPaymentId?: string | null;
  externalReference?: string | null;
  clientName?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

export type UpdateExtraordinarySaasIncomeInput = {
  id: string;
  description?: string;
  category?: string;
  clientName?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  movementDate?: string;
  /** Não permite alterar type, amount, source ou transformar em transfer/expense. */
  updatedBy?: string | null;
};

async function findIncomeByExternalReference(
  supabaseAdmin: SupabaseClient,
  externalReference: string,
): Promise<SaasCashMovement | null> {
  const ref = String(externalReference || '').trim();
  if (!ref) return null;
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('type', 'income')
    .eq('source', 'manual')
    .contains('metadata', { external_reference: ref })
    .maybeSingle();
  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function auditSaasCashExtraordinary(
  supabaseAdmin: SupabaseClient,
  action: 'CREATE' | 'UPDATE',
  movementId: string,
  actorId: string | null | undefined,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      user_id: actorId || null,
      module: 'SAAS_CASH',
      action: `SAAS_CASH_EXTRAORDINARY_${action}`,
      description:
        action === 'CREATE'
          ? `Receita extraordinária SV LOTES criada — ${movementId.slice(0, 8)}`
          : `Receita extraordinária SV LOTES atualizada — ${movementId.slice(0, 8)}`,
      reference_id: movementId,
      new_data: {
        ...details,
        origin: MANUAL_EXTRAORDINARY_INCOME_ORIGIN,
        business_unit: 'SV_LOTES',
      },
    });
  } catch (err) {
    console.warn('[saas-cash-extraordinary] audit_logs falhou:', err);
  }
}

/**
 * Receita extraordinária SV LOTES (ex.: link Asaas avulso / consultoria).
 * business_unit implícita = SV_LOTES; source = manual; origin metadata = MANUAL_EXTRAORDINARY_INCOME.
 * Idempotente por asaas_payment_id e por external_reference quando informados.
 */
export async function createExtraordinarySaasIncome(
  supabaseAdmin: SupabaseClient,
  input: CreateExtraordinarySaasIncomeInput,
): Promise<{ movement: SaasCashMovement; created: boolean }> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor da receita deve ser maior que zero.');
  }
  const movementDate = normalizeMovementDate(input.movementDate);
  const description = String(input.description || '').trim();
  if (!description) {
    throw new Error('Descrição é obrigatória.');
  }
  const asaasPaymentId = input.asaasPaymentId
    ? String(input.asaasPaymentId).trim() || null
    : null;
  const externalReference = input.externalReference
    ? String(input.externalReference).trim() || null
    : null;

  if (asaasPaymentId) {
    const { data: existing } = await supabaseAdmin
      .from('saas_cash_movements')
      .select('*')
      .eq('asaas_payment_id', asaasPaymentId)
      .eq('type', 'income')
      .maybeSingle();
    if (existing) {
      return {
        movement: parseMovementRow(existing as Record<string, unknown>),
        created: false,
      };
    }
  }

  if (externalReference) {
    const byRef = await findIncomeByExternalReference(supabaseAdmin, externalReference);
    if (byRef) {
      return { movement: byRef, created: false };
    }
  }

  const insertRow = {
    company_id: input.companyId ? String(input.companyId) : null,
    saas_charge_id: null,
    asaas_payment_id: asaasPaymentId,
    type: 'income' as const,
    category:
      String(input.category || 'Receita extraordinária').trim() ||
      'Receita extraordinária',
    description,
    amount,
    movement_date: movementDate,
    source: 'manual' as const,
    metadata: {
      extraordinary: true,
      origin: MANUAL_EXTRAORDINARY_INCOME_ORIGIN,
      business_unit: 'SV_LOTES',
      client_name: input.clientName ?? null,
      payment_method: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      asaas_payment_id: asaasPaymentId,
      external_reference: externalReference,
    },
    created_by: input.createdBy ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && asaasPaymentId) {
      const { data: dup } = await supabaseAdmin
        .from('saas_cash_movements')
        .select('*')
        .eq('asaas_payment_id', asaasPaymentId)
        .eq('type', 'income')
        .maybeSingle();
      if (dup) {
        return {
          movement: parseMovementRow(dup as Record<string, unknown>),
          created: false,
        };
      }
    }
    throw new Error(error.message || 'Falha ao lançar receita extraordinária.');
  }

  const movement = parseMovementRow(data as Record<string, unknown>);
  await auditSaasCashExtraordinary(supabaseAdmin, 'CREATE', movement.id, input.createdBy, {
    amount: movement.amount,
    movement_date: movement.movement_date,
    asaas_payment_id: asaasPaymentId,
    external_reference: externalReference,
  });

  return { movement, created: true };
}

/**
 * Edição segura de receita extraordinária: só campos descritivos/data.
 * Impede alterar type/amount/source (não vira transfer nem expense).
 */
export async function updateExtraordinarySaasIncome(
  supabaseAdmin: SupabaseClient,
  input: UpdateExtraordinarySaasIncomeInput,
): Promise<SaasCashMovement> {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('ID da movimentação é obrigatório.');

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error('Movimentação não encontrada.');

  const row = parseMovementRow(existing as Record<string, unknown>);
  const meta = row.metadata || {};
  const isExtraordinary =
    row.source === 'manual' &&
    (meta.extraordinary === true || meta.origin === MANUAL_EXTRAORDINARY_INCOME_ORIGIN);

  if (!isExtraordinary || row.type !== 'income') {
    throw new Error('Somente receita extraordinária manual pode ser editada por este fluxo.');
  }

  const nextDescription =
    input.description !== undefined
      ? String(input.description).trim()
      : row.description || '';
  if (!nextDescription) throw new Error('Descrição é obrigatória.');

  const nextCategory =
    input.category !== undefined
      ? String(input.category).trim() || row.category
      : row.category;

  const nextDate =
    input.movementDate !== undefined
      ? normalizeMovementDate(input.movementDate)
      : row.movement_date;

  const nextMeta = {
    ...meta,
    extraordinary: true,
    origin: MANUAL_EXTRAORDINARY_INCOME_ORIGIN,
    business_unit: 'SV_LOTES',
    client_name:
      input.clientName !== undefined ? input.clientName : (meta.client_name ?? null),
    payment_method:
      input.paymentMethod !== undefined
        ? input.paymentMethod
        : (meta.payment_method ?? null),
    notes: input.notes !== undefined ? input.notes : (meta.notes ?? null),
    last_edited_at: new Date().toISOString(),
    last_edited_by: input.updatedBy ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .update({
      description: nextDescription,
      category: nextCategory,
      movement_date: nextDate,
      metadata: nextMeta,
      // type/amount/source intencionalmente omitidos
    })
    .eq('id', id)
    .eq('type', 'income')
    .eq('source', 'manual')
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Falha ao atualizar receita extraordinária.');

  const movement = parseMovementRow(data as Record<string, unknown>);
  await auditSaasCashExtraordinary(supabaseAdmin, 'UPDATE', movement.id, input.updatedBy, {
    before: {
      description: row.description,
      category: row.category,
      movement_date: row.movement_date,
    },
    after: {
      description: movement.description,
      category: movement.category,
      movement_date: movement.movement_date,
    },
  });

  return movement;
}

export async function listSaasCashMovements(
  supabaseAdmin: SupabaseClient,
  options: ListSaasCashMovementsOptions = {},
): Promise<SaasCashMovement[]> {
  const scope = 'listSaasCashMovements';
  const queryStarted = performance.now();
  const fromDate = effectiveSaasCashFromDate(options.fromDate, options.cashStartAt);

  let query = supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.cashStartAt) {
    const startDay = options.cashStartAt.split('T')[0];
    if (startDay) {
      query = query.gte('movement_date', startDay);
    }
  }
  if (fromDate) {
    query = query.gte('movement_date', fromDate);
  }
  if (options.toDate) {
    query = query.lte('movement_date', options.toDate);
  }
  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  if (options.type && options.type !== 'all') {
    query = query.eq('type', options.type);
  }
  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Falha ao listar movimentações do caixa SaaS');
  }
  logMasterApiStep(scope, 'supabase.saas_cash_movements.select', queryStarted, data?.length ?? 0);

  let rows = (data || []) as Record<string, unknown>[];
  rows = filterMovementsByCashStartAt(
    rows.map((row) => ({
      ...row,
      movement_date: String(row.movement_date || '').split('T')[0],
      created_at: row.created_at ? String(row.created_at) : null,
    })),
    options.cashStartAt,
  ) as Record<string, unknown>[];

  if (rows.length === 0) return [];

  const companyIds = [
    ...new Set(
      rows
        .map((row) => (row.company_id ? String(row.company_id) : ''))
        .filter(Boolean),
    ),
  ];

  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name, fantasy_name')
      .in('id', companyIds);

    for (const company of companies || []) {
      const id = String((company as { id?: string }).id || '');
      const name =
        String((company as { fantasy_name?: string }).fantasy_name || '') ||
        String((company as { name?: string }).name || '');
      if (id) companyNames.set(id, name || '—');
    }
  }

  return rows.map((row) => {
    const movement = parseMovementRow(row);
    if (movement.company_id) {
      movement.company_name = companyNames.get(movement.company_id) || null;
    }
    return movement;
  });
}

export async function getSaasCashSummary(
  supabaseAdmin: SupabaseClient,
  options: Pick<ListSaasCashMovementsOptions, 'companyId' | 'fromDate' | 'toDate' | 'cashStartAt'> = {},
): Promise<SaasCashSummary> {
  const movements = await listSaasCashMovements(supabaseAdmin, {
    ...options,
    type: 'all',
  });
  return computeSaasCashSummaryFromRows(movements);
}

export async function loadSaasCashView(
  supabaseAdmin: SupabaseClient,
  options: ListSaasCashMovementsOptions,
  cashStartAt: string | null,
  backfillOptions?: { enabled?: boolean; createdBy?: string | null },
): Promise<{
  movements: SaasCashMovement[];
  summary: SaasCashSummary;
  cashStartAt: string | null;
  backfill?: BackfillSaasCashResult;
  hiddenByMarco: SaasCashHiddenByMarcoSummary;
}> {
  const scope = 'loadSaasCashView';
  let backfill: BackfillSaasCashResult | undefined;
  if (backfillOptions?.enabled !== false) {
    const backfillStarted = performance.now();
    try {
      backfill = await backfillSaasCashForPaidCharges(supabaseAdmin, {
        companyId: options.companyId,
        fromDate: options.fromDate,
        toDate: options.toDate,
        createdBy: backfillOptions?.createdBy ?? null,
        cashStartAt,
      });
      logMasterApiStep(scope, 'lib.backfillSaasCashForPaidCharges', backfillStarted, backfill.backfilled);
    } catch (err) {
      console.warn('[saas-cash-backfill] falha no backfill automático:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const queryOptions = { ...options, cashStartAt };
  const loadStarted = performance.now();
  const movements = await listSaasCashMovements(supabaseAdmin, queryOptions);
  const summary = computeSaasCashSummaryFromRows(movements);
  const hiddenByMarco = await computeSaasCashHiddenByMarcoInPeriod(
    supabaseAdmin,
    queryOptions,
  );
  logMasterApiStep(
    scope,
    'load_movements_and_summary',
    loadStarted,
    movements.length,
  );
  return { movements, summary, cashStartAt, backfill, hiddenByMarco };
}

async function findExistingByAsaasMovementId(
  supabaseAdmin: SupabaseClient,
  asaasMovementId: string,
): Promise<SaasCashMovement | null> {
  const { data } = await supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .contains('metadata', { asaas_movement_id: asaasMovementId })
    .maybeSingle();

  return data ? parseMovementRow(data as Record<string, unknown>) : null;
}

async function resolveCompanyIdFromAsaasPayment(
  supabaseAdmin: SupabaseClient,
  paymentId?: string | null,
): Promise<string | null> {
  const id = String(paymentId || '').trim();
  if (!id) return null;

  const { data } = await supabaseAdmin
    .from('saas_charges')
    .select('company_id')
    .eq('payment_id', id)
    .is('deleted_at', null)
    .maybeSingle();

  return data?.company_id ? String(data.company_id) : null;
}

async function insertMappedAsaasCashMovement(
  supabaseAdmin: SupabaseClient,
  mapped: MappedAsaasCashMovement,
  createdBy?: string | null,
): Promise<{ movement: SaasCashMovement | null; created: boolean }> {
  const movementId = String(mapped.metadata?.asaas_movement_id || '').trim();
  if (!movementId || mapped.skip || !mapped.type || !mapped.source || !mapped.amount) {
    return { movement: null, created: false };
  }

  const existing = await findExistingByAsaasMovementId(supabaseAdmin, movementId);
  if (existing) {
    return { movement: existing, created: false };
  }

  // Extrato não pode duplicar receita já criada por webhook/charge/manual.
  const paymentId = mapped.asaas_payment_id
    ? String(mapped.asaas_payment_id).trim()
    : '';
  if (mapped.type === 'income' && paymentId) {
    const { data: existingIncome } = await supabaseAdmin
      .from('saas_cash_movements')
      .select('*')
      .eq('asaas_payment_id', paymentId)
      .eq('type', 'income')
      .limit(1)
      .maybeSingle();
    if (existingIncome) {
      return {
        movement: parseMovementRow(existingIncome as Record<string, unknown>),
        created: false,
      };
    }
  }

  const companyId = await resolveCompanyIdFromAsaasPayment(
    supabaseAdmin,
    mapped.asaas_payment_id,
  );

  const insertRow = {
    company_id: companyId,
    saas_charge_id: null,
    asaas_payment_id: mapped.asaas_payment_id ?? null,
    type: mapped.type,
    category: mapped.category || 'Asaas',
    description: mapped.description || mapped.category || 'Movimentação Asaas',
    amount: mapped.amount,
    movement_date: normalizeMovementDate(mapped.movement_date),
    source: mapped.source,
    metadata: mapped.metadata || { asaas_movement_id: movementId },
    created_by: createdBy ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('saas_cash_movements')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const dup = await findExistingByAsaasMovementId(supabaseAdmin, movementId);
      if (dup) return { movement: dup, created: false };
    }
    console.warn('[saas-cash] falha ao registrar movimentação Asaas:', {
      movementId,
      message: error.message,
    });
    return { movement: null, created: false };
  }

  return {
    movement: parseMovementRow(data as Record<string, unknown>),
    created: true,
  };
}

/** Importa saques, tarifas, transferências e estornos do extrato Asaas (idempotente). */
export async function syncAsaasCashMovements(
  supabaseAdmin: SupabaseClient,
  input: SyncAsaasCashMovementsInput,
  deps: SyncAsaasCashMovementsDeps = {},
): Promise<SyncAsaasCashMovementsResult> {
  const fetchTransactions = deps.fetchTransactions ?? listAsaasFinancialTransactions;
  const mapTransaction = deps.mapTransaction ?? mapAsaasFinancialTransaction;

  if (!deps.fetchTransactions && !isAsaasConfigured()) {
    throw new Error('ASAAS_API_KEY não configurada.');
  }

  const effectiveFrom = effectiveSaasCashFromDate(input.fromDate, input.cashStartAt);
  const effectiveTo = input.toDate;
  const transactions = await fetchTransactions(
    effectiveFrom || input.fromDate,
    effectiveTo,
  );

  let created = 0;
  let incomeCreated = 0;
  let expenseCreated = 0;
  let transferCreated = 0;
  let skipped = 0;
  let skippedDuplicate = 0;
  let skippedBeforeStartAt = 0;
  let skippedWebhookIncome = 0;
  let unknown = 0;
  const unknownTypes = new Set<string>();
  const typeSamples = new Map<string, number>();

  for (const tx of transactions) {
    const asaasType = String(tx.type || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    typeSamples.set(asaasType, (typeSamples.get(asaasType) || 0) + 1);

    const movementDate = String(tx.date || '').split('T')[0];
    if (
      input.cashStartAt &&
      movementDate &&
      !isSaasFinancialRecordAfterStartAt({ movement_date: movementDate }, input.cashStartAt)
    ) {
      skipped += 1;
      skippedBeforeStartAt += 1;
      continue;
    }

    const mapped = mapTransaction(tx);
    if (mapped.skip) {
      skipped += 1;
      if (mapped.skipReason === 'webhook_income') {
        skippedWebhookIncome += 1;
      }
      if (mapped.skipReason === 'unknown_type') {
        unknown += 1;
        unknownTypes.add(asaasType);
        console.info('[saas-cash-sync] tipo Asaas ignorado:', {
          id: tx.id,
          type: asaasType,
          value: tx.value,
          description: tx.description,
        });
      }
      continue;
    }

    const result = await insertMappedAsaasCashMovement(
      supabaseAdmin,
      mapped,
      input.createdBy,
    );
    if (result.created) {
      created += 1;
      if (mapped.type === 'income') {
        incomeCreated += 1;
      } else if (mapped.type === 'expense') {
        expenseCreated += 1;
      } else if (mapped.type === 'transfer') {
        transferCreated += 1;
      }
    } else {
      skipped += 1;
      skippedDuplicate += 1;
    }
  }

  const sampleTypes = [...typeSamples.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([type, count]) => `${type}(${count})`);

  const diagnostics = {
    period: { fromDate: effectiveFrom || input.fromDate, toDate: effectiveTo },
    fetched: transactions.length,
    created,
    incomeCreated,
    expenseCreated,
    transferCreated,
    skipped,
    skippedDuplicate,
    skippedBeforeStartAt,
    skippedWebhookIncome,
    unknown,
    unknownTypes: [...unknownTypes].sort(),
    sampleTypes,
  };

  console.warn('[saas-cash-sync-result]', JSON.stringify(diagnostics));

  return {
    fetched: transactions.length,
    created,
    incomeCreated,
    expenseCreated,
    transferCreated,
    skipped,
    skippedDuplicate,
    skippedBeforeStartAt,
    skippedWebhookIncome,
    unknown,
    unknownTypes: [...unknownTypes].sort(),
    period: diagnostics.period,
    sampleTypes,
  };
}
