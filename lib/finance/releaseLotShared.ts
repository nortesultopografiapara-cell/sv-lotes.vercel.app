/**
 * Helpers puros do fluxo "Liberar lote e encerrar venda".
 * Seguro para client bundle (sem Supabase/Asaas server).
 */

export const RELEASE_LOT_MOTIVE_OPTIONS = [
  { value: 'desistencia', label: 'Desistência do cliente' },
  { value: 'distrato', label: 'Distrato' },
  { value: 'inadimplencia', label: 'Inadimplência' },
  { value: 'erro_cadastro', label: 'Erro de cadastro' },
  { value: 'troca_lote', label: 'Troca de lote' },
  { value: 'cancelamento_administrativo', label: 'Cancelamento administrativo' },
  { value: 'outro', label: 'Outro' },
] as const;

export type ReleaseLotMotiveCode = (typeof RELEASE_LOT_MOTIVE_OPTIONS)[number]['value'];

export const SALE_CANCELLED_STATUS = 'CANCELLED';
export const CONTRACT_CANCELLED_STATUS = 'cancelado';
export const RECEIPT_CANCELLED_STATUS = 'cancelado';
export const LOT_AVAILABLE_STATUS = 'Disponível';

const PAID_RECEIPT_STATUSES = new Set(['pago', 'paid']);
const CANCELED_RECEIPT_STATUSES = new Set(['cancelado', 'canceled', 'cancelled']);
const OVERDUE_RECEIPT_STATUSES = new Set(['atrasado', 'overdue', 'vencido']);

const ACTIVE_ASAAS_STATUSES = new Set(['PENDING', 'REGISTERED', 'OVERDUE']);
const PAID_ASAAS_STATUSES = new Set(['PAID', 'RECEIVED', 'CONFIRMED']);
const TERMINAL_ASAAS_CANCEL_STATUSES = new Set(['CANCELLED', 'EXPIRED', 'FAILED']);

export function isPaidFinanceReceiptStatus(row: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  if (PAID_RECEIPT_STATUSES.has(st)) return true;
  return Boolean(row.paid_at);
}

export function isCanceledFinanceReceiptStatus(row: {
  status?: string | null;
}): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  return CANCELED_RECEIPT_STATUSES.has(st);
}

export function isOverdueFinanceReceiptStatus(row: {
  status?: string | null;
}): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  return OVERDUE_RECEIPT_STATUSES.has(st);
}

/** Parcela ainda exigível (não paga e não cancelada). */
export function isActiveUnpaidFinanceReceipt(row: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  if (isPaidFinanceReceiptStatus(row)) return false;
  if (isCanceledFinanceReceiptStatus(row)) return false;
  return true;
}

export function isActiveOpenAsaasChargeStatus(status?: string | null): boolean {
  return ACTIVE_ASAAS_STATUSES.has(String(status || '').toUpperCase().trim());
}

export function isPaidAsaasChargeStatus(status?: string | null): boolean {
  return PAID_ASAAS_STATUSES.has(String(status || '').toUpperCase().trim());
}

export function isAlreadyCancelledAsaasChargeStatus(status?: string | null): boolean {
  return TERMINAL_ASAAS_CANCEL_STATUSES.has(String(status || '').toUpperCase().trim());
}

export function isCanceledSaleStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return (
    st === 'cancelled' ||
    st === 'canceled' ||
    st === 'cancelado' ||
    st === 'cancelada'
  );
}

export function isActiveSaleStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'active' || st === 'ativo';
}

export function isCanceledContractStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'cancelado' || st === 'cancelled' || st === 'canceled';
}

export function normalizeLotStatus(status?: string | null): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

export function isSoldOrReservedLotStatus(status?: string | null): boolean {
  const st = normalizeLotStatus(status);
  return (
    st === 'vendido' ||
    st === 'sold' ||
    st === 'venda' ||
    st === 'sold_out' ||
    st === 'reservado' ||
    st === 'reserved'
  );
}

export function isAvailableLotStatus(status?: string | null): boolean {
  const st = normalizeLotStatus(status);
  return st === 'disponível' || st === 'disponivel' || st === 'available';
}

export function validateReleaseLotMotive(input: {
  motiveCode?: string | null;
  motiveDetail?: string | null;
}): { ok: true; motiveCode: ReleaseLotMotiveCode; motiveLabel: string; motiveDetail: string | null } | { ok: false; error: string } {
  const code = String(input.motiveCode || '').trim() as ReleaseLotMotiveCode;
  const option = RELEASE_LOT_MOTIVE_OPTIONS.find((o) => o.value === code);
  if (!option) {
    return { ok: false, error: 'Selecione o motivo da liberação.' };
  }
  const detail = String(input.motiveDetail || '').trim();
  if (code === 'outro' && detail.length < 3) {
    return { ok: false, error: 'Descreva o motivo (campo Outro).' };
  }
  return {
    ok: true,
    motiveCode: code,
    motiveLabel: option.label,
    motiveDetail: detail || null,
  };
}

export type ReleaseReceiptBucket = 'paid' | 'pending' | 'overdue' | 'canceled' | 'other_unpaid';

export function classifyFinanceReceiptForRelease(row: {
  status?: string | null;
  paid_at?: string | null;
}): ReleaseReceiptBucket {
  if (isPaidFinanceReceiptStatus(row)) return 'paid';
  if (isCanceledFinanceReceiptStatus(row)) return 'canceled';
  if (isOverdueFinanceReceiptStatus(row)) return 'overdue';
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  if (st === 'pendente' || st === 'pending' || !st) return 'pending';
  return 'other_unpaid';
}

export type ReleaseChargeBucket = 'paid' | 'open' | 'cancelled' | 'other';

export function classifyAsaasChargeForRelease(status?: string | null): ReleaseChargeBucket {
  if (isPaidAsaasChargeStatus(status)) return 'paid';
  if (isActiveOpenAsaasChargeStatus(status)) return 'open';
  if (isAlreadyCancelledAsaasChargeStatus(status)) return 'cancelled';
  return 'other';
}

export function money2(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function buildReleaseLotIdempotencyKey(lotId: string, saleId?: string | null): string {
  const salePart = saleId ? String(saleId).trim() : 'no-sale';
  return `release-lot:${String(lotId).trim()}:${salePart}`;
}

export type ReleaseLotPlanSummary = {
  paidReceipts: number;
  pendingReceipts: number;
  overdueReceipts: number;
  otherUnpaidReceipts: number;
  alreadyCanceledReceipts: number;
  totalPaidAmount: number;
  lastPaidAt: string | null;
  openAsaasCharges: number;
  paidAsaasCharges: number;
  alreadyCanceledAsaasCharges: number;
  hasPreservedPayments: boolean;
  unpaidToCancel: number;
};

export function summarizeReleaseReceipts(
  receipts: Array<{ status?: string | null; paid_at?: string | null; amount?: number | string | null }>,
): Pick<
  ReleaseLotPlanSummary,
  | 'paidReceipts'
  | 'pendingReceipts'
  | 'overdueReceipts'
  | 'otherUnpaidReceipts'
  | 'alreadyCanceledReceipts'
  | 'totalPaidAmount'
  | 'lastPaidAt'
  | 'hasPreservedPayments'
  | 'unpaidToCancel'
> {
  let paidReceipts = 0;
  let pendingReceipts = 0;
  let overdueReceipts = 0;
  let otherUnpaidReceipts = 0;
  let alreadyCanceledReceipts = 0;
  let totalPaidAmount = 0;
  let lastPaidAt: string | null = null;

  for (const row of receipts) {
    const bucket = classifyFinanceReceiptForRelease(row);
    if (bucket === 'paid') {
      paidReceipts += 1;
      totalPaidAmount = money2(totalPaidAmount + money2(row.amount));
      const paidAt = row.paid_at ? String(row.paid_at) : null;
      if (paidAt && (!lastPaidAt || paidAt > lastPaidAt)) lastPaidAt = paidAt;
      continue;
    }
    if (bucket === 'canceled') {
      alreadyCanceledReceipts += 1;
      continue;
    }
    if (bucket === 'overdue') {
      overdueReceipts += 1;
      continue;
    }
    if (bucket === 'pending') {
      pendingReceipts += 1;
      continue;
    }
    otherUnpaidReceipts += 1;
  }

  const unpaidToCancel = pendingReceipts + overdueReceipts + otherUnpaidReceipts;
  return {
    paidReceipts,
    pendingReceipts,
    overdueReceipts,
    otherUnpaidReceipts,
    alreadyCanceledReceipts,
    totalPaidAmount: money2(totalPaidAmount),
    lastPaidAt,
    hasPreservedPayments: paidReceipts > 0,
    unpaidToCancel,
  };
}

export function summarizeReleaseCharges(
  charges: Array<{ status?: string | null }>,
): Pick<
  ReleaseLotPlanSummary,
  'openAsaasCharges' | 'paidAsaasCharges' | 'alreadyCanceledAsaasCharges'
> {
  let openAsaasCharges = 0;
  let paidAsaasCharges = 0;
  let alreadyCanceledAsaasCharges = 0;
  for (const c of charges) {
    const bucket = classifyAsaasChargeForRelease(c.status);
    if (bucket === 'open') openAsaasCharges += 1;
    else if (bucket === 'paid') paidAsaasCharges += 1;
    else if (bucket === 'cancelled') alreadyCanceledAsaasCharges += 1;
  }
  return { openAsaasCharges, paidAsaasCharges, alreadyCanceledAsaasCharges };
}

/** Preview serializado pela API GET /api/lots/[lotId]/release (seguro no client). */
export type ReleaseLotPreview = {
  lotId: string;
  companyId: string;
  projectId: string | null;
  status: string | null;
  quadra: string | null;
  lote: string | null;
  price: number | null;
  customerId: string | null;
  customerName: string | null;
  saleId: string | null;
  saleStatus: string | null;
  contractId: string | null;
  contractNumber: string | null;
  contractStatus: string | null;
  contractSigned: boolean;
  documentsPreserved: number;
  mode: 'full_release' | 'simple_clear' | 'already_released';
  idempotencyKey: string;
  paidReceipts: number;
  pendingReceipts: number;
  overdueReceipts: number;
  unpaidToCancel: number;
  totalPaidAmount: number;
  lastPaidAt: string | null;
  hasPreservedPayments: boolean;
  openAsaasCharges: number;
  paidAsaasCharges: number;
  alreadyCanceledAsaasCharges: number;
  openChargeIds: string[];
  unpaidReceiptIds: string[];
  paidReceiptIds: string[];
};
