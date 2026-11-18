/**
 * A edição da venda não insere nem atualiza parcela paga.
 * npx tsx scripts/mandatory-sale-edit-finance-no-settlement-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { planExplicitSeparateSignalEdit } from '../lib/saleEditFinanceRecalc';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function insertWouldSettle(item: {
  status?: string | null;
  paid_amount?: number | string | null;
  paid_at?: string | null;
}) {
  const status = String(item.status ?? '').trim().toLowerCase() || 'pendente';
  const rawAmount = item.paid_amount == null || item.paid_amount === '' ? 0 : Number(item.paid_amount);
  return status === 'pago' || status === 'paid' || status === 'paga'
    || Boolean(item.paid_at)
    || rawAmount !== 0;
}

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261118160000_sale_edit_finance_reject_paid_insert.sql'),
  'utf8',
);
const triggerSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql'),
  'utf8',
);
const contractSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261118150000_fix_replace_current_contract_version_existing_columns.sql'),
  'utf8',
);
const rejection = 'A edição da venda não quita parcela. A baixa continua no Financeiro, com autorização do Administrador Principal. Nenhuma alteração foi salva.';
const insertsAt = sql.indexOf('jsonb_array_elements(p_inserts)');
const insertSql = sql.slice(insertsAt);
const insertWriteAt = insertSql.indexOf('INSERT INTO public.finance_receipts');
const insertValues = insertSql.slice(insertWriteAt, insertSql.indexOf('v_group', insertWriteAt) + 10);
assert(insertsAt > 0 && insertWriteAt > 0, 'a inclusão de parcela está na função');
assert(insertSql.indexOf(rejection) > 0 && insertSql.indexOf(rejection) < insertWriteAt, 'a parcela paga é recusada antes da inclusão');
assert(insertValues.includes("'pendente'") && insertValues.includes('NULL'), 'a inclusão grava parcela pendente sem pagamento');
assert(!insertValues.includes("v_item->>'status'") && !insertValues.includes("v_item->>'paid_at'") && !insertValues.includes("v_item->>'paid_amount'"), 'a inclusão não copia status nem pagamento do pedido');
assert(sql.includes('paid_amount = paid_amount') && sql.includes('paid_at = paid_at'), 'a atualização não grava pagamento vindo da edição');
assert(!/CREATE TRIGGER|DROP TRIGGER/i.test(sql), 'o gatilho do Administrador Principal permanece fora desta correção');
assert(!sql.includes('DELETE FROM public.cash_movements') && !sql.includes('INSERT INTO public.cash_movements'), 'a edição não lança nem apaga caixa');
assert(triggerSql.includes('BEFORE UPDATE ON public.finance_receipts'), 'o gatilho continua bloqueando atualização');
assert(triggerSql.includes('Baixa manual de parcela só pode ser feita com autorização do Administrador Principal.'), 'a mensagem do Administrador Principal permanece');
assert(contractSql.includes('GRANT EXECUTE ON FUNCTION public.replace_current_contract_version(uuid, jsonb) TO service_role'), 'a regeneração final continua exclusiva do servidor');
assert(!contractSql.includes('v_new.superseded_by :='), 'a regeneração final não depende da coluna ausente');

assert(insertWouldSettle({ status: 'pendente', paid_amount: 0, paid_at: null }) === false, 'parcela pendente sem pagamento pode entrar');
assert(insertWouldSettle({ status: 'PAGO', paid_amount: 0, paid_at: null }) === true, 'status pago é recusado');
assert(insertWouldSettle({ status: 'paid', paid_amount: null, paid_at: null }) === true, 'status paid é recusado');
assert(insertWouldSettle({ status: 'paga', paid_amount: null, paid_at: null }) === true, 'status paga é recusado');
assert(insertWouldSettle({ status: 'pendente', paid_amount: 1500, paid_at: null }) === true, 'valor pago preenchido é recusado');
assert(insertWouldSettle({ status: 'pendente', paid_amount: 0, paid_at: '2026-11-18T03:00:00Z' }) === true, 'data de pagamento preenchida é recusada');
assert(insertWouldSettle({ status: 'pendente', paid_amount: null, paid_at: null }) === false, 'SIGNAL pendente sem baixa pode entrar');
assert(insertWouldSettle({ status: 'atrasado', paid_amount: 0, paid_at: '' }) === false, 'LOT em atraso continua editável');

const template = {
  tenant_id: 'tenant-ficticio',
  company_id: 'tenant-ficticio',
  sale_id: 'sale-ficticia',
  customer_id: 'customer-ficticio',
  installment_number: 1,
  amount: 571.88,
  due_date: '2027-03-20',
  status: 'pendente',
  schedule_group: 'LOT',
};
const plan = planExplicitSeparateSignalEdit({
  receipts: [{
    id: 'signal-0',
    installment_number: 0,
    amount: 3500,
    status: 'pendente',
    due_date: '2026-10-24',
    schedule_group: 'SIGNAL',
  }],
  protectedIds: new Set<string>(),
  lotPayloads: [template],
  signalTemplate: { ...template, installment_number: 0, amount: 1500, schedule_group: 'SIGNAL' },
  paidAtAct: 1500,
  actDueDate: '2026-10-24',
  balance: [
    { amount: 666.67, dueDate: '2026-12-20' },
    { amount: 666.67, dueDate: '2027-01-20' },
    { amount: 666.66, dueDate: '2027-02-20' },
  ],
});
assert(plan.blocked == null, 'o cronograma pendente continua válido');
assert(plan.inserts.every((row) => row.status === 'pendente' && !row.paid_at && Number(row.paid_amount || 0) === 0), 'SIGNAL e LOT novos permanecem pendentes');
assert(plan.updates.every((row) => row.status !== 'pago' && !('paid_at' in row) && !('paid_amount' in row)), 'a edição do valor informado não envia pagamento');
assert(plan.inserts.some((row) => row.schedule_group === 'SIGNAL' && row.installment_number === 1), 'o saldo do sinal continua em parcelas');
assert(plan.inserts.some((row) => row.schedule_group === 'LOT'), 'as parcelas do lote continuam na edição');

console.log('SALE_EDIT_FINANCE_NO_SETTLEMENT_OK');
