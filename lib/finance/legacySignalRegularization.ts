/**
 * Regularização de sinal antigo marcado como integralmente pago.
 * Não grava caixa, contrato, comissão nem cobrança. A venda com sinal
 * separado já existente é recusada antes de qualquer alteração.
 */

export const LEGACY_SIGNAL_RPC = 'execute_legacy_signal_regularization';

export const LEGACY_SIGNAL_ADMIN_ROLES = ['ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN'] as const;

const PAID = new Set(['pago', 'paid', 'paga']);
const CANCELLED = new Set(['cancelado', 'canceled', 'cancelled', 'cancelada']);
const INACTIVE = new Set(['inactive', 'inativo', 'disabled', 'bloqueado']);
const PAID_COMMISSION = new Set(['pago', 'paid', 'paga', 'settled', 'repassado', 'liquidado']);
const CLOSED_SALE = new Set(['cancelled', 'cancelado', 'canceled', 'rescindido', 'distrato']);

export type LegacySignalActor = {
  id: string;
  tenantId: string;
  role: string;
  status?: string | null;
};

export type LegacySignalSale = {
  id: string;
  tenantId: string;
  companyId: string | null;
  status: string;
  signalScheduleMode: string | null;
  totalCents: number;
  signalContractCents: number | null;
  signalPaidAtSaleCents: number | null;
  signalRemainingCents: number | null;
};

export type LegacySignalReceipt = {
  id: string;
  saleId: string;
  tenantId: string;
  companyId: string | null;
  customerId: string;
  projectId: string | null;
  blockId: string | null;
  brokerId: string | null;
  contractId: string | null;
  installmentNumber: number;
  dueDate: string;
  amountCents: number;
  paidAmountCents: number | null;
  paidAt: string | null;
  status: string;
  scheduleGroup: string | null;
  financialAccountId: string | null;
};

export type LegacySignalLink = {
  id: string;
  saleId?: string | null;
  receiptId?: string | null;
  contractId?: string | null;
  status?: string | null;
  provider?: string | null;
  hasReceiptDocument?: boolean;
};

export type LegacySignalState = {
  sale: LegacySignalSale;
  receipts: LegacySignalReceipt[];
  cash: LegacySignalLink[];
  bankCharges: LegacySignalLink[];
  asaasCharges: LegacySignalLink[];
  settlements: LegacySignalLink[];
  commissions: LegacySignalLink[];
  contracts: Array<{ id: string; saleId: string; version: number | null }>;
  audits: LegacySignalAudit[];
};

export type LegacySignalInstallmentInput = {
  dueDate: string;
  amountCents: number;
};

export type LegacySignalRequest = {
  receivedCents: number;
  installments: LegacySignalInstallmentInput[];
  reason: string;
  requestKey: string;
  confirm: boolean;
};

export type FinancialPicture = {
  signalPaidCents: number;
  signalPendingCents: number;
  signalTotalCents: number;
  lotCents: number;
  lotCount: number;
  cashCount: number;
  contractIds: string[];
  commissionCents: number[];
  commissionStatuses: string[];
  originalReceiptId: string | null;
  originalPaidAt: string | null;
  originalAmountCents: number | null;
};

export type LegacySignalAudit = {
  id: string;
  tenantId: string;
  companyId: string;
  saleId: string;
  receiptId: string;
  requestKey: string;
  actorUserId: string;
  reason: string;
  fingerprint: string;
  before: FinancialPicture;
  after: FinancialPicture;
  createdAt: string;
};

export type LegacySignalResult = {
  ok: boolean;
  code: string;
  message: string;
  replayed: boolean;
  blockers: string[];
  receiptId: string | null;
  createdInstallmentCount: number;
  before: FinancialPicture | null;
  after: FinancialPicture | null;
  auditId: string | null;
};

export class LegacySignalRollback extends Error {
  constructor(step: string) {
    super(`Transação desfeita em ${step}.`);
    this.name = 'LegacySignalRollback';
  }
}

function text(value: string | null | undefined): string {
  return String(value || '').trim();
}

function sameId(left: string | null | undefined, right: string | null | undefined): boolean {
  return text(left) !== '' && text(left) === text(right);
}

export function parseBrlToCents(input: string): number | null {
  const raw = input.trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** As primeiras parcelas recebem o centavo restante. 200000 em 3 vira 66667, 66667 e 66666. */
export function splitCentsEvenly(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) return [];
  if (!Number.isInteger(count) || count < 1) return [];
  const base = Math.floor(totalCents / count);
  const extra = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function legacySignalFingerprint(request: Pick<LegacySignalRequest, 'receivedCents' | 'installments' | 'reason'>): string {
  return JSON.stringify({
    receivedCents: request.receivedCents,
    installments: request.installments.map((row) => ({
      dueDate: row.dueDate,
      amountCents: row.amountCents,
    })),
    reason: request.reason.trim(),
  });
}

export function canAdministerLegacySignal(actor: LegacySignalActor, saleTenantId: string): boolean {
  const role = text(actor.role).toUpperCase();
  const status = text(actor.status || 'ACTIVE').toLowerCase();
  if (INACTIVE.has(status)) return false;
  if (!(LEGACY_SIGNAL_ADMIN_ROLES as readonly string[]).includes(role)) return false;
  return text(actor.tenantId) !== '' && text(actor.tenantId) === text(saleTenantId);
}

function activeCash(row: LegacySignalLink): boolean {
  const status = text(row.status || 'ativo').toLowerCase();
  return !['estornado', 'cancelado', 'cancelled', 'canceled'].includes(status);
}

function openCharge(row: LegacySignalLink): boolean {
  return text(row.status).toUpperCase() !== 'CANCELLED';
}

export function legacySignalBlockers(state: LegacySignalState, receipt: LegacySignalReceipt): string[] {
  const blockers: string[] = [];
  const linkedCash = state.cash.filter((row) => {
    if (!activeCash(row)) return false;
    return sameId(row.saleId, state.sale.id)
      || sameId(row.receiptId, receipt.id)
      || (text(receipt.contractId) !== '' && sameId(row.contractId, receipt.contractId));
  });
  if (linkedCash.some((row) => row.hasReceiptDocument)) blockers.push('receipt');
  if (linkedCash.length > 0) blockers.push('cash');
  if (state.bankCharges.some((row) => sameId(row.receiptId, receipt.id) && openCharge(row))) {
    blockers.push('bank_charge');
  }
  if (state.asaasCharges.some((row) => sameId(row.receiptId, receipt.id) && openCharge(row))) {
    blockers.push('asaas_charge');
  }
  if (state.settlements.some((row) => sameId(row.saleId, state.sale.id) && text(row.status).toUpperCase() !== 'CANCELLED' && text(row.status).toLowerCase() !== 'cancelado')) {
    blockers.push('settlement');
  }
  if (state.commissions.some((row) => sameId(row.saleId, state.sale.id) && PAID_COMMISSION.has(text(row.status).toLowerCase()))) {
    blockers.push('paid_commission');
  }
  if (text(receipt.financialAccountId)) blockers.push('financial_account');
  return blockers;
}

function lotReceipts(state: LegacySignalState): LegacySignalReceipt[] {
  return state.receipts.filter((row) => {
    if (row.saleId !== state.sale.id || row.installmentNumber < 1) return false;
    if (CANCELLED.has(text(row.status).toLowerCase())) return false;
    return text(row.scheduleGroup).toUpperCase() !== 'SIGNAL';
  });
}

export function financialPicture(state: LegacySignalState): FinancialPicture {
  const signal = state.receipts.filter((row) => {
    if (row.saleId !== state.sale.id || CANCELLED.has(text(row.status).toLowerCase())) return false;
    return text(row.scheduleGroup).toUpperCase() === 'SIGNAL' || row.installmentNumber <= 0;
  });
  const original = state.receipts.find((row) => row.saleId === state.sale.id && row.installmentNumber === 0) || null;
  const lot = lotReceipts(state);
  const paid = signal.filter((row) => PAID.has(text(row.status).toLowerCase()));
  const pending = signal.filter((row) => !PAID.has(text(row.status).toLowerCase()));
  return {
    signalPaidCents: paid.reduce((sum, row) => sum + (row.paidAmountCents ?? 0), 0),
    signalPendingCents: pending.reduce((sum, row) => sum + row.amountCents, 0),
    signalTotalCents: signal.reduce((sum, row) => sum + row.amountCents, 0),
    lotCents: lot.reduce((sum, row) => sum + row.amountCents, 0),
    lotCount: lot.length,
    cashCount: state.cash.filter(activeCash).length,
    contractIds: state.contracts.filter((row) => row.saleId === state.sale.id).map((row) => row.id),
    commissionCents: state.commissions.map(() => 0),
    commissionStatuses: state.commissions.map((row) => text(row.status)),
    originalReceiptId: original?.id || null,
    originalPaidAt: original?.paidAt || null,
    originalAmountCents: original?.amountCents ?? null,
  };
}

function result(partial: Partial<LegacySignalResult> & Pick<LegacySignalResult, 'ok' | 'code' | 'message'>): LegacySignalResult {
  return {
    replayed: false,
    blockers: [],
    receiptId: null,
    createdInstallmentCount: 0,
    before: null,
    after: null,
    auditId: null,
    ...partial,
  };
}

function validateRequest(request: LegacySignalRequest, originalCents: number, state: LegacySignalState): string | null {
  if (!Number.isInteger(request.receivedCents) || request.receivedCents <= 0) return 'Informe o valor recebido.';
  if (request.receivedCents >= originalCents) return 'O valor recebido precisa ser menor que o sinal marcado como pago.';
  if (!Array.isArray(request.installments) || request.installments.length < 1 || request.installments.length > 36) {
    return 'Informe de uma a 36 parcelas do saldo.';
  }
  const sum = request.installments.reduce((total, row) => total + row.amountCents, 0);
  if (request.installments.some((row) => !Number.isInteger(row.amountCents) || row.amountCents <= 0 || !isIsoDate(row.dueDate))) {
    return 'Cada parcela precisa de vencimento e valor válidos.';
  }
  if (request.receivedCents + sum !== originalCents) {
    return 'O sinal total precisa ser a soma do valor recebido e das parcelas restantes.';
  }
  const remaining = state.sale.signalRemainingCents;
  if (remaining != null && remaining !== sum) return 'O saldo informado não confere com o saldo já registrado na venda.';
  const paidAtSale = state.sale.signalPaidAtSaleCents;
  if (paidAtSale != null && paidAtSale !== request.receivedCents) {
    return 'O valor recebido não confere com o valor já registrado na venda.';
  }
  if (request.reason.trim().length < 10 || request.reason.trim().length > 500) {
    return 'Informe o motivo da regularização.';
  }
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(request.requestKey)) return 'A confirmação não possui uma chave válida.';
  return null;
}

function findOriginal(state: LegacySignalState): LegacySignalReceipt[] {
  return state.receipts.filter((row) => row.saleId === state.sale.id && row.installmentNumber === 0);
}

export function previewLegacySignalRegularization(
  state: LegacySignalState,
  actor: LegacySignalActor,
  request: LegacySignalRequest,
): LegacySignalResult {
  const before = financialPicture(state);
  const fingerprint = legacySignalFingerprint(request);
  const existing = state.audits.find((row) => row.saleId === state.sale.id);
  if (existing && canAdministerLegacySignal(actor, state.sale.tenantId)) {
    const same = existing.requestKey === request.requestKey && existing.fingerprint === fingerprint;
    return result({
      ok: same,
      code: same ? 'replayed' : existing.requestKey === request.requestKey ? 'idempotency_conflict' : 'already_regularized',
      message: same
        ? 'Esta regularização já foi aplicada.'
        : existing.requestKey === request.requestKey
          ? 'A chave já foi usada com outros valores.'
          : 'Esta venda já foi regularizada.',
      replayed: same,
      receiptId: existing.receiptId,
      before: existing.before,
      after: same ? existing.after : null,
      auditId: existing.id,
    });
  }
  if (!canAdministerLegacySignal(actor, state.sale.tenantId)) {
    const sameCompany = text(actor.tenantId) === text(state.sale.tenantId);
    return result({
      ok: false,
      code: sameCompany ? 'forbidden' : 'wrong_company',
      message: sameCompany
        ? 'Somente um administrador da empresa pode regularizar o sinal.'
        : 'A venda não pertence a esta empresa.',
      before,
    });
  }
  if (text(state.sale.companyId) && text(state.sale.companyId) !== text(state.sale.tenantId)) {
    return result({ ok: false, code: 'wrong_company', message: 'A venda não pertence a esta empresa.', before });
  }
  if (CLOSED_SALE.has(text(state.sale.status).toLowerCase())) {
    return result({ ok: false, code: 'closed_sale', message: 'A venda não está ativa.', before });
  }
  if (text(state.sale.signalScheduleMode).toUpperCase() === 'SEPARATE') {
    return result({
      ok: false,
      code: 'separate_schedule',
      message: 'Esta venda já usa o sinal parcelado novo.',
      blockers: ['separate_schedule'],
      before,
    });
  }
  if (state.receipts.some((row) => row.saleId === state.sale.id && text(row.scheduleGroup))) {
    return result({
      ok: false,
      code: 'separate_schedule',
      message: 'Esta venda já separa as parcelas do sinal e do lote.',
      blockers: ['separate_schedule'],
      before,
    });
  }
  const originals = findOriginal(state);
  if (originals.length !== 1) {
    return result({ ok: false, code: 'not_legacy_paid_signal', message: 'A parcela inicial do sinal não está única.', before });
  }
  const original = originals[0];
  if (text(original.tenantId) !== text(state.sale.tenantId)) {
    return result({ ok: false, code: 'wrong_company', message: 'A parcela não pertence a esta empresa.', before });
  }
  const markedPaid = PAID.has(text(original.status).toLowerCase())
    && original.paidAt
    && original.paidAmountCents === original.amountCents
    && original.amountCents > 0;
  const contracted = state.sale.signalContractCents;
  if (!markedPaid || (contracted != null && contracted !== original.amountCents)) {
    return result({
      ok: false,
      code: 'not_legacy_paid_signal',
      message: 'O sinal não está marcado como integralmente pago.',
      before,
    });
  }
  const lot = lotReceipts(state);
  const lotCents = lot.reduce((sum, row) => sum + row.amountCents, 0);
  if (lotCents !== state.sale.totalCents) {
    return result({
      ok: false,
      code: 'lot_schedule_mismatch',
      message: 'As parcelas do lote não fecham com o preço do lote.',
      before,
    });
  }
  const invalid = validateRequest(request, original.amountCents, state);
  if (invalid) return result({ ok: false, code: 'invalid', message: invalid, before });
  const blockers = legacySignalBlockers(state, original);
  if (blockers.length > 0) {
    return result({
      ok: false,
      code: 'blocked',
      message: 'Há caixa, recibo, cobrança ou repasse vinculado. A regularização automática foi bloqueada.',
      blockers,
      before,
    });
  }
  const proposed = propose(state, original, request);
  return result({
    ok: true,
    code: 'preview',
    message: 'A situação proposta preserva a parcela original e as parcelas do lote.',
    receiptId: original.id,
    createdInstallmentCount: request.installments.length,
    before,
    after: financialPicture(proposed),
  });
}

function propose(
  state: LegacySignalState,
  original: LegacySignalReceipt,
  request: LegacySignalRequest,
): LegacySignalState {
  const adjusted: LegacySignalReceipt = {
    ...original,
    amountCents: request.receivedCents,
    paidAmountCents: request.receivedCents,
    paidAt: original.paidAt,
    status: 'pago',
    scheduleGroup: 'SIGNAL',
  };
  const created = request.installments.map((row, index) => ({
    id: `new-signal-${index + 1}`,
    saleId: original.saleId,
    tenantId: original.tenantId,
    companyId: original.companyId || original.tenantId,
    customerId: original.customerId,
    projectId: original.projectId,
    blockId: original.blockId,
    brokerId: original.brokerId,
    contractId: original.contractId,
    installmentNumber: index + 1,
    dueDate: row.dueDate,
    amountCents: row.amountCents,
    paidAmountCents: null,
    paidAt: null,
    status: 'pendente',
    scheduleGroup: 'SIGNAL',
    financialAccountId: null,
  }));
  return {
    ...state,
    receipts: state.receipts.map((row) => (row.id === original.id ? adjusted : row)).concat(created),
  };
}

export function executeLegacySignalRegularization(
  state: LegacySignalState,
  actor: LegacySignalActor,
  request: LegacySignalRequest,
  options?: { failAt?: 'after_update' | 'after_insert' | 'audit'; now?: string },
): { state: LegacySignalState; result: LegacySignalResult } {
  const unchanged = state;
  if (!request.confirm) {
    return {
      state: unchanged,
      result: result({
        ok: false,
        code: 'confirmation_required',
        message: 'A regularização exige confirmação explícita.',
        before: financialPicture(state),
      }),
    };
  }
  const existing = state.audits.find((row) => row.saleId === state.sale.id);
  const fingerprint = legacySignalFingerprint(request);
  if (existing) {
    if (existing.requestKey === request.requestKey && existing.fingerprint === fingerprint) {
      return {
        state: unchanged,
        result: result({
          ok: true,
          code: 'replayed',
          message: 'Esta regularização já foi aplicada.',
          replayed: true,
          receiptId: existing.receiptId,
          before: existing.before,
          after: existing.after,
          auditId: existing.id,
        }),
      };
    }
    return {
      state: unchanged,
      result: result({
        ok: false,
        code: existing.requestKey === request.requestKey ? 'idempotency_conflict' : 'already_regularized',
        message: existing.requestKey === request.requestKey
          ? 'A chave já foi usada com outros valores.'
          : 'Esta venda já foi regularizada.',
        before: financialPicture(state),
      }),
    };
  }
  const keyOwner = state.audits.find((row) => row.tenantId === actor.tenantId && row.requestKey === request.requestKey);
  if (keyOwner && keyOwner.saleId !== state.sale.id) {
    return {
      state: unchanged,
      result: result({
        ok: false,
        code: 'idempotency_conflict',
        message: 'A chave já foi usada em outra venda.',
        before: financialPicture(state),
      }),
    };
  }
  const preview = previewLegacySignalRegularization(state, actor, request);
  if (!preview.ok || !preview.after) return { state: unchanged, result: preview };

  const original = findOriginal(state)[0];
  const drafted = propose(state, original, request);
  if (options?.failAt === 'after_update' || options?.failAt === 'after_insert') {
    throw new LegacySignalRollback(options.failAt);
  }
  const lotBefore = lotReceipts(state).map((row) => ({ ...row }));
  const lotAfter = lotReceipts(drafted);
  const lotUntouched = lotBefore.length === lotAfter.length
    && lotBefore.every((row, index) => JSON.stringify(row) === JSON.stringify(lotAfter[index]));
  if (!lotUntouched) throw new LegacySignalRollback('lot');
  if (drafted.cash.length !== state.cash.length || drafted.contracts.length !== state.contracts.length) {
    throw new LegacySignalRollback('links');
  }
  const audit: LegacySignalAudit = {
    id: `audit-${state.audits.length + 1}`,
    tenantId: state.sale.tenantId,
    companyId: state.sale.companyId || state.sale.tenantId,
    saleId: state.sale.id,
    receiptId: original.id,
    requestKey: request.requestKey,
    actorUserId: actor.id,
    reason: request.reason.trim(),
    fingerprint,
    before: preview.before!,
    after: preview.after,
    createdAt: options?.now || '2026-11-17T12:00:00.000Z',
  };
  if (options?.failAt === 'audit') throw new LegacySignalRollback('audit');
  return {
    state: { ...drafted, audits: [...state.audits, audit] },
    result: result({
      ok: true,
      code: 'applied',
      message: 'Sinal regularizado sem lançamento de caixa.',
      receiptId: original.id,
      createdInstallmentCount: request.installments.length,
      before: preview.before,
      after: financialPicture({ ...drafted, audits: [...state.audits, audit] }),
      auditId: audit.id,
    }),
  };
}

/** Fila por venda: a segunda execução espera a primeira e não duplica parcelas. */
export function createLegacySignalGate(initial: LegacySignalState) {
  let current = initial;
  let chain: Promise<void> = Promise.resolve();
  return {
    read: () => current,
    execute(actor: LegacySignalActor, request: LegacySignalRequest, options?: { failAt?: 'after_update' | 'after_insert' | 'audit' }) {
      const run = chain.then(() => {
        try {
          const executed = executeLegacySignalRegularization(current, actor, request, options);
          current = executed.state;
          return executed.result;
        } catch (error) {
          if (error instanceof LegacySignalRollback) {
            return result({
              ok: false,
              code: 'rolled_back',
              message: error.message,
              before: financialPicture(current),
            });
          }
          throw error;
        }
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}
