/**
 * Fase 3 — planejamento financeiro da Troca de lote.
 * Puro: sem I/O. Não muta sales, blocks, receipts, contratos ou cobranças.
 * Persistência CALCULATED fica no serviço; execução (Fase 4) não existe aqui.
 */

import {
  classifyAsaasChargeForRelease,
  classifyInterBankChargeForRelease,
} from '@/lib/finance/releaseLotShared';
import {
  assertSaleLotSwapFinancialsPersistable,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  type SaleLotSwapFinancialDerivation,
  type SaleLotSwapFinancialFields,
} from '@/lib/finance/saleLotSwap';
import {
  deriveLotSwapPreviewFinancials,
  isLotSwapCanceledReceipt,
  isLotSwapFutureReceipt,
  isLotSwapPaidReceipt,
  type LotSwapBalloonLike,
  type LotSwapReceiptLike,
} from '@/lib/finance/saleLotSwapPreview';

export const LOT_SWAP_REASON_MIN_LENGTH = 3;
export const LOT_SWAP_REASON_REQUIRED = 'LOT_SWAP_REASON_REQUIRED';
export const LOT_SWAP_PLAN_STATUS = 'CALCULATED' as const;
export const LOT_SWAP_PLAN_NOTICE =
  'Este plano será congelado como CALCULATED. Nenhum lote, parcela, contrato ou cobrança será alterado agora. A execução fica para a Fase 4.';

export type LotSwapReceiptPlanAction = 'PRESERVE' | 'CANCEL' | 'CREATE' | 'IGNORE';
export type LotSwapChargePlanAction =
  | 'PRESERVE'
  | 'DEFER_CANCEL_PHASE_5'
  | 'REVIEW_PHASE_5'
  | 'IGNORE';

export type LotSwapReceiptPlanItem = {
  action: LotSwapReceiptPlanAction;
  receiptId: string | null;
  installmentNumber: number;
  amount: number;
  dueDate: string | null;
  status: string | null;
};

export type LotSwapChargePlanItem = {
  provider: 'ASAAS' | 'INTER';
  chargeId: string;
  receiptId: string | null;
  status: string | null;
  action: LotSwapChargePlanAction;
};

export type LotSwapBalloonPlanItem = {
  action: 'KEEP_SNAPSHOT';
  installmentNumber: number;
  additionalAmount: number;
  dueDate: string | null;
};

export type LotSwapFinancialPlan = {
  mutation: false;
  execute: false;
  persistCharges: false;
  persistReceipts: false;
  persistLots: false;
  persistSale: false;
  persistContract: false;
  status: typeof LOT_SWAP_PLAN_STATUS;
  financials: SaleLotSwapFinancialFields;
  blocked: boolean;
  blockCode: string | null;
  receipts: {
    preserve: LotSwapReceiptPlanItem[];
    cancel: LotSwapReceiptPlanItem[];
    create: LotSwapReceiptPlanItem[];
    ignoredCanceled: number;
  };
  balloons: LotSwapBalloonPlanItem[];
  charges: {
    asaasOpen: LotSwapChargePlanItem[];
    asaasPaid: LotSwapChargePlanItem[];
    asaasOther: LotSwapChargePlanItem[];
    interOpen: LotSwapChargePlanItem[];
    interPaid: LotSwapChargePlanItem[];
    interOther: LotSwapChargePlanItem[];
  };
  schedule: {
    correctionType: string | null;
    correctionLabel: string | null;
    financialAccountId: string | null;
    financialAccountName: string | null;
    firstFutureDueDate: string | null;
    newInstallmentCount: number;
  };
  notice: string;
};

export type LotSwapChargeLike = {
  id?: string | null;
  installment_id?: string | null;
  finance_receipt_id?: string | null;
  status?: string | null;
};

function money2(n: number | string | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function installmentNumberOf(row: LotSwapReceiptLike): number {
  const n = Number(row.installment_number);
  return Number.isFinite(n) ? n : 0;
}

function receiptAmount(row: LotSwapReceiptLike): number {
  const paid = Number(
    (row as { paid_amount?: number | string | null }).paid_amount,
  );
  if (Number.isFinite(paid) && paid > 0) return money2(paid);
  return money2(row.amount);
}

function addDaysIso(asOf: string, days: number): string {
  const raw = String(asOf || '').trim().slice(0, 10);
  const base = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '2026-01-01';
  const [y, m, d] = base.split('-').map((part) => Number(part));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function validateLotSwapReason(reason?: string | null): {
  ok: boolean;
  reason: string;
  code: string | null;
  error: string | null;
} {
  const text = String(reason || '').trim();
  if (text.length < LOT_SWAP_REASON_MIN_LENGTH) {
    return {
      ok: false,
      reason: text,
      code: LOT_SWAP_REASON_REQUIRED,
      error: 'Informe o motivo da troca de lote.',
    };
  }
  return { ok: true, reason: text, code: null, error: null };
}

export function snapshotLotSwapReceipt(row: LotSwapReceiptLike): LotSwapReceiptPlanItem {
  const paid = isLotSwapPaidReceipt(row);
  const canceled = isLotSwapCanceledReceipt(row);
  const future = isLotSwapFutureReceipt(row);
  return {
    action: paid ? 'PRESERVE' : canceled ? 'IGNORE' : future ? 'CANCEL' : 'IGNORE',
    receiptId: row.id ? String(row.id) : null,
    installmentNumber: installmentNumberOf(row),
    amount: receiptAmount(row),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    status: row.status ? String(row.status) : null,
  };
}

export function planLotSwapNewReceipts(input: {
  newBalance: number;
  blocked?: boolean;
  futureReceipts: LotSwapReceiptLike[];
  maxInstallmentNumber: number;
  asOf?: string | null;
}): LotSwapReceiptPlanItem[] {
  if (input.blocked) return [];
  const newBalance = money2(input.newBalance);
  if (newBalance <= 0) return [];
  const future = [...input.futureReceipts]
    .filter(isLotSwapFutureReceipt)
    .sort((a, b) => installmentNumberOf(a) - installmentNumberOf(b));
  const count = Math.max(1, future.length);
  const base = money2(Math.floor((newBalance / count) * 100) / 100);
  const items: LotSwapReceiptPlanItem[] = [];
  let allocated = 0;
  const start = Math.max(0, Math.floor(Number(input.maxInstallmentNumber) || 0)) + 1;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast ? money2(newBalance - allocated) : base;
    allocated = money2(allocated + amount);
    const dueDate = future[i]?.due_date
      ? String(future[i].due_date).slice(0, 10)
      : addDaysIso(input.asOf || '2026-01-01', 30);
    items.push({
      action: 'CREATE',
      receiptId: null,
      installmentNumber: start + i,
      amount,
      dueDate,
      status: 'pendente',
    });
  }
  return items;
}

function mapAsaasCharge(row: LotSwapChargeLike): LotSwapChargePlanItem {
  const bucket = classifyAsaasChargeForRelease(row.status);
  const action: LotSwapChargePlanAction =
    bucket === 'paid'
      ? 'PRESERVE'
      : bucket === 'open'
        ? 'DEFER_CANCEL_PHASE_5'
        : bucket === 'cancelled' || bucket === 'refunded'
          ? 'IGNORE'
          : 'REVIEW_PHASE_5';
  return {
    provider: 'ASAAS',
    chargeId: String(row.id || ''),
    receiptId: row.installment_id ? String(row.installment_id) : null,
    status: row.status ? String(row.status) : null,
    action,
  };
}

function mapInterCharge(row: LotSwapChargeLike): LotSwapChargePlanItem {
  const bucket = classifyInterBankChargeForRelease(row.status);
  const action: LotSwapChargePlanAction =
    bucket === 'paid'
      ? 'PRESERVE'
      : bucket === 'open'
        ? 'DEFER_CANCEL_PHASE_5'
        : bucket === 'cancelled' || bucket === 'refunded'
          ? 'IGNORE'
          : 'REVIEW_PHASE_5';
  return {
    provider: 'INTER',
    chargeId: String(row.id || ''),
    receiptId: row.finance_receipt_id
      ? String(row.finance_receipt_id)
      : row.installment_id
        ? String(row.installment_id)
        : null,
    status: row.status ? String(row.status) : null,
    action,
  };
}

export function buildLotSwapFinancialPlan(input: {
  oldSalePrice: number;
  newLotPrice: number;
  receipts: LotSwapReceiptLike[];
  balloons?: LotSwapBalloonLike[];
  asaasCharges?: LotSwapChargeLike[];
  interCharges?: LotSwapChargeLike[];
  correctionType?: string | null;
  correctionLabel?: string | null;
  financialAccountId?: string | null;
  financialAccountName?: string | null;
  asOf?: string | null;
}): LotSwapFinancialPlan {
  const paidRows = input.receipts.filter(isLotSwapPaidReceipt);
  const futureRows = input.receipts.filter(isLotSwapFutureReceipt);
  const canceledRows = input.receipts.filter(isLotSwapCanceledReceipt);
  const totalPaid = money2(
    paidRows.reduce((sum, row) => money2(sum + receiptAmount(row)), 0),
  );
  const derivation: SaleLotSwapFinancialDerivation = deriveLotSwapPreviewFinancials({
    oldSalePrice: input.oldSalePrice,
    newLotPrice: input.newLotPrice,
    appropriatedToAcquisitionPrice: totalPaid,
  });
  const preserve = paidRows.map(snapshotLotSwapReceipt).map((item) => ({
    ...item,
    action: 'PRESERVE' as const,
  }));
  const cancel = futureRows.map(snapshotLotSwapReceipt).map((item) => ({
    ...item,
    action: 'CANCEL' as const,
  }));
  const maxInstallmentNumber = input.receipts.reduce(
    (max, row) => Math.max(max, installmentNumberOf(row)),
    0,
  );
  const create = planLotSwapNewReceipts({
    newBalance: derivation.fields.new_balance,
    blocked: derivation.blocked,
    futureReceipts: futureRows,
    maxInstallmentNumber,
    asOf: input.asOf,
  });
  const asaas = (input.asaasCharges || [])
    .filter((row) => String(row.id || '').trim())
    .map(mapAsaasCharge);
  const inter = (input.interCharges || [])
    .filter((row) => String(row.id || '').trim())
    .map(mapInterCharge);
  const firstCreateDue = create.map((item) => item.dueDate).filter(Boolean).sort()[0] || null;
  const balloons = (input.balloons || []).map((row) => ({
    action: 'KEEP_SNAPSHOT' as const,
    installmentNumber: Math.max(0, Math.floor(Number(row.installment_number) || 0)),
    additionalAmount: money2(row.additional_amount),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
  }));

  return {
    mutation: false,
    execute: false,
    persistCharges: false,
    persistReceipts: false,
    persistLots: false,
    persistSale: false,
    persistContract: false,
    status: LOT_SWAP_PLAN_STATUS,
    financials: derivation.fields,
    blocked: derivation.blocked,
    blockCode: derivation.blockCode,
    receipts: {
      preserve,
      cancel,
      create,
      ignoredCanceled: canceledRows.length,
    },
    balloons,
    charges: {
      asaasOpen: asaas.filter((c) => c.action === 'DEFER_CANCEL_PHASE_5'),
      asaasPaid: asaas.filter((c) => c.action === 'PRESERVE'),
      asaasOther: asaas.filter(
        (c) => c.action === 'REVIEW_PHASE_5' || c.action === 'IGNORE',
      ),
      interOpen: inter.filter((c) => c.action === 'DEFER_CANCEL_PHASE_5'),
      interPaid: inter.filter((c) => c.action === 'PRESERVE'),
      interOther: inter.filter(
        (c) => c.action === 'REVIEW_PHASE_5' || c.action === 'IGNORE',
      ),
    },
    schedule: {
      correctionType: input.correctionType ? String(input.correctionType) : null,
      correctionLabel: input.correctionLabel || null,
      financialAccountId: input.financialAccountId || null,
      financialAccountName: input.financialAccountName || null,
      firstFutureDueDate: firstCreateDue,
      newInstallmentCount: create.length,
    },
    notice: LOT_SWAP_PLAN_NOTICE,
  };
}

export function assertLotSwapPlanPersistable(plan: LotSwapFinancialPlan, reason?: string | null) {
  const motive = validateLotSwapReason(reason);
  if (!motive.ok) {
    throw new Error(LOT_SWAP_REASON_REQUIRED);
  }
  if (plan.blocked || plan.blockCode === LOT_SWAP_CREDIT_EXCEEDS_PRICE) {
    throw new Error(LOT_SWAP_CREDIT_EXCEEDS_PRICE);
  }
  assertSaleLotSwapFinancialsPersistable({
    fields: plan.financials,
    blocked: plan.blocked,
    blockCode: plan.blockCode === LOT_SWAP_CREDIT_EXCEEDS_PRICE
      ? LOT_SWAP_CREDIT_EXCEEDS_PRICE
      : null,
  });
}

export function buildLotSwapPlanIdempotencyKey(
  saleId: string,
  toBlockId: string,
): string {
  return `lot-swap-plan:${String(saleId).trim()}:${String(toBlockId).trim()}`;
}
