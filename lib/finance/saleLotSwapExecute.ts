/**
 * Fase 4 — execução da Troca de lote (puro).
 * Mutação crítica ocorre só na RPC Postgres execute_sale_lot_swap.
 * Sem Asaas/Inter. Sem ReleaseLot. Sem termo TL-… .
 */

import { isValidStoredContractNumber } from '@/lib/contractNumber';
import {
  LOT_SWAP_DESTINATION_AFTER_EXECUTE_STATUS,
  LOT_SWAP_SOURCE_AFTER_EXECUTE_STATUS,
  SALE_LOT_SWAP_OPERATION_CODE,
} from '@/lib/finance/saleLotSwap';
import type { LotSwapFinancialPlan } from '@/lib/finance/saleLotSwapPlan';

export const LOT_SWAP_EXECUTE_RPC = 'execute_sale_lot_swap';
export const LOT_SWAP_EXECUTE_STATUS = 'EXECUTED' as const;
export const LOT_SWAP_EXECUTING_STATUS = 'EXECUTING' as const;
export const LOT_SWAP_FAILED_STATUS = 'FAILED' as const;

export const LOT_SWAP_EXECUTE_NOTICE =
  'A execução é atômica: a mesma venda permanece, o lote origem volta para Disponível, o destino passa a Vendido e um novo contrato vigente é criado. Cobranças Asaas/Inter não são alteradas nesta fase.';

export type LotSwapExecuteStatusEvent =
  | 'start'
  | 'succeed'
  | 'fail';

export type LotSwapExecuteRpcPayload = {
  swap_id: string;
  company_id: string;
  operator_user_id: string;
  idempotency_key: string;
  cancel_receipt_ids: string[];
  preserve_receipt_ids: string[];
  new_receipts: Array<{
    installment_number: number;
    amount: number;
    due_date: string | null;
    financial_account_id: string | null;
  }>;
  new_contract: {
    generated_html: string;
    contract_number: string;
    contract_model: string | null;
    down_payment: number | null;
    installments: number;
    project_name_snapshot: string | null;
    project_city_snapshot: string | null;
    project_uf_snapshot: string | null;
    forum_city_snapshot: string | null;
  };
  sale_patch: {
    agreed_price: number;
    installments_count: number;
    block_number: string | null;
    lot_number: string | null;
  };
};

export type LotSwapExecuteRpcResult = {
  ok: boolean;
  reused: boolean;
  status: string;
  swap_id: string;
  sale_id: string;
  from_block_id: string;
  to_block_id: string;
  from_contract_id: string | null;
  to_contract_id: string | null;
  to_contract_number?: string | null;
  sale_id_unchanged: boolean;
  charges_untouched: boolean;
};

export function nextLotSwapExecuteStatus(
  current: string,
  event: LotSwapExecuteStatusEvent,
): 'CALCULATED' | 'EXECUTING' | 'EXECUTED' | 'FAILED' {
  if (current === 'EXECUTED' && event === 'succeed') return 'EXECUTED';
  if (current === 'CALCULATED' && event === 'start') return 'EXECUTING';
  if (current === 'EXECUTING' && event === 'succeed') return 'EXECUTED';
  if ((current === 'CALCULATED' || current === 'EXECUTING') && event === 'fail') {
    return 'FAILED';
  }
  throw new Error(`LOT_SWAP_EXECUTE_INVALID_TRANSITION:${current}:${event}`);
}

export function assertContractNumberNotReused(
  previousNumber: string | null | undefined,
  nextNumber: string,
): void {
  if (!isValidStoredContractNumber(nextNumber)) {
    throw new Error('CONTRACT_NUMBER_INVALID');
  }
  const prev = String(previousNumber || '').trim();
  if (prev && prev === String(nextNumber).trim()) {
    throw new Error('CONTRACT_NUMBER_REUSED');
  }
}

export function buildLotSwapExecuteReceiptMutations(plan: LotSwapFinancialPlan): {
  cancelIds: string[];
  preserveIds: string[];
  create: LotSwapExecuteRpcPayload['new_receipts'];
} {
  return {
    cancelIds: plan.receipts.cancel
      .map((item) => String(item.receiptId || '').trim())
      .filter(Boolean),
    preserveIds: plan.receipts.preserve
      .map((item) => String(item.receiptId || '').trim())
      .filter(Boolean),
    create: plan.receipts.create.map((item) => ({
      installment_number: item.installmentNumber,
      amount: item.amount,
      due_date: item.dueDate,
      financial_account_id: plan.schedule.financialAccountId,
    })),
  };
}

export function buildSyntheticContractReceipts(plan: LotSwapFinancialPlan): Array<{
  installment_number: number;
  amount: number;
  due_date: string | null;
  status: string;
}> {
  return [
    ...plan.receipts.preserve.map((item) => ({
      installment_number: item.installmentNumber,
      amount: item.amount,
      due_date: item.dueDate,
      status: 'pago',
    })),
    ...plan.receipts.create.map((item) => ({
      installment_number: item.installmentNumber,
      amount: item.amount,
      due_date: item.dueDate,
      status: 'pendente',
    })),
  ];
}

export function parseLotSwapExecuteRpcError(message?: string | null): {
  code: string;
  message: string;
} {
  const raw = String(message || '').trim();
  const match = raw.match(/LOT_SWAP_EXECUTE:([A-Z0-9_]+):(.+)$/);
  if (!match) {
    return {
      code: 'LOT_SWAP_EXECUTE_FAILED',
      message: raw || 'Não foi possível executar a troca de lote.',
    };
  }
  return { code: match[1], message: match[2].trim() };
}

export function lotSwapExecutePreservesNegotiation(input: {
  saleIdBefore: string;
  saleIdAfter: string;
  sourceStatus: string;
  destinationStatus: string;
}): boolean {
  return (
    String(input.saleIdBefore) === String(input.saleIdAfter) &&
    input.sourceStatus === LOT_SWAP_SOURCE_AFTER_EXECUTE_STATUS &&
    input.destinationStatus === LOT_SWAP_DESTINATION_AFTER_EXECUTE_STATUS
  );
}

export function isLotSwapExecuteOperation(code?: string | null): boolean {
  return String(code || '').trim() === SALE_LOT_SWAP_OPERATION_CODE;
}
