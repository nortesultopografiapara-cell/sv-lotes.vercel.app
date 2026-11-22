/**
 * Baixa C6 simulada. Nenhum HTTP e nenhum dado real.
 * npx tsx scripts/mandatory-c6-settlement-guard-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  readConfirmedC6Payment,
  readOfficialC6BankSlip,
  settleC6PaidSlip,
} from '../lib/banking/c6/c6PaymentSettlement';
import { applyC6SettlementTransaction } from '../lib/banking/c6/c6SettlementTransaction';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Row = Record<string, unknown> & { id?: string };

function store() {
  const tables: Record<string, Row[]> = {
    finance_receipts: [
      {
        id: 'receipt-1',
        company_id: COMPANY,
        tenant_id: COMPANY,
        sale_id: 'sale-1',
        customer_id: 'customer-1',
        project_id: 'project-1',
        financial_account_id: 'fa-1',
        amount: 10.5,
        status: 'pendente',
        installment_number: 2,
      },
    ],
    company_financial_accounts: [
      { id: 'fa-1', company_id: COMPANY, bank_integration_id: 'int-1' },
    ],
    bank_integrations: [{ id: 'int-1', company_id: COMPANY, provider: 'C6' }],
    bank_charges: [
      {
        id: 'charge-1',
        company_id: COMPANY,
        provider: 'C6',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        finance_receipt_id: 'receipt-1',
        external_id: 'slip-1',
        status: 'REGISTERED',
      },
    ],
    cash_movements: [],
    audit_logs: [],
  };
  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as Array<[string, unknown]>,
      inFilters: [] as Array<[string, unknown[]]>,
      payload: null as Row | null,
      one: false,
    };
    const matchesOf = () =>
      (tables[table] || []).filter(
        (row) =>
          state.filters.every(([key, value]) => row[key] === value) &&
          state.inFilters.every(([key, values]) => values.includes(row[key])),
      );
    const exec = () => {
      const rows = tables[table] || (tables[table] = []);
      const matches = matchesOf();
      if (state.op === 'insert' && state.payload) {
        const row = { id: `${table}-${rows.length + 1}`, ...state.payload };
        rows.push(row);
        return { data: state.one ? row : [row], error: null };
      }
      if (state.op === 'update' && state.payload) {
        for (const row of matches) Object.assign(row, state.payload);
        return { data: state.one ? matches[0] || null : matches, error: null };
      }
      if (state.one) return { data: matches[0] || null, error: null };
      return { data: matches, error: null };
    };
    const api = {
      select() {
        return api;
      },
      eq(key: string, value: unknown) {
        state.filters.push([key, value]);
        return api;
      },
      in(key: string, values: unknown[]) {
        state.inFilters.push([key, values]);
        return api;
      },
      insert(payload: Row) {
        state.op = 'insert';
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = 'update';
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        state.one = true;
        return exec();
      },
      single() {
        state.one = true;
        return exec();
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(exec()).then(resolve, reject);
      },
    };
    return api;
  }
  const admin = {
    from,
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== 'settle_company_c6_bank_slip') {
        return { data: null, error: { message: 'rpc desconhecida' } };
      }
      try {
        const result = await applyC6SettlementTransaction(tables, {
          companyId: String(args.p_company_id || ''),
          chargeId: String(args.p_charge_id || ''),
          receiptId: String(args.p_receipt_id || ''),
          integrationId: String(args.p_integration_id || ''),
          financialAccountId: String(args.p_financial_account_id || ''),
          bankSlipId: String(args.p_bank_slip_id || ''),
          paidAmount: Number(args.p_paid_amount),
          paidOn: String(args.p_paid_on || ''),
        });
        return { data: result, error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : 'falha' } };
      }
    },
  };
  return { admin, tables };
}

function charge(companyId = COMPANY) {
  return {
    id: 'charge-1',
    company_id: companyId,
    provider: 'C6',
    integration_id: 'int-1',
    financial_account_id: 'fa-1',
    finance_receipt_id: 'receipt-1',
    external_id: 'slip-1',
    customer_id: 'customer-1',
    sale_id: 'sale-1',
  };
}

function paidSlip(amount = 10.5) {
  return readOfficialC6BankSlip({
    id: 'slip-1',
    status: 'PAID',
    amount: 10.5,
    payments: [{ date: '2026-12-21', amount }],
  });
}

async function main() {
  const legacy = readOfficialC6BankSlip({
    id: 'slip-1',
    status: 'PAID',
    amount: 10.5,
    payments: [{ date: '2026-12-21', amount: 10.5 }],
  });
  const current = readOfficialC6BankSlip({
    id: 'slip-1',
    status: 'PAID',
    amount: 10.5,
    payment_amount: 10.5,
    payment_date: '2026-12-21',
  });
  assert(readConfirmedC6Payment(legacy!)?.amount === 10.5, 'payments[] 1.7.2 confirma o valor');
  assert(readConfirmedC6Payment(current!)?.paidAt === '2026-12-21', 'payment_date 1.7.3 confirma a data');
  const faceOnly = readOfficialC6BankSlip({ id: 'slip-1', status: 'PAID', amount: 10.5 });
  assert(readConfirmedC6Payment(faceOnly!) === null, 'o valor de face não confirma o pagamento');
  const disagree = readOfficialC6BankSlip({
    id: 'slip-1',
    status: 'PAID',
    payments: [{ date: '2026-12-21', amount: 10.5 }],
    payment_amount: 9,
    payment_date: '2026-12-21',
  });
  assert(readConfirmedC6Payment(disagree!) === null, 'payments[] e payment_amount divergentes não confirmam');
  const created = readOfficialC6BankSlip({ id: 'slip-1', status: 'CREATED', amount: 10.5 });
  assert(created?.status === 'CREATED' && readConfirmedC6Payment(created!) === null, 'CREATED não está pago');

  const paid = store();
  const settled = await settleC6PaidSlip(paid.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: paidSlip()!,
  });
  assert(settled.paid && paid.tables.finance_receipts[0].status === 'pago', 'PAID válido baixa a parcela');
  assert(paid.tables.cash_movements.length === 1, 'PAID válido gera um caixa');

  const open = store();
  const waiting = await settleC6PaidSlip(open.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: created!,
  });
  assert(!waiting.paid && open.tables.finance_receipts[0].status === 'pendente', 'CREATED não baixa');
  assert(open.tables.cash_movements.length === 0, 'CREATED não gera caixa');

  const cancelled = store();
  cancelled.tables.finance_receipts[0].status = 'cancelado';
  const cancelledResult = await settleC6PaidSlip(cancelled.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: paidSlip()!,
  });
  assert(!cancelledResult.paid && cancelled.tables.finance_receipts[0].status === 'cancelado', 'cancelada não baixa');
  assert(cancelled.tables.cash_movements.length === 0, 'cancelada não gera caixa');

  const reversed = store();
  reversed.tables.cash_movements.push({
    id: 'cash-old',
    company_id: COMPANY,
    type: 'entrada',
    status: 'estornado',
    metadata: { installment_id: 'receipt-1', provider: 'C6', bank_charge_id: 'charge-1' },
  });
  const reversedResult = await settleC6PaidSlip(reversed.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: paidSlip()!,
  });
  assert(!reversedResult.paid && reversed.tables.finance_receipts[0].status === 'pendente', 'estornada não baixa');
  assert(reversed.tables.cash_movements.length === 1, 'estornada não gera novo caixa');

  const quitada = store();
  quitada.tables.finance_receipts[0].status = 'pago';
  const quitadaResult = await settleC6PaidSlip(quitada.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: paidSlip()!,
  });
  assert(!quitadaResult.paid && quitada.tables.cash_movements.length === 0, 'já quitada sem esta conciliação não baixa de novo');

  const replay = store();
  await settleC6PaidSlip(replay.admin as never, { companyId: COMPANY, charge: charge(), slip: paidSlip()! });
  const second = await settleC6PaidSlip(replay.admin as never, { companyId: COMPANY, charge: charge(), slip: paidSlip()! });
  assert(second.duplicate && replay.tables.cash_movements.length === 1, 'a mesma conciliação repetida não duplica o caixa');

  const divergent = store();
  const divergentResult = await settleC6PaidSlip(divergent.admin as never, {
    companyId: COMPANY,
    charge: charge(),
    slip: paidSlip(1)!,
  });
  assert(divergentResult.divergent && divergent.tables.finance_receipts[0].status === 'pendente', 'valor divergente não baixa');

  const foreign = store();
  const foreignResult = await settleC6PaidSlip(foreign.admin as never, {
    companyId: COMPANY,
    charge: charge(OTHER),
    slip: paidSlip()!,
  });
  assert(!foreignResult.paid && foreign.tables.cash_movements.length === 0, 'empresa divergente não baixa');

  const race = store();
  const [firstRace, secondRace] = await Promise.all([
    settleC6PaidSlip(race.admin as never, { companyId: COMPANY, charge: charge(), slip: paidSlip()! }),
    settleC6PaidSlip(race.admin as never, { companyId: COMPANY, charge: charge(), slip: paidSlip()! }),
  ]);
  const winners = [firstRace, secondRace].filter((item) => item.paid && !item.duplicate);
  assert(winners.length === 1 && race.tables.cash_movements.length === 1, 'duas tentativas simultâneas geram uma baixa');
  assert(race.tables.finance_receipts[0].status === 'pago', 'a parcela simultânea fica paga uma vez');

  const beforeCash = store();
  let beforeError = '';
  try {
    await applyC6SettlementTransaction(beforeCash.tables, {
      companyId: COMPANY,
      chargeId: 'charge-1',
      receiptId: 'receipt-1',
      integrationId: 'int-1',
      financialAccountId: 'fa-1',
      bankSlipId: 'slip-1',
      paidAmount: 10.5,
      paidOn: '2026-12-21',
      failBeforeCash: true,
    });
  } catch (error) {
    beforeError = error instanceof Error ? error.message : '';
  }
  assert(beforeError.includes('antes do caixa'), 'falha antes do caixa é recusada');
  assert(beforeCash.tables.finance_receipts[0].status === 'pendente', 'falha antes do caixa desfaz a parcela');
  assert(beforeCash.tables.cash_movements.length === 0, 'falha antes do caixa não lança entrada');

  const duringCash = store();
  let duringError = '';
  try {
    await applyC6SettlementTransaction(duringCash.tables, {
      companyId: COMPANY,
      chargeId: 'charge-1',
      receiptId: 'receipt-1',
      integrationId: 'int-1',
      financialAccountId: 'fa-1',
      bankSlipId: 'slip-1',
      paidAmount: 10.5,
      paidOn: '2026-12-21',
      failDuringCash: true,
    });
  } catch (error) {
    duringError = error instanceof Error ? error.message : '';
  }
  assert(duringError.includes('durante o caixa'), 'falha no caixa é recusada');
  assert(duringCash.tables.finance_receipts[0].status === 'pendente', 'falha no caixa desfaz a parcela');
  assert(duringCash.tables.cash_movements.length === 0, 'falha no caixa não deixa entrada');
  assert(duringCash.tables.bank_charges[0].status === 'REGISTERED', 'falha no caixa não marca a cobrança');

  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261122140000_settle_company_c6_bank_slip.sql'),
    'utf8',
  );
  const settlement = fs.readFileSync(
    path.join(process.cwd(), 'lib/banking/c6/c6PaymentSettlement.ts'),
    'utf8',
  );
  assert(sql.includes('SECURITY DEFINER'), 'a função é SECURITY DEFINER');
  assert(sql.includes('FOR UPDATE'), 'a parcela é travada na transação');
  assert(!sql.includes('COMMIT'), 'a função não confirma no meio');
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.settle_company_c6_bank_slip") && sql.includes('TO service_role'), 'só service_role executa');
  assert(sql.includes('FROM anon, authenticated'), 'anon e authenticated não executam');
  assert(sql.includes("= 'estornado'") && !sql.includes("SET status = 'ativo'") , 'estorno não é reativado');
  assert(sql.includes('idx_cash_movements_c6_charge_unique'), 'o índice único está na migration');
  assert(sql.includes("COALESCE(status, 'ativo') = 'ativo'"), 'o índice ignora estorno');
  assert(!sql.includes('execute_authorized_manual_receipt_payment'), 'a baixa manual não é reutilizada');
  assert(settlement.includes('SETTLE_COMPANY_C6_BANK_SLIP_RPC'), 'a baixa chama a RPC');
  assert(!settlement.includes("from('cash_movements')"), 'a baixa não grava o caixa fora da RPC');

  console.log('C6_SETTLEMENT_GUARD_OK');
}

void main();
