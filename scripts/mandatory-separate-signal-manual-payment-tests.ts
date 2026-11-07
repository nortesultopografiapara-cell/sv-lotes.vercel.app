/**
 * Baixa manual de SIGNAL, LOT e venda antiga pelo id do recebível.
 * npx tsx scripts/mandatory-separate-signal-manual-payment-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { decideManualReceiptMarkPaid } from '../lib/finance/manualReceiptMarkPaid';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const company = 'company-recanto';
const admin = { operatorTenantId: company, operatorRole: 'ADMIN', operatorStatus: 'ACTIVE' };
const signal = decideManualReceiptMarkPaid({
  ...admin,
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    paidAt: null,
    amount: 500,
    scheduleGroup: 'SIGNAL',
  },
});
assert(signal.ok === true && signal.receiptId === 'receipt-signal-1' && signal.amount === 500, 'sinal pendente');

const lot = decideManualReceiptMarkPaid({
  ...admin,
  receipt: {
    id: 'receipt-lot-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 551.57,
    scheduleGroup: 'LOT',
  },
});
assert(lot.ok === true && lot.receiptId === 'receipt-lot-1' && lot.amount === 551.57, 'lote pendente');

const legacy = decideManualReceiptMarkPaid({
  ...admin,
  receipt: {
    id: 'receipt-legacy-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 1000,
    scheduleGroup: null,
  },
});
assert(legacy.ok === true && legacy.amount === 1000, 'venda antiga');

for (const role of ['ADMIN_EMPRESA', 'COMPANY_ADMIN', 'SUPER_ADMIN']) {
  const allowed = decideManualReceiptMarkPaid({
    operatorTenantId: company,
    operatorRole: role,
    operatorStatus: 'ACTIVE',
    receipt: {
      id: 'receipt-admin-role',
      tenantId: company,
      companyId: company,
      status: 'pendente',
      amount: 10,
    },
  });
  assert(allowed.ok === true, `${role} já administra e pode baixar`);
}

const paid = decideManualReceiptMarkPaid({
  ...admin,
  receipt: {
    id: 'receipt-signal-0',
    tenantId: company,
    companyId: company,
    status: 'pago',
    paidAt: '2026-11-06',
    amount: 1000,
    scheduleGroup: 'SIGNAL',
  },
});
assert(!paid.ok && paid.code === 'already_paid', 'pagamento inicial não baixa de novo');

const paidAtOnly = decideManualReceiptMarkPaid({
  ...admin,
  receipt: {
    id: 'receipt-paid-at',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    paidAt: '2026-11-06',
    amount: 500,
    scheduleGroup: 'LOT',
  },
});
assert(!paidAtOnly.ok && paidAtOnly.code === 'already_paid', 'data de pagamento preenchida');

for (const status of ['cancelado', 'canceled', 'cancelled', 'cancelada']) {
  const cancelled = decideManualReceiptMarkPaid({
    ...admin,
    receipt: {
      id: 'receipt-cancelled',
      tenantId: company,
      companyId: company,
      status,
      paidAt: null,
      amount: 500,
      scheduleGroup: 'SIGNAL',
    },
  });
  assert(!cancelled.ok && cancelled.code === 'cancelled', `status ${status}`);
}

const owner = decideManualReceiptMarkPaid({
  operatorTenantId: company,
  operatorRole: 'OWNER',
  operatorStatus: 'ACTIVE',
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 500,
    scheduleGroup: 'SIGNAL',
  },
});
assert(!owner.ok && owner.code === 'forbidden', 'somente leitura');

const broker = decideManualReceiptMarkPaid({
  operatorTenantId: company,
  operatorRole: 'BROKER',
  operatorStatus: 'ACTIVE',
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 500,
  },
});
assert(!broker.ok && broker.code === 'forbidden', 'sem permissão financeira');

const inactive = decideManualReceiptMarkPaid({
  operatorTenantId: company,
  operatorRole: 'ADMIN',
  operatorStatus: 'INACTIVE',
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 500,
  },
});
assert(!inactive.ok && inactive.code === 'forbidden', 'usuário inativo');

const unknownRole = decideManualReceiptMarkPaid({
  operatorTenantId: company,
  operatorRole: 'USER',
  operatorStatus: 'ACTIVE',
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 500,
  },
});
assert(!unknownRole.ok && unknownRole.code === 'forbidden', 'papel sem escrita financeira');

const otherCompany = decideManualReceiptMarkPaid({
  operatorTenantId: 'outra-empresa',
  operatorRole: 'ADMIN',
  operatorStatus: 'ACTIVE',
  receipt: {
    id: 'receipt-signal-1',
    tenantId: company,
    companyId: company,
    status: 'pendente',
    amount: 500,
    scheduleGroup: 'SIGNAL',
  },
});
assert(!otherCompany.ok && otherCompany.code === 'tenant_mismatch', 'outra empresa');

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'app/finance/page.tsx'), 'utf8');
const handler = page.slice(page.indexOf('const handleMarkPaid'), page.indexOf('const handleDeleteReceipt'));
assert(handler.includes('/api/finance/receipts/${p.id}/mark-paid'), 'financeiro chama a baixa do servidor');
assert(!handler.includes("from('finance_receipts')"), 'navegador não grava a parcela');
assert(!handler.includes('cash_movements'), 'navegador não cria caixa');

const route = fs.readFileSync(
  path.join(root, 'app/api/finance/receipts/[receiptId]/mark-paid/route.ts'),
  'utf8',
);
assert(route.includes('execute_authorized_manual_receipt_payment'), 'usa a RPC existente');
assert(route.includes('p_amount: decision.amount'), 'valor sai do recebível');
assert(route.indexOf('decideManualReceiptMarkPaid') < route.indexOf('execute_authorized_manual_receipt_payment'), 'autorização antes da RPC');
assert(!route.includes('request.json'), 'não lê papel nem valor do navegador');
assert(!/SUPABASE_SERVICE_ROLE_KEY|service_role/.test(page), 'chave de serviço fora do navegador');
assert(!/asaas|inter|c6|create-charge/i.test(route), 'baixa não emite cobrança');

const decisionSource = fs.readFileSync(
  path.join(root, 'lib/finance/manualReceiptMarkPaid.ts'),
  'utf8',
);
assert(decisionSource.includes('guardOwnerWriteRole'), 'bloqueia somente leitura');
assert(decisionSource.includes('isBrokerRole'), 'bloqueia corretor');
assert(decisionSource.includes('canManageGisProject'), 'usa a escrita de administrador já existente');
assert(!decisionSource.includes('canViewEnterpriseValues('), 'não usa visualização de valores como escrita');

const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261106233000_manual_receipt_payment_reject_cancelled.sql'),
  'utf8',
);
const lockAt = sql.indexOf('FOR UPDATE');
const cancelledAt = sql.indexOf("'cancelled'");
const updateAt = sql.indexOf('UPDATE public.finance_receipts');
const insertAt = sql.indexOf('INSERT INTO cash_movements');
assert(lockAt > 0 && cancelledAt > lockAt && updateAt > cancelledAt && insertAt > updateAt, 'validação depois do bloqueio e antes da gravação');
assert(sql.includes('existing_cash IS NOT NULL'), 'caixa existente não gera outro lançamento');
assert(!sql.includes('EXCEPTION'), 'falha no caixa desfaz a baixa na mesma transação');
assert(!/CREATE POLICY|ALTER TABLE|ENABLE ROW LEVEL SECURITY/.test(sql), 'migration não mexe em tabela nem policy');
assert(sql.includes('GRANT EXECUTE') && sql.includes('TO service_role'), 'RPC continua só no servidor');

console.log('ok separate signal manual payment');
