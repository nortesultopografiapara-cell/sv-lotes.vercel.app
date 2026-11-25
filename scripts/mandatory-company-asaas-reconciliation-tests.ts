/**
 * Conciliação Company Asaas → finance_receipts + cash_movements.
 * npx tsx scripts/mandatory-company-asaas-reconciliation-tests.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import {
  assessCompanyAsaasChargeBinding,
  CompanyAsaasReconciliationError,
  companyAsaasWebhookSettlementDisposition,
  ensureCompanyAsaasInstallmentReconciled,
  executeCompanyAsaasPaymentReconciliation,
  FINANCE_RECEIPT_PAID_STATUS,
  forceCompanyAsaasPaidInstallmentReconciliation,
  isCompanyAsaasChargeFullyReconciled,
  isReceiptPaidStatus,
  markFinanceReceiptPaidFromCompanyAsaasCharge,
  needsCompanyAsaasReceiptReconciliation,
} from '../lib/finance/companyAsaasPaymentReconciliation';
import { verifyCompanyAsaasWebhookToken } from '../lib/finance/companyAsaasWebhookHandler';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

type ReceiptRow = {
  id: string;
  status: string;
  amount: number;
  paid_amount?: number | null;
  paid_at?: string | null;
  installment_number?: number;
  sale_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  company_id?: string | null;
  tenant_id?: string | null;
};

type ChargeRow = {
  id: string;
  company_id: string;
  installment_id: string;
  asaas_payment_id: string;
  status: string;
  value: number;
  paid_at?: string | null;
  cash_movement_id?: string | null;
  raw_payload?: Record<string, unknown>;
  financial_account_id?: string | null;
};

type CashMovementRow = Record<string, unknown>;

function createMockAdmin(initial: {
  receipts: Record<string, ReceiptRow>;
  charges: Record<string, ChargeRow>;
  cashMovements?: CashMovementRow[];
  failCashInsert?: boolean;
}) {
  const receipts = { ...initial.receipts };
  const charges = { ...initial.charges };
  const cashMovements: CashMovementRow[] = [...(initial.cashMovements ?? [])];
  const failCashInsert = initial.failCashInsert ?? false;

  const admin = {
    from(table: string) {
      const ctx: {
        table: string;
        filters: Array<{ col: string; val: unknown }>;
        order?: { col: string; asc: boolean };
        limitN?: number;
        op: 'select' | 'update' | 'insert';
        updatePayload?: Record<string, unknown>;
        insertPayload?: Record<string, unknown>;
      } = {
        table,
        filters: [],
        op: 'select',
      };

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.filters.push({ col, val });
          return builder;
        },
        filter(col: string, _op: string, val: unknown) {
          ctx.filters.push({ col, val });
          return builder;
        },
        in(col: string, vals: unknown[]) {
          ctx.filters.push({ col, vals });
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          ctx.order = { col, asc: opts?.ascending ?? true };
          return builder;
        },
        limit(n: number) {
          ctx.limitN = n;
          return builder;
        },
        update(payload: Record<string, unknown>) {
          ctx.op = 'update';
          ctx.updatePayload = payload;
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          ctx.op = 'insert';
          ctx.insertPayload = payload;
          return builder;
        },
        maybeSingle: async () => execute(ctx, true),
        single: async () => {
          const result = await execute(ctx, false);
          if (result && typeof result === 'object' && 'error' in result && result.error) {
            return result;
          }
          if (!result.data) throw new Error('single() sem linha');
          return result;
        },
        then(
          resolve: (value: { data: unknown; error: null }) => void,
          reject?: (reason: unknown) => void,
        ) {
          execute(ctx, false).then(resolve, reject);
        },
      };

      async function execute(
        state: typeof ctx,
        maybeSingle: boolean,
      ): Promise<{ data: unknown; error: null }> {
        if (state.table === 'finance_receipts') {
          if (state.op === 'update') {
            const idFilter = state.filters.find((f) => f.col === 'id');
            const id = String(idFilter?.val || '');
            const row = receipts[id];
            if (!row) return { data: maybeSingle ? null : [], error: null };
            Object.assign(row, state.updatePayload);
            const data = maybeSingle ? row : [row];
            return { data, error: null };
          }

          const idFilter = state.filters.find((f) => f.col === 'id');
          if (idFilter) {
            const row = receipts[String(idFilter.val)];
            return { data: maybeSingle ? row ?? null : row ? [row] : [], error: null };
          }
        }

        if (state.table === 'company_asaas_charges') {
          if (state.op === 'update') {
            const idFilter = state.filters.find((f) => f.col === 'id');
            const companyFilter = state.filters.find((f) => f.col === 'company_id');
            const id = String(idFilter?.val || '');
            const row = charges[id];
            if (!row || (companyFilter && row.company_id !== companyFilter.val)) {
              return { data: maybeSingle ? null : [], error: null };
            }
            const payload = state.updatePayload ?? {};
            if (payload.status !== undefined) row.status = String(payload.status);
            if (payload.paid_at !== undefined) row.paid_at = payload.paid_at as string | null;
            if (payload.cash_movement_id !== undefined) {
              row.cash_movement_id = payload.cash_movement_id as string | null;
            }
            if (payload.raw_payload !== undefined) {
              row.raw_payload = payload.raw_payload as Record<string, unknown>;
            }
            return { data: maybeSingle ? row : [row], error: null };
          }

          let rows = Object.values(charges);
          for (const filter of state.filters) {
            if ('vals' in filter) continue;
            rows = rows.filter((row) => (row as Record<string, unknown>)[filter.col] === filter.val);
          }
          if (state.order?.col === 'created_at') {
            rows = [...rows].reverse();
          }
          if (state.limitN) rows = rows.slice(0, state.limitN);
          return { data: maybeSingle ? rows[0] ?? null : rows, error: null };
        }

        if (state.table === 'cash_movements') {
          if (state.op === 'insert') {
            if (failCashInsert) {
              return {
                data: null,
                error: { message: 'column cash_movements.finance_receipt_id does not exist', code: '42703' },
              } as { data: null; error: { message: string; code: string } };
            }
            const payload = state.insertPayload ?? {};
            const meta = (payload.metadata as Record<string, unknown> | undefined) ?? {};
            const chargeId = String(meta.charge_id || '');
            const provider = String(meta.provider || '');
            if (provider === 'ASAAS_COMPANY' && chargeId) {
              const duplicate = cashMovements.find((row) => {
                const rowMeta = (row.metadata as Record<string, unknown> | undefined) ?? {};
                return (
                  String(row.company_id || '') === String(payload.company_id || '') &&
                  String(row.type || '') === 'entrada' &&
                  String(row.status || 'ativo') === 'ativo' &&
                  String(rowMeta.provider || '') === 'ASAAS_COMPANY' &&
                  String(rowMeta.charge_id || '') === chargeId
                );
              });
              if (duplicate) {
                return {
                  data: null,
                  error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                } as { data: null; error: { message: string; code: string } };
              }
            }
            const row = {
              id: `cm-${cashMovements.length + 1}`,
              ...(payload),
            };
            cashMovements.push(row);
            return { data: row, error: null };
          }

          let rows = cashMovements.filter((row) => {
            return state.filters.every((filter) => {
              if ('vals' in filter) return false;
              const col = filter.col;
              const val = filter.val;
              if (col.startsWith('metadata->>')) {
                const metaKey = col.replace('metadata->>', '');
                const meta = (row.metadata as Record<string, unknown> | undefined) ?? {};
                return String(meta[metaKey] ?? '') === String(val);
              }
              return row[col] === val;
            });
          });
          return { data: maybeSingle ? rows[0] ?? null : rows, error: null };
        }

        return { data: maybeSingle ? null : [], error: null };
      }

      return builder;
    },
  };

  return {
    admin: admin as unknown as SupabaseClient,
    receipts,
    charges,
    cashMovements,
  };
}

const baseCharge = (): CompanyAsaasChargeResponse => ({
  id: 'charge-1',
  companyId: 'company-1',
  customerId: 'cust-1',
  saleId: 'sale-1',
  installmentId: 'receipt-entrada',
  asaasPaymentId: 'pay_asaas_1',
  billingType: 'PIX',
  status: 'PAID',
  value: 5,
  dueDate: '2026-06-01',
  invoiceUrl: null,
  bankSlipUrl: null,
  bankSlipIdentification: null,
  pixQrCode: null,
  pixCopyPaste: null,
  paymentLink: null,
  paidAt: '2026-06-08T12:00:00Z',
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-08T12:00:00Z',
});

function testFinanceReceiptPaidStatusMatchesManualFinance() {
  assert(FINANCE_RECEIPT_PAID_STATUS === 'pago', 'status manual do Financeiro é pago');
  assert(isReceiptPaidStatus('pago'), 'isReceiptPaidStatus pago');
  assert(isReceiptPaidStatus('PAID'), 'isReceiptPaidStatus PAID');
  console.log('OK testFinanceReceiptPaidStatusMatchesManualFinance');
}

function testNeedsReceiptReconciliation() {
  assert(
    needsCompanyAsaasReceiptReconciliation({
      chargeStatus: 'PAID',
      receiptStatus: 'pendente',
    }),
    'PAID + pendente precisa conciliar',
  );
  assert(
    !needsCompanyAsaasReceiptReconciliation({
      chargeStatus: 'PAID',
      receiptStatus: 'pago',
    }),
    'PAID + pago não precisa',
  );
  console.log('OK testNeedsReceiptReconciliation');
}

async function testUpdateZeroRowsThrows() {
  const mock = createMockAdmin({ receipts: {}, charges: {} });
  let threw = false;
  try {
    await markFinanceReceiptPaidFromCompanyAsaasCharge(mock.admin, {
      installmentId: 'missing-receipt',
      paidAmount: 5,
      paidAt: '2026-06-08T12:00:00Z',
      chargeId: 'charge-x',
    });
  } catch (err) {
    threw = err instanceof CompanyAsaasReconciliationError;
  }
  assert(threw, 'CompanyAsaasReconciliationError quando parcela ausente');
  console.log('OK testUpdateZeroRowsThrows');
}

async function testForceReconcileBackfillChargesList() {
  const mock = createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 5,
        installment_number: 0,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
      },
    },
    charges: {
      'charge-1': {
        id: 'charge-1',
        company_id: 'company-1',
        installment_id: 'receipt-entrada',
        asaas_payment_id: 'pay_asaas_1',
        status: 'PAID',
        value: 5,
        paid_at: '2026-06-08T12:00:00Z',
      },
    },
  });

  const result = await forceCompanyAsaasPaidInstallmentReconciliation(
    mock.admin,
    'company-1',
    'receipt-entrada',
    { eventType: 'CHARGES_LIST_SYNC' },
  );

  assert(result.ok, 'force reconcile ok');
  assert(mock.receipts['receipt-entrada'].status === FINANCE_RECEIPT_PAID_STATUS, 'status pago');
  console.log('OK testForceReconcileBackfillChargesList');
}

async function testMarkFinanceReceiptUsesInstallmentId() {
  const mock = createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 5,
        installment_number: 0,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
      },
    },
    charges: {},
  });

  const updated = await markFinanceReceiptPaidFromCompanyAsaasCharge(mock.admin, {
    installmentId: 'receipt-entrada',
    paidAmount: 5,
    paidAt: '2026-06-08T12:00:00Z',
  });

  assert(updated, 'retorna true quando atualiza');
  assert(mock.receipts['receipt-entrada'].status === 'pago', 'status pago');
  assert(Number(mock.receipts['receipt-entrada'].paid_amount) === 5, 'paid_amount 5');
  assert(Boolean(mock.receipts['receipt-entrada'].paid_at), 'paid_at preenchido');
  console.log('OK testMarkFinanceReceiptUsesInstallmentId');
}

async function testEnsureReconcileUpdatesPendingReceipt() {
  const mock = createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 5,
        installment_number: 0,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
      },
    },
    charges: {
      'charge-1': {
        id: 'charge-1',
        company_id: 'company-1',
        installment_id: 'receipt-entrada',
        asaas_payment_id: 'pay_asaas_1',
        status: 'PAID',
        value: 5,
        paid_at: '2026-06-08T12:00:00Z',
      },
    },
  });

  const result = await ensureCompanyAsaasInstallmentReconciled(
    mock.admin,
    'company-1',
    'receipt-entrada',
  );

  assert(result.ok, 'conciliação ok');
  assert(result.receiptUpdated, 'receiptUpdated true');
  assert(result.installmentId === 'receipt-entrada', 'usa installment_id');
  assert(isReceiptPaidStatus(mock.receipts['receipt-entrada'].status), 'parcela paga');
  assert(mock.cashMovements.length === 1, 'cash_movement criado');
  assert(
    mock.cashMovements[0].metadata &&
      (mock.cashMovements[0].metadata as Record<string, unknown>).charge_id === 'charge-1' &&
      (mock.cashMovements[0].metadata as Record<string, unknown>).receipt_id === 'receipt-entrada',
    'cash_movement idempotente por metadata.charge_id (schema sem finance_receipt_id)',
  );
  console.log('OK testEnsureReconcileUpdatesPendingReceipt');
}

async function testEnsureReconcileCashMovementIdempotent() {
  const mock = createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 5,
        installment_number: 0,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
      },
    },
    charges: {
      'charge-1': {
        id: 'charge-1',
        company_id: 'company-1',
        installment_id: 'receipt-entrada',
        asaas_payment_id: 'pay_asaas_1',
        status: 'PAID',
        value: 5,
        paid_at: '2026-06-08T12:00:00Z',
      },
    },
    cashMovements: [],
  });

  const first = await ensureCompanyAsaasInstallmentReconciled(
    mock.admin,
    'company-1',
    'receipt-entrada',
  );
  assert(first.ok && mock.cashMovements.length === 1, 'primeira conciliação cria caixa');

  mock.receipts['receipt-entrada'].status = 'pendente';
  mock.receipts['receipt-entrada'].paid_amount = null;
  mock.receipts['receipt-entrada'].paid_at = null;

  const second = await ensureCompanyAsaasInstallmentReconciled(
    mock.admin,
    'company-1',
    'receipt-entrada',
  );

  assert(second.ok, 'segunda conciliação ok');
  assert(mock.cashMovements.length === 1, 'não duplica cash_movement');
  assert(
    isCompanyAsaasChargeFullyReconciled({
      chargeStatus: 'PAID',
      receiptStatus: mock.receipts['receipt-entrada'].status,
      cashMovementId: String(mock.cashMovements[0].id),
    }),
    'totalmente conciliado após segunda passagem',
  );
  console.log('OK testEnsureReconcileCashMovementIdempotent');
}

async function testUpdateFailureWhenReceiptMissing() {
  const mock = createMockAdmin({ receipts: {}, charges: {} });
  let threw = false;
  try {
    await markFinanceReceiptPaidFromCompanyAsaasCharge(mock.admin, {
      installmentId: 'missing-receipt',
      paidAmount: 5,
      paidAt: '2026-06-08T12:00:00Z',
    });
  } catch (err) {
    threw = err instanceof Error && err.message.includes('não encontrada');
  }
  assert(threw, 'lança erro quando parcela não existe');
  console.log('OK testUpdateFailureWhenReceiptMissing');
}

function testChargeUsesInstallmentIdField() {
  const charge = baseCharge();
  assert(charge.installmentId === 'receipt-entrada', 'installmentId mapeado da charge');
  console.log('OK testChargeUsesInstallmentIdField');
}

async function testCashMovementFailureDoesNotBlockReceipt() {
  const mock = createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 5,
        installment_number: 0,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
      },
    },
    charges: {
      'charge-1': {
        id: 'charge-1',
        company_id: 'company-1',
        installment_id: 'receipt-entrada',
        asaas_payment_id: 'pay_asaas_1',
        status: 'PAID',
        value: 5,
        paid_at: '2026-06-08T12:00:00Z',
      },
    },
    failCashInsert: true,
  });

  const result = await ensureCompanyAsaasInstallmentReconciled(
    mock.admin,
    'company-1',
    'receipt-entrada',
  );

  assert(result.ok, 'conciliação ok mesmo com falha de caixa');
  assert(result.receiptUpdated, 'parcela baixada');
  assert(isReceiptPaidStatus(mock.receipts['receipt-entrada'].status), 'status pago');
  assert(mock.cashMovements.length === 0, 'nenhum cash_movement criado');
  assert(Boolean(result.cashMovementError), 'cashMovementError preenchido');
  console.log('OK testCashMovementFailureDoesNotBlockReceipt');
}

function pendingChargeFixture(status = 'PENDING') {
  return createMockAdmin({
    receipts: {
      'receipt-entrada': {
        id: 'receipt-entrada',
        status: 'pendente',
        amount: 500,
        installment_number: 1,
        sale_id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
        company_id: 'company-1',
        tenant_id: 'company-1',
      },
    },
    charges: {
      'charge-1': {
        id: 'charge-1',
        company_id: 'company-1',
        installment_id: 'receipt-entrada',
        asaas_payment_id: 'pay_asaas_1',
        status,
        value: 500,
        financial_account_id: 'acc-rocha',
        paid_at: null,
      },
    },
  });
}

async function settlePending(eventType: string, financialAccountId?: string) {
  const mock = pendingChargeFixture();
  const result = await executeCompanyAsaasPaymentReconciliation(mock.admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType,
    paidAt: '2026-11-05T17:39:03.000Z',
    financialAccountId: financialAccountId ?? null,
  });
  return { mock, result };
}

async function testPendingPaymentConfirmedAndReceived() {
  const confirmed = await settlePending('PAYMENT_CONFIRMED');
  assert(confirmed.result.ok, 'CONFIRMED baixa cobrança PENDING');
  assert(confirmed.result.reason === undefined, 'CONFIRMED não é cobrança ausente');
  assert(confirmed.mock.charges['charge-1'].status === 'PAID', 'cobrança PAID');
  assert(confirmed.mock.receipts['receipt-entrada'].status === 'pago', 'parcela paga');
  assert(confirmed.mock.cashMovements.length === 1, 'um caixa no CONFIRMED');

  const received = await executeCompanyAsaasPaymentReconciliation(confirmed.mock.admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T20:09:22.000Z',
  });
  assert(received.ok, 'RECEIVED seguinte ok');
  assert(received.duplicate, 'RECEIVED é reenvio da mesma baixa');
  assert(confirmed.mock.cashMovements.length === 1, 'CONFIRMED e RECEIVED não duplicam caixa');
  assert(
    companyAsaasWebhookSettlementDisposition(received).status === 'DUPLICATE',
    'reenvio fica DUPLICATE',
  );
  console.log('OK testPendingPaymentConfirmedAndReceived');
}

async function testSameEventRedispatchAfterPartialCashFailure() {
  const first = pendingChargeFixture();
  const failed = await executeCompanyAsaasPaymentReconciliation(first.admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T17:39:03.000Z',
  });
  assert(failed.ok && first.cashMovements.length === 1, 'primeira passagem cria a baixa');

  first.cashMovements.splice(0, 1);
  first.charges['charge-1'].cash_movement_id = null;
  const disposition = companyAsaasWebhookSettlementDisposition({
    ok: true,
    duplicate: false,
    chargeId: 'charge-1',
    cashMovementError: 'caixa indisponível',
  });
  assert(disposition.status === 'FAILED', 'falha de caixa pede repetição');

  const retried = await executeCompanyAsaasPaymentReconciliation(first.admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T17:39:03.000Z',
  });
  assert(retried.ok, 'repetição conclui');
  assert(first.receipts['receipt-entrada'].status === 'pago', 'parcela permanece paga');
  assert(first.cashMovements.length === 1, 'repetição cria o único caixa');
  assert(first.charges['charge-1'].cash_movement_id === first.cashMovements[0].id, 'cobrança aponta o caixa');
  console.log('OK testSameEventRedispatchAfterPartialCashFailure');
}

async function testConcurrentWebhookAndReconciliationShareOneCashMovement() {
  const mock = pendingChargeFixture();
  const [webhook, manual] = await Promise.all([
    executeCompanyAsaasPaymentReconciliation(mock.admin, {
      companyId: 'company-1',
      asaasPaymentId: 'pay_asaas_1',
      eventType: 'PAYMENT_CONFIRMED',
      paidAt: '2026-11-05T17:39:03.000Z',
    }),
    executeCompanyAsaasPaymentReconciliation(mock.admin, {
      companyId: 'company-1',
      asaasPaymentId: 'pay_asaas_1',
      eventType: 'PAYMENT_RECEIVED',
      paidAt: '2026-11-05T17:39:03.000Z',
    }),
  ]);
  assert(webhook.ok && manual.ok, 'webhook e conciliação concluem');
  assert(mock.cashMovements.length === 1, 'índice único deixa um caixa');
  assert(webhook.cashMovementId === manual.cashMovementId, 'os dois lados usam o mesmo caixa');
  assert(mock.charges['charge-1'].status === 'PAID', 'cobrança PAID');
  assert(mock.receipts['receipt-entrada'].status === 'pago', 'parcela paga uma vez');
  console.log('OK testConcurrentWebhookAndReconciliationShareOneCashMovement');
}

async function testWrongCompanyOrAccountDoesNotSettle() {
  const otherCompany = await executeCompanyAsaasPaymentReconciliation(pendingChargeFixture().admin, {
    companyId: 'company-2',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T17:39:03.000Z',
  });
  assert(!otherCompany.ok && otherCompany.reason === 'charge_not_found', 'outra empresa não acha a cobrança');
  assert(
    companyAsaasWebhookSettlementDisposition(otherCompany).reason === 'charge_not_found',
    'motivo reservado para vínculo ausente',
  );

  const wrongAccount = await executeCompanyAsaasPaymentReconciliation(pendingChargeFixture().admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T17:39:03.000Z',
    financialAccountId: 'acc-outra',
  });
  assert(!wrongAccount.ok && wrongAccount.reason === 'account_mismatch', 'conta errada não baixa');
  assert(
    companyAsaasWebhookSettlementDisposition(wrongAccount).reason === 'account_mismatch',
    'conta errada não vira cobrança ausente',
  );

  const wrongReceipt = pendingChargeFixture();
  wrongReceipt.receipts['receipt-entrada'].company_id = 'company-2';
  wrongReceipt.receipts['receipt-entrada'].tenant_id = 'company-2';
  const mismatch = await executeCompanyAsaasPaymentReconciliation(wrongReceipt.admin, {
    companyId: 'company-1',
    asaasPaymentId: 'pay_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    paidAt: '2026-11-05T17:39:03.000Z',
  });
  assert(!mismatch.ok && mismatch.reason === 'company_mismatch', 'parcela de outra empresa não baixa');
  assert(wrongReceipt.charges['charge-1'].status === 'PENDING', 'cobrança permanece PENDING');
  assert(wrongReceipt.cashMovements.length === 0, 'sem caixa');

  const request = new Request('https://example.test/hook', { headers: { 'asaas-access-token': 'outro' } });
  assert(!verifyCompanyAsaasWebhookToken(request, 'token-da-conta'), 'token de outra conta é recusado');
  assert(
    assessCompanyAsaasChargeBinding({
      requestCompanyId: 'company-1',
      chargeCompanyId: 'company-1',
      chargeFinancialAccountId: 'acc-rocha',
      requestFinancialAccountId: 'acc-rocha',
      chargeInstallmentId: 'receipt-entrada',
      receiptId: 'receipt-entrada',
      receiptCompanyId: 'company-1',
    }) === 'ok',
    'vínculo correto passa',
  );
  console.log('OK testWrongCompanyOrAccountDoesNotSettle');
}

function testMigrationRejectsLegacyDuplicatesBeforeUniqueIndex() {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261125190000_company_asaas_charge_cash_unique.sql'),
    'utf8',
  );
  assert(sql.includes('RAISE EXCEPTION'), 'migration recusa legado duplicado');
  assert(sql.includes('idx_cash_movements_company_asaas_charge_unique'), 'índice da cobrança Asaas');
  assert(sql.includes("metadata->>'charge_id'"), 'unicidade por charge_id');
  assert(sql.includes("metadata->>'provider' = 'ASAAS_COMPANY'"), 'só o provider da cobrança');
  console.log('OK testMigrationRejectsLegacyDuplicatesBeforeUniqueIndex');
}

async function main() {
  testFinanceReceiptPaidStatusMatchesManualFinance();
  testNeedsReceiptReconciliation();
  testChargeUsesInstallmentIdField();
  await testMarkFinanceReceiptUsesInstallmentId();
  await testEnsureReconcileUpdatesPendingReceipt();
  await testEnsureReconcileCashMovementIdempotent();
  await testCashMovementFailureDoesNotBlockReceipt();
  await testUpdateFailureWhenReceiptMissing();
  await testUpdateZeroRowsThrows();
  await testForceReconcileBackfillChargesList();
  await testPendingPaymentConfirmedAndReceived();
  await testSameEventRedispatchAfterPartialCashFailure();
  await testConcurrentWebhookAndReconciliationShareOneCashMovement();
  await testWrongCompanyOrAccountDoesNotSettle();
  testMigrationRejectsLegacyDuplicatesBeforeUniqueIndex();
  console.log('mandatory-company-asaas-reconciliation-tests: all passed');
}

void main();
