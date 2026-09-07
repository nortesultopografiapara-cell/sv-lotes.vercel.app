/**
 * Preview P2 — Transferência de titularidade (somente leitura).
 * Sem mutação. Sem RPC. Sem sale_lot_swaps. Sem /release.
 */

import { isCanceledFinanceReceipt } from '@/lib/finance/saleChargesShared';
import {
  assertLotSwapCallerOwnsCompany,
  LOT_SWAP_CROSS_TENANT,
} from '@/lib/finance/saleLotSwapPreview';
import { isPaidFinanceReceiptStatus } from '@/lib/finance/releaseLotShared';
import {
  TITLE_TRANSFER_AGIO_INVALID,
  TITLE_TRANSFER_CONTRACT_CHANGED,
  TITLE_TRANSFER_CUSTOMER_CROSS_TENANT,
  TITLE_TRANSFER_CUSTOMER_NOT_FOUND,
  TITLE_TRANSFER_CUSTOMER_REQUIRED,
  TITLE_TRANSFER_DATE_INVALID,
  TITLE_TRANSFER_SALE_NOT_ACTIVE,
  TITLE_TRANSFER_SAME_TITULAR,
} from '@/lib/finance/saleTitleTransferPlan';
import { TITLE_TRANSFER_LOT_REQUIRED_STATUS } from '@/lib/finance/saleTitleTransfer';

export const TITLE_TRANSFER_CROSS_TENANT = LOT_SWAP_CROSS_TENANT;
export const TITLE_TRANSFER_SALE_NOT_FOUND = 'SALE_NOT_FOUND';
export const TITLE_TRANSFER_LOT_NOT_SOLD = 'TITLE_TRANSFER_LOT_NOT_SOLD';
export const TITLE_TRANSFER_ORIGIN_MISMATCH = 'TITLE_TRANSFER_ORIGIN_MISMATCH';

export const TITLE_TRANSFER_PREVIEW_NOTICE =
  'Somente leitura. O lote permanece Vendido. Nenhuma transferência, parcela, contrato ou cobrança bancária será alterada agora.';

export const TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE =
  'Titular original — nenhuma transferência anterior nesta venda.';

export type TitleTransferReceiptLike = {
  id?: string | null;
  status?: string | null;
  amount?: number | string | null;
  paid_at?: string | null;
  due_date?: string | null;
};

export type TitleTransferFinanceKpis = {
  activeCount: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  futureCount: number;
  canceledCount: number;
  totalPaid: number;
  pendingAmount: number;
  remainingBalance: number;
};

export type TitleTransferHistoryEntry = {
  id: string;
  fromCustomerId: string;
  toCustomerId: string;
  fromCustomerName: string | null;
  toCustomerName: string | null;
  fromContractId: string | null;
  toContractId: string | null;
  transferDate: string | null;
  declaredAgioAmount: number;
  previousTransferId: string | null;
  executedAt: string | null;
};

export function assertTitleTransferCallerOwnsCompany(input: {
  callerTenantId?: string | null;
  resourceCompanyId?: string | null;
  callerRole?: string | null;
}): { ok: true; code: null } | { ok: false; code: typeof TITLE_TRANSFER_CROSS_TENANT } {
  return assertLotSwapCallerOwnsCompany(input);
}

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function dueDateIso(row: TitleTransferReceiptLike): string | null {
  const raw = String(row.due_date || '').trim();
  return raw ? raw.slice(0, 10) : null;
}

export function isTitleTransferPaidReceipt(row: TitleTransferReceiptLike): boolean {
  return isPaidFinanceReceiptStatus(row);
}

export function isTitleTransferCanceledReceipt(row: TitleTransferReceiptLike): boolean {
  return isCanceledFinanceReceipt(row);
}

export function isTitleTransferOverdueReceipt(
  row: TitleTransferReceiptLike,
  todayIso: string,
): boolean {
  if (isTitleTransferPaidReceipt(row) || isTitleTransferCanceledReceipt(row)) return false;
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  if (st === 'atrasado' || st === 'overdue' || st === 'vencido') return true;
  const due = dueDateIso(row);
  const today = String(todayIso || '').slice(0, 10);
  return Boolean(due && today && due < today);
}

export function summarizeTitleTransferFinance(input: {
  receipts: TitleTransferReceiptLike[];
  salePrice: number;
  todayIso: string;
}): TitleTransferFinanceKpis {
  const today = String(input.todayIso || '').slice(0, 10);
  let paidCount = 0;
  let overdueCount = 0;
  let futureCount = 0;
  let canceledCount = 0;
  let totalPaid = 0;
  let pendingAmount = 0;

  for (const row of input.receipts || []) {
    const amount = money2(row.amount);
    if (isTitleTransferCanceledReceipt(row)) {
      canceledCount += 1;
      continue;
    }
    if (isTitleTransferPaidReceipt(row)) {
      paidCount += 1;
      totalPaid = money2(totalPaid + amount);
      continue;
    }
    pendingAmount = money2(pendingAmount + amount);
    if (isTitleTransferOverdueReceipt(row, today)) {
      overdueCount += 1;
    } else {
      futureCount += 1;
    }
  }

  const pendingCount = overdueCount + futureCount;
  const activeCount = paidCount + pendingCount;
  const salePrice = money2(input.salePrice);
  return {
    activeCount,
    paidCount,
    pendingCount,
    overdueCount,
    futureCount,
    canceledCount,
    totalPaid,
    pendingAmount,
    remainingBalance: money2(salePrice - totalPaid),
  };
}

export function buildTitleTransferHistoryChain(
  rows: TitleTransferHistoryEntry[],
): TitleTransferHistoryEntry[] {
  return [...(rows || [])].sort((a, b) => {
    const left = String(a.executedAt || a.transferDate || '');
    const right = String(b.executedAt || b.transferDate || '');
    if (left === right) return String(a.id).localeCompare(String(b.id));
    return left.localeCompare(right);
  });
}

export function titleTransferHistoryNotice(chain: TitleTransferHistoryEntry[]): string {
  if (!chain.length) return TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE;
  if (chain.length === 1) {
    return `1 transferência anterior nesta venda.`;
  }
  return `${chain.length} transferências anteriores nesta venda.`;
}

export function assertTitleTransferLotUnchanged(input: {
  saleId: string;
  saleBlockId?: string | null;
  blockId?: string | null;
  blockSaleId?: string | null;
  blockStatus?: string | null;
}): { ok: true; code: null } | { ok: false; code: string } {
  const saleId = String(input.saleId || '').trim();
  const saleBlockId = String(input.saleBlockId || '').trim();
  const blockId = String(input.blockId || '').trim();
  const blockSaleId = String(input.blockSaleId || '').trim();
  if (!saleId || !blockId) {
    return { ok: false, code: TITLE_TRANSFER_ORIGIN_MISMATCH };
  }
  if (saleBlockId && saleBlockId !== blockId) {
    return { ok: false, code: TITLE_TRANSFER_ORIGIN_MISMATCH };
  }
  if (blockSaleId && blockSaleId !== saleId) {
    return { ok: false, code: TITLE_TRANSFER_ORIGIN_MISMATCH };
  }
  if (String(input.blockStatus || '').trim() !== TITLE_TRANSFER_LOT_REQUIRED_STATUS) {
    return { ok: false, code: TITLE_TRANSFER_LOT_NOT_SOLD };
  }
  return { ok: true, code: null };
}

export function mapTitleTransferPreviewUserMessage(input: {
  status?: number;
  code?: string | null;
  message?: string | null;
  error?: string | null;
}): string {
  const code = String(input.code || '').trim();
  const fromServer = String(input.message || input.error || '').trim();
  if (code === TITLE_TRANSFER_CROSS_TENANT || input.status === 403) {
    return fromServer || 'A venda não pertence à empresa atual.';
  }
  if (code === TITLE_TRANSFER_SALE_NOT_FOUND || input.status === 404) {
    return fromServer || 'Venda não encontrada.';
  }
  if (code === TITLE_TRANSFER_LOT_NOT_SOLD) {
    return 'O lote precisa permanecer Vendido para transferir a titularidade.';
  }
  if (code === TITLE_TRANSFER_ORIGIN_MISMATCH) {
    return 'O lote desta venda não confere. Recarregue o mapa.';
  }
  if (code === TITLE_TRANSFER_SAME_TITULAR) {
    return 'O novo titular não pode ser o titular atual.';
  }
  if (code === TITLE_TRANSFER_CUSTOMER_NOT_FOUND) {
    return 'Cliente não encontrado nesta empresa.';
  }
  if (code === TITLE_TRANSFER_CUSTOMER_CROSS_TENANT) {
    return 'O cliente pertence a outra empresa.';
  }
  if (code === TITLE_TRANSFER_CONTRACT_CHANGED) {
    return 'O contrato vigente mudou desde a prévia. Recarregue a tela.';
  }
  if (code === TITLE_TRANSFER_SALE_NOT_ACTIVE) {
    return 'A venda precisa estar ativa para transferir a titularidade.';
  }
  if (code === TITLE_TRANSFER_CUSTOMER_REQUIRED) {
    return 'Selecione exatamente um cliente existente.';
  }
  if (code === TITLE_TRANSFER_AGIO_INVALID) {
    return 'Informe um valor de ágio válido em reais, ou deixe em branco.';
  }
  if (code === TITLE_TRANSFER_DATE_INVALID) {
    return 'Informe uma data de transferência válida.';
  }
  if (code === 'TITLE_TRANSFER_CONFIRM_REQUIRED') {
    return 'Confirme a transferência antes de executar.';
  }
  if (code === 'TITLE_TRANSFER_TITULAR_CHANGED') {
    return 'O titular da venda mudou desde a prévia. Recarregue a tela.';
  }
  if (code === 'TITLE_TRANSFER_CHARGES_NON_CANCELABLE') {
    return 'Há cobrança bancária incompatível. A transferência local não foi executada.';
  }
  if (code === 'TITLE_TRANSFER_CHARGES_LIVE_DISABLED') {
    return 'O cancelamento bancário desta transferência não está autorizado neste ambiente.';
  }
  if (code === 'TITLE_TRANSFER_CHARGES_CANCEL_FAILED') {
    return 'Falha ao cancelar cobrança bancária do titular anterior. A transferência local não foi executada.';
  }
  if (code === 'UNAUTHORIZED' || code === 'NO_PROFILE' || input.status === 401) {
    return 'Sessão ou autorização inválida.';
  }
  return fromServer || 'Não foi possível carregar a prévia da transferência.';
}
