/**
 * Baixa manual de SIGNAL, LOT e venda antiga pelo id do recebível.
 * npx tsx scripts/mandatory-separate-signal-manual-payment-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { decideManualReceiptMarkPaid } from '../lib/finance/manualReceiptMarkPaid';
import { verifyPrimaryAdminPassword } from '../lib/primaryAdminReauth';

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
const modal = fs.readFileSync(path.join(root, 'components/finance/MarkPaidAuthModal.tsx'), 'utf8');
assert(!handler.includes('Confirmar pagamento desta parcela'), 'baixa não depende só da confirmação visual');
assert(!handler.includes("from('finance_receipts')"), 'navegador não grava a parcela');
assert(!handler.includes('cash_movements'), 'navegador não cria caixa');
assert(modal.includes('/api/finance/receipts/${receiptId}/mark-paid'), 'financeiro chama a baixa do servidor');
assert(modal.includes('Authorization'), 'sessão vai no token da API');
assert(modal.includes('type="password"'), 'pede a senha do administrador principal');
assert(!modal.includes('console.log'), 'modal não registra a senha');

const route = fs.readFileSync(
  path.join(root, 'app/api/finance/receipts/[receiptId]/mark-paid/route.ts'),
  'utf8',
);
assert(route.includes('execute_authorized_manual_receipt_payment'), 'usa a RPC existente');
assert(route.includes('p_amount: loaded.decision.amount'), 'valor sai do recebível');
assert(route.indexOf('verifyPrimaryAdminPassword') < route.indexOf('execute_authorized_manual_receipt_payment'), 'senha antes da RPC');
assert(route.includes("const USER_SELECT = 'id, role, status, tenant_id'"), 'não consulta company_id do usuário');
assert(route.includes('readPrimaryAdminVerifyRequest'), 'lê somente a senha enviada');
assert(!route.includes('console.log(password'), 'rota não registra a senha');
assert(route.includes("error: messageFor('unauthenticated')"), 'sessão ausente continua não autenticada');
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

const primary = {
  id: 'principal',
  tenant_id: company,
  role: 'ADMIN',
  status: 'ACTIVE',
  email: 'principal@empresa.test',
  full_name: 'Principal',
};

function passwordDeps(verifiedUserId: string | null, primaryId: string | null = primary.id) {
  return {
    loadOperator: async () => ({ id: 'op', tenant_id: company, role: 'ADMIN', status: 'ACTIVE' }),
    loadCompanyPrimaryAdminUserId: async () => primaryId,
    loadUser: async () => (primaryId ? primary : null),
    verifyPassword: async () => ({ userId: verifiedUserId }),
    now: () => 1_700_000_000_000,
  };
}

async function testPrimaryAdminPassword() {
  const accepted = await verifyPrimaryAdminPassword(passwordDeps(primary.id), {
    operatorUserId: 'op',
    password: 'senha-correta',
    companyId: company,
  });
  assert(accepted.ok === true, 'senha correta do administrador principal');

  const rejected = await verifyPrimaryAdminPassword(passwordDeps(null), {
    operatorUserId: 'op',
    password: 'senha-incorreta',
    companyId: company,
  });
  assert(!rejected.ok && rejected.reason === 'password_rejected', 'senha incorreta');

  const missing = await verifyPrimaryAdminPassword(passwordDeps(primary.id, null), {
    operatorUserId: 'op',
    password: 'senha-correta',
    companyId: company,
  });
  assert(!missing.ok && missing.reason === 'missing_primary', 'administrador principal não configurado');
}

testPrimaryAdminPassword()
  .then(() => console.log('ok separate signal manual payment'))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
