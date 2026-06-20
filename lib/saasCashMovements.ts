/**
 * Caixa SaaS Master — movimentações automáticas e consultas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIsoDate } from '@/lib/companySubscriptionDates';
import type { SaasCharge } from '@/lib/saasCharges';
import {
  mapAsaasFinancialTransaction,
  type MappedAsaasCashMovement,
} from '@/lib/asaasFinancialTransactions';
import {
  isAsaasConfigured,
  listAsaasFinancialTransactions,
  type AsaasFinancialTransaction,
} from '@/lib/payments/providers/asaas';

export type SaasCashMovementType = 'income' | 'expense';

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
  netResult: number;
  movementCount: number;
};

export type ListSaasCashMovementsOptions = {
  companyId?: string;
  type?: SaasCashMovementType | 'all';
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export type CreateSaasCashIncomeInput = {
  charge: Pick<
    SaasCharge,
    'id' | 'company_id' | 'amount' | 'payment_id' | 'paid_at'
  >;
  paidAt?: string;
  createdBy?: string | null;
};

export type SyncAsaasCashMovementsInput = {
  fromDate: string;
  toDate: string;
  createdBy?: string | null;
};

export type SyncAsaasCashMovementsResult = {
  fetched: number;
  created: number;
  skipped: number;
  unknown: number;
  unknownTypes: string[];
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
  return String(type || '').toLowerCase() === 'expense' ? 'Saída' : 'Entrada';
}

export function computeSaasCashSummaryFromRows(
  movements: Pick<SaasCashMovement, 'type' | 'amount'>[],
): SaasCashSummary {
  let periodIncome = 0;
  let periodExpense = 0;

  for (const row of movements) {
    const amount = Number(row.amount || 0);
    if (row.type === 'expense') {
      periodExpense += amount;
    } else {
      periodIncome += amount;
    }
  }

  return {
    periodIncome,
    periodExpense,
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

export async function listSaasCashMovements(
  supabaseAdmin: SupabaseClient,
  options: ListSaasCashMovementsOptions = {},
): Promise<SaasCashMovement[]> {
  let query = supabaseAdmin
    .from('saas_cash_movements')
    .select('*')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  if (options.type && options.type !== 'all') {
    query = query.eq('type', options.type);
  }
  if (options.fromDate) {
    query = query.gte('movement_date', options.fromDate);
  }
  if (options.toDate) {
    query = query.lte('movement_date', options.toDate);
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

export async function getSaasCashSummary(
  supabaseAdmin: SupabaseClient,
  options: Pick<ListSaasCashMovementsOptions, 'companyId' | 'fromDate' | 'toDate'> = {},
): Promise<SaasCashSummary> {
  const movements = await listSaasCashMovements(supabaseAdmin, {
    ...options,
    type: 'all',
  });
  return computeSaasCashSummaryFromRows(movements);
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

  const transactions = await fetchTransactions(input.fromDate, input.toDate);
  let created = 0;
  let skipped = 0;
  let unknown = 0;
  const unknownTypes = new Set<string>();

  for (const tx of transactions) {
    const mapped = mapTransaction(tx);
    if (mapped.skip) {
      skipped += 1;
      if (mapped.skipReason === 'unknown_type') {
        unknown += 1;
        const type = String(mapped.metadata?.asaas_type || tx.type || 'UNKNOWN');
        unknownTypes.add(type);
        console.info('[saas-cash] tipo Asaas ignorado:', {
          id: tx.id,
          type,
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
    } else {
      skipped += 1;
    }
  }

  return {
    fetched: transactions.length,
    created,
    skipped,
    unknown,
    unknownTypes: [...unknownTypes].sort(),
  };
}
