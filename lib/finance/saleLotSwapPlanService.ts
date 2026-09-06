/**
 * Fase 3 — confirmação persistente do plano de Troca de lote (CALCULATED).
 * Grava SOMENTE sale_lot_swaps. Não altera sales, blocks, receipts, contratos
 * nem cobranças. Sem execução (Fase 4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALE_LOT_SWAP_TABLE } from '@/lib/finance/saleLotSwap';
import {
  assertLotSwapPlanPersistable,
  buildLotSwapPlanIdempotencyKey,
  LOT_SWAP_PLAN_STATUS,
  LOT_SWAP_REASON_REQUIRED,
  validateLotSwapReason,
  type LotSwapFinancialPlan,
} from '@/lib/finance/saleLotSwapPlan';
import {
  loadSaleLotSwapPreview,
  LotSwapPreviewError,
} from '@/lib/finance/saleLotSwapPreviewService';

export { LotSwapPreviewError };

const FORBIDDEN_MUTATION_TABLES = [
  'sales',
  'blocks',
  'finance_receipts',
  'contracts',
  'company_asaas_charges',
  'bank_charges',
  'sale_balloon_installments',
  'cash_movements',
] as const;

export type LotSwapPreparedPlan = {
  mutation: false;
  execute: false;
  persistSwap: true;
  status: typeof LOT_SWAP_PLAN_STATUS;
  swapId: string;
  reused: boolean;
  saleId: string;
  fromBlockId: string;
  toBlockId: string;
  reason: string;
  reasonDetail: string | null;
  idempotencyKey: string;
  plan: LotSwapFinancialPlan;
  currentSaleUnchanged: true;
  lotsUnchanged: true;
  receiptsUnchanged: true;
  contractsUnchanged: true;
  chargesUnchanged: true;
};

function text(v: unknown): string {
  return String(v ?? '').trim();
}

export async function prepareSaleLotSwapPlan(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    toBlockId?: string | null;
    reason?: string | null;
    reasonDetail?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<LotSwapPreparedPlan> {
  const saleId = text(input.saleId);
  const toBlockId = text(input.toBlockId);
  if (!toBlockId) {
    throw new LotSwapPreviewError(
      'Selecione o lote destino para confirmar o plano.',
      'DESTINATION_REQUIRED',
      400,
    );
  }
  const motive = validateLotSwapReason(input.reason);
  if (!motive.ok) {
    throw new LotSwapPreviewError(
      motive.error || 'Informe o motivo da troca de lote.',
      LOT_SWAP_REASON_REQUIRED,
      400,
    );
  }

  const preview = await loadSaleLotSwapPreview(admin, {
    saleId,
    userId: input.userId,
    toBlockId,
  });
  const comparison = preview.comparison;
  if (!comparison?.plan) {
    throw new LotSwapPreviewError(
      'Não foi possível montar o plano financeiro da troca.',
      'PLAN_BUILD_FAILED',
      500,
    );
  }
  try {
    assertLotSwapPlanPersistable(comparison.plan, motive.reason);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'PLAN_BLOCKED';
    throw new LotSwapPreviewError(
      comparison.blockMessage || 'O plano financeiro não pode ser confirmado.',
      code,
      409,
    );
  }

  const companyId = preview.current.companyId;
  const fromProjectId = text(preview.current.projectId);
  const toProjectId = text(comparison.destination.projectId);
  if (!fromProjectId || !toProjectId) {
    throw new LotSwapPreviewError(
      'O plano exige o empreendimento de origem e de destino.',
      'PROJECT_REQUIRED',
      409,
    );
  }
  const idempotencyKey =
    text(input.idempotencyKey) || buildLotSwapPlanIdempotencyKey(saleId, toBlockId);
  const reasonDetail = text(input.reasonDetail) || null;
  const now = new Date().toISOString();
  const snapshot = {
    plan: comparison.plan,
    current: preview.current,
    destination: comparison.destination,
    schedule: comparison.schedule,
    reason: motive.reason,
    reasonDetail,
    confirmedAt: now,
    execute: false,
    phase: 3,
  };

  const row = {
    company_id: companyId,
    tenant_id: companyId,
    sale_id: saleId,
    customer_id: preview.current.customerId,
    from_project_id: fromProjectId,
    from_block_id: preview.current.origin.id,
    to_project_id: toProjectId,
    to_block_id: comparison.destination.id,
    from_contract_id: preview.current.contractId,
    to_contract_id: null,
    old_sale_price: comparison.plan.financials.old_sale_price,
    new_lot_price: comparison.plan.financials.new_lot_price,
    total_paid: comparison.plan.financials.total_paid,
    transferable_credit: comparison.plan.financials.transferable_credit,
    old_balance: comparison.plan.financials.old_balance,
    price_difference: comparison.plan.financials.price_difference,
    new_balance: comparison.plan.financials.new_balance,
    financial_snapshot: snapshot,
    reason: motive.reason,
    reason_detail: reasonDetail,
    status: LOT_SWAP_PLAN_STATUS,
    operator_user_id: input.userId,
    executed_at: null,
    idempotency_key: idempotencyKey,
    document_number: null,
    document_id: null,
    document_status: null,
    updated_at: now,
  };

  const existing = await admin
    .from(SALE_LOT_SWAP_TABLE)
    .select('id, status')
    .eq('sale_id', saleId)
    .in('status', ['CALCULATED', 'EXECUTING'])
    .maybeSingle();
  if (existing.error) {
    console.error('[lot-swap plan] LOAD_INFLIGHT_FAILED', existing.error.message);
    throw new LotSwapPreviewError(
      'Não foi possível verificar um plano já confirmado.',
      'PLAN_LOAD_FAILED',
      500,
    );
  }
  const inflight = existing.data as { id?: string; status?: string } | null;
  if (inflight?.status === 'EXECUTING') {
    throw new LotSwapPreviewError(
      'Já existe uma troca em execução para esta venda.',
      'PLAN_IN_FLIGHT',
      409,
    );
  }

  let swapId = '';
  let reused = false;
  if (inflight?.id && inflight.status === 'CALCULATED') {
    const updated = await admin
      .from(SALE_LOT_SWAP_TABLE)
      .update(row)
      .eq('id', inflight.id)
      .eq('sale_id', saleId)
      .eq('status', LOT_SWAP_PLAN_STATUS)
      .select('id')
      .maybeSingle();
    if (updated.error || !updated.data?.id) {
      console.error(
        '[lot-swap plan] UPDATE_FAILED',
        updated.error?.message || 'empty id',
      );
      throw new LotSwapPreviewError(
        'Não foi possível atualizar o plano da troca.',
        'PLAN_UPDATE_FAILED',
        500,
      );
    }
    swapId = String(updated.data.id);
    reused = true;
  } else {
    const inserted = await admin
      .from(SALE_LOT_SWAP_TABLE)
      .insert({ ...row, created_at: now })
      .select('id')
      .maybeSingle();
    if (inserted.error || !inserted.data?.id) {
      console.error(
        '[lot-swap plan] INSERT_FAILED',
        inserted.error?.message || 'empty id',
      );
      throw new LotSwapPreviewError(
        'Não foi possível gravar o plano da troca.',
        'PLAN_INSERT_FAILED',
        500,
      );
    }
    swapId = String(inserted.data.id);
  }

  return {
    mutation: false,
    execute: false,
    persistSwap: true,
    status: LOT_SWAP_PLAN_STATUS,
    swapId,
    reused,
    saleId,
    fromBlockId: preview.current.origin.id,
    toBlockId: comparison.destination.id,
    reason: motive.reason,
    reasonDetail,
    idempotencyKey,
    plan: comparison.plan,
    currentSaleUnchanged: true,
    lotsUnchanged: true,
    receiptsUnchanged: true,
    contractsUnchanged: true,
    chargesUnchanged: true,
  };
}

/** Documentação para testes: tabelas que este serviço NÃO pode alterar. */
export const LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES = FORBIDDEN_MUTATION_TABLES;
