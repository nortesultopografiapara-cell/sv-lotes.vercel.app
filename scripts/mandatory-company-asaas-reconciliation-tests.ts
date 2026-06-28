/**
 * Conciliação Company Asaas → finance_receipts + cash_movements.
 * npx tsx scripts/mandatory-company-asaas-reconciliation-tests.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import {
  CompanyAsaasReconciliationError,
  ensureCompanyAsaasInstallmentReconciled,
  FINANCE_RECEIPT_PAID_STATUS,
  forceCompanyAsaasPaidInstallmentReconciliation,
  isCompanyAsaasChargeFullyReconciled,
  isReceiptPaidStatus,
  markFinanceReceiptPaidFromCompanyAsaasCharge,
  needsCompanyAsaasReceiptReconciliation,
} from '../lib/finance/companyAsaasPaymentReconciliation';

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
};

type CashMovementRow = Record<string, unknown>;

function createMockAdmin(initial: {
  receipts: Record<string, ReceiptRow>;
  charges: Record<string, ChargeRow>;
  cashMovements?: CashMovementRow[];
}) {
  const receipts = { ...initial.receipts };
  const charges = { ...initial.charges };
  const cashMovements: CashMovementRow[] = [...(initial.cashMovements ?? [])];

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
            const row = {
              id: `cm-${cashMovements.length + 1}`,
              ...(state.insertPayload ?? {}),
            };
            cashMovements.push(row);
            return { data: row, error: null };
          }

          let rows = cashMovements.filter((row) => {
            return state.filters.every((filter) => {
              if ('vals' in filter) return false;
              return row[filter.col] === filter.val;
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
    mock.cashMovements[0].finance_receipt_id === 'receipt-entrada' &&
      mock.cashMovements[0].type === 'entrada',
    'cash_movement idempotente por finance_receipt_id (mesmo padrão do Financeiro)',
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

async function main() {
  testFinanceReceiptPaidStatusMatchesManualFinance();
  testNeedsReceiptReconciliation();
  testChargeUsesInstallmentIdField();
  await testMarkFinanceReceiptUsesInstallmentId();
  await testEnsureReconcileUpdatesPendingReceipt();
  await testEnsureReconcileCashMovementIdempotent();
  await testUpdateFailureWhenReceiptMissing();
  await testUpdateZeroRowsThrows();
  await testForceReconcileBackfillChargesList();
  console.log('mandatory-company-asaas-reconciliation-tests: all passed');
}

void main();
