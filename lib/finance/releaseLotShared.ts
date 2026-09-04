/**
 * Helpers puros do fluxo "Liberar lote e encerrar venda".
 * Seguro para client bundle (sem Supabase/Asaas server).
 */

import type { TerminationSettlementPreview } from '@/lib/contract-termination/types';

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

/**
 * Operações exibidas no painel da venda.
 * `outro` permanece no backend (RELEASE_LOT_MOTIVE_OPTIONS), mas não entra na UI.
 * `transferencia_titularidade` é só UI nesta etapa — não é motivo de /release.
 */
export type SaleOperationUiCode =
  | 'desistencia'
  | 'distrato'
  | 'inadimplencia'
  | 'erro_cadastro'
  | 'cancelamento_administrativo'
  | 'troca_lote'
  | 'transferencia_titularidade';

export type SaleOperationUiOption = {
  value: SaleOperationUiCode;
  label: string;
  description: string;
  supportLabel?: string;
};

export const SALE_OPERATION_UI_OPTIONS: SaleOperationUiOption[] = [
  {
    value: 'desistencia',
    label: 'Desistência do cliente',
    description: 'O comprador solicita o encerramento da aquisição.',
  },
  {
    value: 'distrato',
    label: 'Distrato',
    description: 'Encerramento formal da venda por acordo entre as partes.',
  },
  {
    value: 'inadimplencia',
    label: 'Inadimplência',
    description: 'Encerramento por descumprimento das obrigações de pagamento.',
  },
  {
    value: 'erro_cadastro',
    label: 'Erro de cadastro',
    description: 'Venda lançada incorretamente ou vinculada ao cliente/lote errado.',
  },
  {
    value: 'cancelamento_administrativo',
    label: 'Cancelamento administrativo',
    description: 'Cancelamento excepcional pela administração, com justificativa obrigatória.',
  },
  {
    value: 'troca_lote',
    label: 'Troca de lote',
    description:
      'O comprador permanece na negociação, mas a unidade vinculada será substituída.',
  },
  {
    value: 'transferencia_titularidade',
    label: 'Transferência de titularidade',
    description:
      'Transferir a posição contratual para um novo comprador, preservando saldo e histórico.',
    supportLabel: 'Venda de ágio / cessão',
  },
];

export const SALE_OPERATION_UI_GROUPS: Array<{
  id: 'encerrar_venda' | 'alterar_venda';
  label: string;
  codes: SaleOperationUiCode[];
}> = [
  {
    id: 'encerrar_venda',
    label: 'Encerrar venda',
    codes: [
      'desistencia',
      'distrato',
      'inadimplencia',
      'erro_cadastro',
      'cancelamento_administrativo',
    ],
  },
  {
    id: 'alterar_venda',
    label: 'Alterar venda',
    codes: ['troca_lote', 'transferencia_titularidade'],
  },
];

/** Encerramento que ainda usa POST /release (lote volta a Disponível). */
const LOT_RELEASE_OPERATION_CODES: ReadonlySet<string> = new Set([
  'desistencia',
  'distrato',
  'inadimplencia',
  'erro_cadastro',
  'cancelamento_administrativo',
]);

/** Acerto financeiro somente leitura — não inclui erro de cadastro nem alterar venda. */
const SETTLEMENT_OPERATION_CODES: ReadonlySet<string> = new Set([
  'desistencia',
  'distrato',
  'inadimplencia',
  'cancelamento_administrativo',
]);

const DEFERRED_OPERATION_CODES: ReadonlySet<string> = new Set([
  'troca_lote',
  'transferencia_titularidade',
]);

export function isLotReleaseSaleOperation(code?: string | null): boolean {
  return LOT_RELEASE_OPERATION_CODES.has(String(code || '').trim());
}

export function showsTerminationSettlement(code?: string | null): boolean {
  return SETTLEMENT_OPERATION_CODES.has(String(code || '').trim());
}

export function isDeferredSaleOperation(code?: string | null): boolean {
  return DEFERRED_OPERATION_CODES.has(String(code || '').trim());
}

export function saleOperationUiOption(
  code?: string | null,
): SaleOperationUiOption | undefined {
  const value = String(code || '').trim();
  return SALE_OPERATION_UI_OPTIONS.find((option) => option.value === value);
}

/** Agrupamento visual legado — o painel usa SALE_OPERATION_UI_GROUPS. */
export const RELEASE_LOT_MOTIVE_GROUPS = SALE_OPERATION_UI_GROUPS;

/** Textos de UI dos cards — valores internos continuam RELEASE_LOT_MOTIVE_OPTIONS. */
export const RELEASE_LOT_MOTIVE_DESCRIPTIONS: Record<ReleaseLotMotiveCode, string> = {
  desistencia: 'O comprador solicita o encerramento da aquisição.',
  distrato: 'Encerramento formal da venda por acordo entre as partes.',
  inadimplencia: 'Encerramento por descumprimento das obrigações de pagamento.',
  erro_cadastro: 'Venda lançada incorretamente ou vinculada ao cliente/lote errado.',
  troca_lote:
    'O comprador permanece na negociação, mas a unidade vinculada será substituída.',
  cancelamento_administrativo:
    'Cancelamento excepcional pela administração, com justificativa obrigatória.',
  outro: 'Outro motivo. A descrição é obrigatória.',
};

export const SALE_CANCELLED_STATUS = 'CANCELLED';
export const CONTRACT_CANCELLED_STATUS = 'cancelado';
export const RECEIPT_CANCELLED_STATUS = 'cancelado';
export const LOT_AVAILABLE_STATUS = 'Disponível';

const PAID_RECEIPT_STATUSES = new Set(['pago', 'paid']);
const CANCELED_RECEIPT_STATUSES = new Set(['cancelado', 'canceled', 'cancelled']);
const OVERDUE_RECEIPT_STATUSES = new Set(['atrasado', 'overdue', 'vencido']);

const ACTIVE_ASAAS_STATUSES = new Set(['PENDING', 'REGISTERED', 'OVERDUE']);
/** Somente estes status remotos Asaas aceitam DELETE /payments/{id}. */
const ASAAS_REMOTE_CANCELABLE = new Set(['PENDING', 'OVERDUE']);
const PAID_ASAAS_STATUSES = new Set([
  'PAID',
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
]);
const TERMINAL_ASAAS_CANCEL_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'DELETED',
  'EXPIRED',
  'FAILED',
]);
const REFUNDED_ASAAS_STATUSES = new Set([
  'REFUNDED',
  'REFUND_REQUESTED',
  'REFUND_IN_PROGRESS',
]);

/** Status locais de bank_charges Inter ainda abertos (candidatos a sync/cancel). */
const INTER_LOCAL_CANCEL_CANDIDATES = new Set([
  'PENDING',
  'REGISTERED',
  'OVERDUE',
]);
const INTER_PAID_STATUSES = new Set(['PAID']);
const INTER_TERMINAL_CANCEL_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'EXPIRED',
  'FAILED',
]);
/** Situações remotas Inter que ainda podem ser canceladas via POST …/cancelar. */
const INTER_REMOTE_CANCELABLE_SITUACOES = new Set([
  'A_RECEBER',
  'ATRASADO',
  'EM_PROCESSAMENTO',
]);
const INTER_REMOTE_PAID_SITUACOES = new Set([
  'RECEBIDO',
  'PAGO',
  'MARCADO_RECEBIDO',
]);
const INTER_REMOTE_ALREADY_CANCELLED_SITUACOES = new Set([
  'CANCELADO',
  'EXPIRADO',
]);

export function normalizeAsaasRemoteStatus(status?: string | null): string {
  return String(status || '')
    .toUpperCase()
    .trim();
}

export function isActiveOpenAsaasChargeStatus(status?: string | null): boolean {
  return ACTIVE_ASAAS_STATUSES.has(normalizeAsaasRemoteStatus(status));
}

/** Candidata local a revisão Asaas (status local pode estar desatualizado). */
export function isLocalAsaasCancelCandidateStatus(status?: string | null): boolean {
  const st = normalizeAsaasRemoteStatus(status);
  return st === 'PENDING' || st === 'REGISTERED' || st === 'OVERDUE';
}

/** Removível via DELETE no Asaas — só pendente ou vencida. */
export function isAsaasRemoteCancelableStatus(status?: string | null): boolean {
  return ASAAS_REMOTE_CANCELABLE.has(normalizeAsaasRemoteStatus(status));
}

export function isPaidAsaasChargeStatus(status?: string | null): boolean {
  return PAID_ASAAS_STATUSES.has(normalizeAsaasRemoteStatus(status));
}

export function isAlreadyCancelledAsaasChargeStatus(status?: string | null): boolean {
  return TERMINAL_ASAAS_CANCEL_STATUSES.has(normalizeAsaasRemoteStatus(status));
}

export function isRefundedAsaasChargeStatus(status?: string | null): boolean {
  return REFUNDED_ASAAS_STATUSES.has(normalizeAsaasRemoteStatus(status));
}

export function normalizeInterBankChargeStatus(status?: string | null): string {
  return String(status || '')
    .toUpperCase()
    .trim();
}

export function normalizeInterSituacaoForRelease(situacao?: string | null): string {
  return String(situacao || '')
    .toUpperCase()
    .trim();
}

export function isLocalInterCancelCandidateStatus(status?: string | null): boolean {
  return INTER_LOCAL_CANCEL_CANDIDATES.has(normalizeInterBankChargeStatus(status));
}

export function isPaidInterBankChargeStatus(status?: string | null): boolean {
  return INTER_PAID_STATUSES.has(normalizeInterBankChargeStatus(status));
}

export function isAlreadyCancelledInterBankChargeStatus(
  status?: string | null,
): boolean {
  return INTER_TERMINAL_CANCEL_STATUSES.has(normalizeInterBankChargeStatus(status));
}

export type ReleaseInterDisposition =
  | 'cancel'
  | 'preserve_paid'
  | 'already_cancelled'
  | 'block_non_removable';

/**
 * Decisão após consultar situacao real no Inter (Cobrança V3).
 * Não cancela cobrança já RECEBIDO/PAGO.
 */
export function classifyRemoteInterSituacaoForRelease(
  situacao?: string | null,
): ReleaseInterDisposition {
  const s = normalizeInterSituacaoForRelease(situacao);
  if (!s) return 'block_non_removable';
  if (INTER_REMOTE_CANCELABLE_SITUACOES.has(s)) return 'cancel';
  if (INTER_REMOTE_PAID_SITUACOES.has(s)) return 'preserve_paid';
  if (INTER_REMOTE_ALREADY_CANCELLED_SITUACOES.has(s)) return 'already_cancelled';
  return 'block_non_removable';
}

export function classifyInterBankChargeForRelease(
  status?: string | null,
): ReleaseChargeBucket {
  if (isPaidInterBankChargeStatus(status)) return 'paid';
  const st = normalizeInterBankChargeStatus(status);
  if (st === 'PENDING' || st === 'REGISTERED' || st === 'OVERDUE') return 'open';
  if (isAlreadyCancelledInterBankChargeStatus(status)) return 'cancelled';
  return 'other';
}

export function interCancelMotivoFromReleaseMotive(
  motiveCode?: string | null,
): string {
  const code = String(motiveCode || '').trim();
  if (code === 'desistencia') return 'CLIENTE_DESISTIU';
  if (code === 'inadimplencia') return 'APOS_VENCIMENTO';
  return 'ACERTOS';
}

/**
 * Decisão após consultar o status real no Asaas.
 * Não tenta DELETE cegamente em status não removíveis.
 */
export type ReleaseAsaasDisposition =
  | 'cancel'
  | 'preserve_paid'
  | 'preserve_refunded'
  | 'already_cancelled'
  | 'block_non_removable';

export function classifyRemoteAsaasStatusForRelease(
  remoteStatus?: string | null,
): ReleaseAsaasDisposition {
  const st = normalizeAsaasRemoteStatus(remoteStatus);
  if (!st) return 'block_non_removable';
  if (isAsaasRemoteCancelableStatus(st)) return 'cancel';
  if (isPaidAsaasChargeStatus(st)) return 'preserve_paid';
  if (isRefundedAsaasChargeStatus(st)) return 'preserve_refunded';
  if (isAlreadyCancelledAsaasChargeStatus(st)) return 'already_cancelled';
  return 'block_non_removable';
}

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

/**
 * Listagem operacional Financeiro/Cobranças:
 * - pago → permanece (histórico / fluxo)
 * - cancelado → fora da listagem padrão (auditoria só no filtro Cancelado)
 * - demais → obrigação ativa
 */
export function isOperationalFinanceReceiptForListing(row: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  if (isCanceledFinanceReceiptStatus(row)) return false;
  return true;
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
}):
  | { ok: true; motiveCode: ReleaseLotMotiveCode; motiveLabel: string; motiveDetail: string | null }
  | { ok: false; error: string } {
  const code = String(input.motiveCode || '').trim() as ReleaseLotMotiveCode;
  const option = RELEASE_LOT_MOTIVE_OPTIONS.find((o) => o.value === code);
  if (!option) {
    return { ok: false, error: 'Selecione o motivo da liberação.' };
  }
  const detail = String(input.motiveDetail || '').trim();
  if (code === 'outro' && detail.length < 3) {
    return { ok: false, error: 'Descreva o motivo (campo Outro).' };
  }
  if (code === 'distrato' && detail.length < 3) {
    return { ok: false, error: 'Informe o motivo/justificativa do distrato.' };
  }
  if (code === 'cancelamento_administrativo' && detail.length < 3) {
    return { ok: false, error: 'Informe a justificativa administrativa.' };
  }
  return {
    ok: true,
    motiveCode: code,
    motiveLabel: option.label,
    motiveDetail: detail || null,
  };
}

/** Habilita o botão de confirmação do modal (senha + ciência + motivo válidos). */
export function canConfirmReleaseLot(input: {
  motiveCode: string;
  motiveDetail: string;
  acknowledged: boolean;
  password: string;
  loading?: boolean;
  asaasBlockedCharges?: number;
  interBlockedCharges?: number;
}): boolean {
  if (input.loading) return false;
  if (!input.acknowledged) return false;
  if (!String(input.password || '').trim()) return false;
  if ((input.asaasBlockedCharges || 0) > 0) return false;
  if ((input.interBlockedCharges || 0) > 0) return false;
  return validateReleaseLotMotive({
    motiveCode: input.motiveCode,
    motiveDetail: input.motiveDetail,
  }).ok;
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

export type ReleaseChargeBucket = 'paid' | 'open' | 'cancelled' | 'refunded' | 'other';

export function classifyAsaasChargeForRelease(status?: string | null): ReleaseChargeBucket {
  if (isPaidAsaasChargeStatus(status)) return 'paid';
  if (isRefundedAsaasChargeStatus(status)) return 'refunded';
  // Contagem "aberta cancelável" local: só PENDING/OVERDUE (REGISTERED exige sync remoto)
  const st = normalizeAsaasRemoteStatus(status);
  if (st === 'PENDING' || st === 'OVERDUE') return 'open';
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
  openInterCharges: number;
  paidInterCharges: number;
  alreadyCanceledInterCharges: number;
  /** Soma Asaas + Inter canceláveis (UI agnóstica). */
  openCancelableCharges: number;
  hasPreservedPayments: boolean;
  unpaidToCancel: number;
};

export function summarizeReleaseReceipts(
  receipts: Array<{
    status?: string | null;
    paid_at?: string | null;
    amount?: number | string | null;
  }>,
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
    else if (bucket === 'cancelled' || bucket === 'refunded') {
      alreadyCanceledAsaasCharges += 1;
    }
  }
  return { openAsaasCharges, paidAsaasCharges, alreadyCanceledAsaasCharges };
}

export function summarizeReleaseInterCharges(
  charges: Array<{ status?: string | null }>,
): Pick<
  ReleaseLotPlanSummary,
  'openInterCharges' | 'paidInterCharges' | 'alreadyCanceledInterCharges'
> {
  let openInterCharges = 0;
  let paidInterCharges = 0;
  let alreadyCanceledInterCharges = 0;
  for (const c of charges) {
    const bucket = classifyInterBankChargeForRelease(c.status);
    if (bucket === 'open') openInterCharges += 1;
    else if (bucket === 'paid') paidInterCharges += 1;
    else if (bucket === 'cancelled' || bucket === 'refunded') {
      alreadyCanceledInterCharges += 1;
    }
  }
  return { openInterCharges, paidInterCharges, alreadyCanceledInterCharges };
}

/**
 * Identificação de quadra/lote a partir das colunas reais de `blocks`.
 * Espelha GISMap + saleChargesService: block_name || name ; number || lot_number.
 * A coluna `blocks.block` NÃO existe — nunca usá-la em SELECT.
 */
export function resolveBlockQuadraLabel(row: {
  block_name?: string | null;
  name?: string | null;
}): string | null {
  const value = String(row.block_name || row.name || '').trim();
  return value || null;
}

export function resolveBlockLotLabel(row: {
  number?: string | number | null;
  lot_number?: string | number | null;
}): string | null {
  const primary =
    row.number != null && String(row.number).trim() !== ''
      ? String(row.number).trim()
      : '';
  if (primary) return primary;
  const fallback = String(row.lot_number || '').trim();
  return fallback || null;
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
  openInterCharges: number;
  paidInterCharges: number;
  alreadyCanceledInterCharges: number;
  /** Total cancelável (Asaas + Inter) — label UI agnóstico. */
  openCancelableCharges: number;
  /** Cobranças com status remoto não removível (não PENDING/OVERDUE) — bloqueiam limpeza local. */
  asaasBlockedCharges: number;
  asaasBlockedDetails: Array<{
    chargeId: string;
    error: string;
    localStatus?: string | null;
    remoteStatus?: string | null;
  }>;
  interBlockedCharges: number;
  interBlockedDetails: Array<{
    chargeId: string;
    error: string;
    localStatus?: string | null;
    remoteStatus?: string | null;
  }>;
  openChargeIds: string[];
  openInterChargeIds: string[];
  unpaidReceiptIds: string[];
  paidReceiptIds: string[];
  /** Acerto financeiro — somente leitura. Não persiste e não altera o POST. */
  settlementPreview?: TerminationSettlementPreview | null;
};
