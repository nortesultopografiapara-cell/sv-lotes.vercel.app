/**
 * Fase 4 — execução atômica da Troca de lote.
 * Gera o HTML do novo contrato (somente leitura) e chama a RPC
 * execute_sale_lot_swap. Sem Asaas/Inter. Sem ReleaseLot.
 * Não altera o cadastro de vendedores do Mundo Novo nem o JSON do empreendimento.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextContractNumber, isValidStoredContractNumber } from '@/lib/contractNumber';
import {
  assessGeneratedContractViability,
  assertGeneratedContractViable,
} from '@/lib/contractGenerationGuard';
import {
  applyEffectiveContractModelToTenant,
  isRecantoPrimaveraContractModel,
  resolveSaleContractModelFromContext,
} from '@/lib/contractModel';
import { generateContractHTML } from '@/lib/contractTemplate';
import {
  enrichBlockForContract,
  loadFreshRegenerationEntities,
  loadSaleContractContext,
  type RegenerationSession,
} from '@/lib/contractRegeneration';
import { SALE_LOT_SWAP_TABLE } from '@/lib/finance/saleLotSwap';
import {
  assertContractNumberNotReused,
  buildLotSwapExecuteReceiptMutations,
  buildSyntheticContractReceipts,
  LOT_SWAP_EXECUTE_RPC,
  parseLotSwapExecuteRpcError,
  type LotSwapExecuteRpcPayload,
  type LotSwapExecuteRpcResult,
} from '@/lib/finance/saleLotSwapExecute';
import {
  assertLotSwapPlanPersistable,
  type LotSwapFinancialPlan,
} from '@/lib/finance/saleLotSwapPlan';
import { LotSwapPreviewError } from '@/lib/finance/saleLotSwapPreviewService';
import { embedRecantoContractSignatureInHtml } from '@/lib/recantoPrimaveraContractAssets';
import { assertCustomerValidForContract } from '@/lib/validateCustomerForContract';

export { LotSwapPreviewError };

export type LotSwapExecutedResult = {
  mutation: true;
  execute: true;
  persistCharges: false;
  reused: boolean;
  status: 'EXECUTED';
  swapId: string;
  saleId: string;
  fromBlockId: string;
  toBlockId: string;
  fromContractId: string | null;
  toContractId: string | null;
  toContractNumber: string | null;
  saleIdUnchanged: true;
  chargesUntouched: true;
};

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function planFromSnapshot(snapshot: Record<string, unknown> | null): LotSwapFinancialPlan | null {
  const plan = snapshot?.plan;
  if (!plan || typeof plan !== 'object') return null;
  return plan as LotSwapFinancialPlan;
}

async function buildLotSwapReplacementContractHtml(
  admin: SupabaseClient,
  input: {
    saleId: string;
    companyId: string;
    customerId: string | null;
    fromContractId: string | null;
    toBlockId: string;
    contractNumber: string;
    plan: LotSwapFinancialPlan;
    callerRole: string;
  },
): Promise<{
  html: string;
  contractNumber: string;
  contractModel: string | null;
  downPayment: number | null;
  snapshots: {
    project_name_snapshot: string | null;
    project_city_snapshot: string | null;
    project_uf_snapshot: string | null;
    forum_city_snapshot: string | null;
  };
  blockNumber: string | null;
  lotNumber: string | null;
}> {
  const session: RegenerationSession = {
    contractTenantId: input.companyId,
    activeTenantId: input.companyId,
    callerRole: input.callerRole || 'ADMIN',
  };

  let sourceContract: Record<string, unknown> = {
    sale_id: input.saleId,
    customer_id: input.customerId,
    block_id: input.toBlockId,
    tenant_id: input.companyId,
    company_id: input.companyId,
    contract_number: input.contractNumber,
  };
  if (input.fromContractId) {
    const loaded = await loadSaleContractContext(admin, input.fromContractId);
    sourceContract = {
      ...loaded,
      id: loaded.id,
      sale_id: input.saleId,
      customer_id: loaded.customer_id || input.customerId,
      block_id: input.toBlockId,
      contract_number: input.contractNumber,
    };
  }

  const fresh = await loadFreshRegenerationEntities(admin, sourceContract, session);
  const syntheticReceipts = buildSyntheticContractReceipts(input.plan);
  const receiptsSum = syntheticReceipts.reduce(
    (sum, row) => sum + money2(row.amount),
    0,
  );
  const saleWithNewUnit: Record<string, unknown> = {
    ...fresh.sale,
    id: input.saleId,
    block_id: input.toBlockId,
    lot_id: input.toBlockId,
    agreed_price: input.plan.financials.new_lot_price,
    lot_price: input.plan.financials.new_lot_price,
    total_value: input.plan.financials.new_lot_price,
    installments_count: input.plan.schedule.newInstallmentCount,
    receipts_sum: receiptsSum,
    finance_receipts: syntheticReceipts,
  };
  const destBlock = enrichBlockForContract({
    ...fresh.block,
    id: input.toBlockId,
  });
  const effectiveModel = resolveSaleContractModelFromContext({
    saleModel: saleWithNewUnit.contract_model,
    contractModel: sourceContract.contract_model,
    projectModel: fresh.project.contract_model,
    projectName: fresh.project.name,
    companyModel: fresh.company.contract_model,
  });
  const tenant = applyEffectiveContractModelToTenant(
    { ...fresh.company, id: input.companyId },
    effectiveModel.model,
  );
  const customer = {
    ...fresh.customer,
    id: fresh.customer.id || sourceContract.customer_id,
  };
  assertCustomerValidForContract(customer);

  const snapshots = {
    project_name_snapshot: text(fresh.project.name) || null,
    project_city_snapshot: text(fresh.project.city) || null,
    project_uf_snapshot: text(fresh.project.uf) || null,
    forum_city_snapshot:
      text(fresh.project.forum_city) || text(fresh.project.city) || null,
  };

  let html = generateContractHTML({
    tenant,
    customer,
    project: fresh.project,
    block: destBlock,
    sale: saleWithNewUnit,
    financeReceipts: syntheticReceipts,
    balloonAddons: [],
    contractSnapshot: {
      contract_number: input.contractNumber,
      ...snapshots,
    },
    projectBlocks: fresh.projectBlocks,
    streetGuides: fresh.streetGuides,
    manualConfrontants: null,
  });

  if (isRecantoPrimaveraContractModel(tenant)) {
    html = await embedRecantoContractSignatureInHtml(html, tenant);
  }

  const viability = assessGeneratedContractViability({
    html,
    sale: saleWithNewUnit,
    block: destBlock,
    receiptsSum,
  });
  if (!viability.ok) {
    console.error('[lot-swap execute] CONTRACT_HTML_FAILED', viability.reasons);
    assertGeneratedContractViable(viability);
  }

  return {
    html,
    contractNumber: input.contractNumber,
    contractModel: effectiveModel.model ? String(effectiveModel.model) : null,
    downPayment: money2(saleWithNewUnit.down_payment) || null,
    snapshots,
    blockNumber:
      text(destBlock.block_name) ||
      text(destBlock.block) ||
      text(destBlock.quadra) ||
      null,
    lotNumber:
      text(destBlock.number) ||
      text(destBlock.lot_number) ||
      text(destBlock.lot) ||
      null,
  };
}

export async function executeSaleLotSwap(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    swapId?: string | null;
    idempotencyKey?: string | null;
    callerRole?: string | null;
  },
): Promise<LotSwapExecutedResult> {
  const saleId = text(input.saleId);
  if (!saleId) {
    throw new LotSwapPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!text(input.userId)) {
    throw new LotSwapPreviewError(
      'Sessão ou autorização inválida.',
      'UNAUTHORIZED',
      401,
    );
  }

  let loaded = text(input.swapId)
    ? await admin
        .from(SALE_LOT_SWAP_TABLE)
        .select('*')
        .eq('id', text(input.swapId))
        .eq('sale_id', saleId)
        .maybeSingle()
    : await admin
        .from(SALE_LOT_SWAP_TABLE)
        .select('*')
        .eq('sale_id', saleId)
        .in('status', ['CALCULATED', 'EXECUTING'])
        .maybeSingle();
  if (!text(input.swapId) && !loaded.error && !loaded.data) {
    loaded = await admin
      .from(SALE_LOT_SWAP_TABLE)
      .select('*')
      .eq('sale_id', saleId)
      .eq('status', 'EXECUTED')
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (loaded.error) {
    console.error('[lot-swap execute] LOAD_SWAP_FAILED', loaded.error.message);
    throw new LotSwapPreviewError(
      'Não foi possível carregar o plano da troca.',
      'PLAN_LOAD_FAILED',
      500,
    );
  }
  const swap = loaded.data as Record<string, unknown> | null;
  if (!swap?.id) {
    throw new LotSwapPreviewError(
      'Confirme o plano CALCULATED antes de executar a troca.',
      'PLAN_NOT_CALCULATED',
      409,
    );
  }

  const status = text(swap.status);
  if (status === 'EXECUTED') {
    return {
      mutation: true,
      execute: true,
      persistCharges: false,
      reused: true,
      status: 'EXECUTED',
      swapId: String(swap.id),
      saleId,
      fromBlockId: String(swap.from_block_id || ''),
      toBlockId: String(swap.to_block_id || ''),
      fromContractId: swap.from_contract_id ? String(swap.from_contract_id) : null,
      toContractId: swap.to_contract_id ? String(swap.to_contract_id) : null,
      toContractNumber: null,
      saleIdUnchanged: true,
      chargesUntouched: true,
    };
  }
  if (status === 'EXECUTING') {
    throw new LotSwapPreviewError(
      'Já existe uma troca em execução para esta venda.',
      'EXECUTING_IN_PROGRESS',
      409,
    );
  }
  if (status === 'FAILED') {
    throw new LotSwapPreviewError(
      'Este plano falhou. Confirme um novo plano CALCULATED.',
      'SWAP_FAILED',
      409,
    );
  }
  if (status !== 'CALCULATED') {
    throw new LotSwapPreviewError(
      'Confirme o plano CALCULATED antes de executar a troca.',
      'NOT_CALCULATED',
      409,
    );
  }

  const snapshot =
    swap.financial_snapshot && typeof swap.financial_snapshot === 'object'
      ? (swap.financial_snapshot as Record<string, unknown>)
      : null;
  const plan = planFromSnapshot(snapshot);
  if (!plan) {
    throw new LotSwapPreviewError(
      'O plano financeiro congelado está incompleto.',
      'PLAN_BUILD_FAILED',
      409,
    );
  }
  try {
    assertLotSwapPlanPersistable(plan, text(swap.reason) || 'troca');
  } catch (err) {
    const code = err instanceof Error ? err.message : 'PLAN_BLOCKED';
    throw new LotSwapPreviewError(
      'O plano financeiro não pode ser executado.',
      code,
      409,
    );
  }

  const companyId = text(swap.company_id || swap.tenant_id);
  const fromContractId = swap.from_contract_id ? String(swap.from_contract_id) : null;
  let previousNumber: string | null = null;
  if (fromContractId) {
    const oldContract = await admin
      .from('contracts')
      .select('id, contract_number, generated_html, status')
      .eq('id', fromContractId)
      .maybeSingle();
    previousNumber = text(oldContract.data?.contract_number) || null;
  }

  const contractNumber = await getNextContractNumber(admin, companyId, companyId);
  assertContractNumberNotReused(previousNumber, contractNumber);
  if (!isValidStoredContractNumber(contractNumber)) {
    throw new LotSwapPreviewError(
      'Não foi possível numerar o novo contrato.',
      'CONTRACT_NUMBER_INVALID',
      500,
    );
  }

  let built: Awaited<ReturnType<typeof buildLotSwapReplacementContractHtml>>;
  try {
    built = await buildLotSwapReplacementContractHtml(admin, {
      saleId,
      companyId,
      customerId: swap.customer_id ? String(swap.customer_id) : null,
      fromContractId,
      toBlockId: String(swap.to_block_id),
      contractNumber,
      plan,
      callerRole: text(input.callerRole) || 'ADMIN',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lot-swap execute] CONTRACT_HTML_FAILED', msg);
    throw new LotSwapPreviewError(
      'Não foi possível gerar o novo contrato da unidade destino.',
      'CONTRACT_HTML_FAILED',
      500,
    );
  }

  const receipts = buildLotSwapExecuteReceiptMutations(plan);
  const payload: LotSwapExecuteRpcPayload = {
    swap_id: String(swap.id),
    company_id: companyId,
    operator_user_id: text(input.userId),
    idempotency_key:
      text(input.idempotencyKey) || text(swap.idempotency_key) || String(swap.id),
    cancel_receipt_ids: receipts.cancelIds,
    preserve_receipt_ids: receipts.preserveIds,
    new_receipts: receipts.create,
    new_contract: {
      generated_html: built.html,
      contract_number: built.contractNumber,
      contract_model: built.contractModel,
      down_payment: built.downPayment,
      installments: plan.schedule.newInstallmentCount,
      ...built.snapshots,
    },
    sale_patch: {
      agreed_price: plan.financials.new_lot_price,
      installments_count: plan.schedule.newInstallmentCount,
      block_number: built.blockNumber,
      lot_number: built.lotNumber,
    },
  };

  const rpc = await admin.rpc(LOT_SWAP_EXECUTE_RPC, { p_payload: payload });
  if (rpc.error) {
    const parsed = parseLotSwapExecuteRpcError(rpc.error.message);
    console.error('[lot-swap execute] RPC_FAILED', parsed.code, parsed.message);
    const status =
      parsed.code === 'TENANT_MISMATCH'
        ? 403
        : parsed.code === 'SWAP_NOT_FOUND'
          ? 404
          : 409;
    throw new LotSwapPreviewError(parsed.message, parsed.code, status);
  }

  const result = (rpc.data || {}) as LotSwapExecuteRpcResult;
  if (!result.ok || text(result.status) !== 'EXECUTED') {
    throw new LotSwapPreviewError(
      'A troca não foi concluída.',
      'LOT_SWAP_EXECUTE_FAILED',
      500,
    );
  }
  if (text(result.sale_id) !== saleId) {
    throw new LotSwapPreviewError(
      'A execução tentou alterar a identidade da venda.',
      'SALE_ID_CHANGED',
      500,
    );
  }

  return {
    mutation: true,
    execute: true,
    persistCharges: false,
    reused: Boolean(result.reused),
    status: 'EXECUTED',
    swapId: text(result.swap_id) || String(swap.id),
    saleId,
    fromBlockId: text(result.from_block_id) || String(swap.from_block_id),
    toBlockId: text(result.to_block_id) || String(swap.to_block_id),
    fromContractId: result.from_contract_id
      ? String(result.from_contract_id)
      : fromContractId,
    toContractId: result.to_contract_id ? String(result.to_contract_id) : null,
    toContractNumber: result.to_contract_number
      ? String(result.to_contract_number)
      : built.contractNumber,
    saleIdUnchanged: true,
    chargesUntouched: true,
  };
}
