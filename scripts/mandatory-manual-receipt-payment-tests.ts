/**
 * Testes obrigatórios — Fase 2 baixa manual autorizada.
 * npx tsx scripts/mandatory-manual-receipt-payment-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  type PrimaryAdminPasswordVerifyInput,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminUserRow,
} from '../lib/primaryAdminReauth';
import {
  MANUAL_PAYMENT_ALREADY_PAID_MESSAGE,
  MANUAL_PAYMENT_AUTHORIZED_ACTION,
  MANUAL_PAYMENT_FAILED_ACTION,
  authorizeAndExecuteManualReceiptPayment,
  buildManualPaymentAuditDescription,
  expectedManualCashMovementPayload,
  formatManualInstallmentLabel,
  previewManualReceiptPayment,
  readPrimaryAdminVerifyRequest,
  toPublicManualPaymentError,
  type ManualPaymentDeps,
  type ManualReceiptRow,
} from '../lib/finance/manualReceiptPayment';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const SV = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const OTHER = 'aaaaaaaa-bbbb-4000-8000-ffffffffffff';
const PRINCIPAL = '8ffc7eec-2df7-4f91-b536-ddf3fc393a14';
const MARCOS = 'da9ab925-b398-4dc2-9020-92832ca4e9f8';
const OTHER_ADMIN = 'bbbbbbbb-cccc-4000-8000-111111111111';
const RECEIPT = '60084c82-1111-4000-8000-aaaaaaaaaaaa';
const OTHER_RECEIPT = 'dddddddd-1111-4000-8000-bbbbbbbbbbbb';
const PRINCIPAL_EMAIL = 'demostrar@svlotes.com.br';
const MARCOS_EMAIL = 'marcos@svlotes.com.br';
const OTHER_EMAIL = 'demo@svlotes.com.br';
const PRINCIPAL_PASSWORD = 'principal-secret';
const MARCOS_PASSWORD = 'marcos-secret';
const OTHER_PASSWORD = 'other-company-secret';

function users(): Record<string, PrimaryAdminUserRow> {
  return {
    [PRINCIPAL]: {
      id: PRINCIPAL,
      tenant_id: SV,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: PRINCIPAL_EMAIL,
      full_name: 'Admin - S.V TOPOGRAFIA E PROJETO LTDA',
    },
    [MARCOS]: {
      id: MARCOS,
      tenant_id: SV,
      role: 'ADMIN_EMPRESA',
      status: 'ACTIVE',
      email: MARCOS_EMAIL,
      full_name: 'Marco francisco oliveira',
    },
    [OTHER_ADMIN]: {
      id: OTHER_ADMIN,
      tenant_id: OTHER,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: OTHER_EMAIL,
      full_name: 'Usuário Demonstração',
    },
  };
}

function pendingReceipt(over: Partial<ManualReceiptRow> = {}): ManualReceiptRow {
  return {
    id: RECEIPT,
    tenant_id: SV,
    company_id: SV,
    status: 'pendente',
    amount: 13,
    paid_amount: null,
    paid_at: null,
    due_date: '2026-08-18',
    installment_number: 2,
    sale_id: 'sale-1',
    customer_id: 'cust-1',
    project_id: 'proj-1',
    block_id: 'block-1',
    customer_name: 'SEVERINO JOSE DE FRANÇA',
    contract_id: 'ct-1',
    contract_number: '000000013/2026',
    installments_count: 10,
    ...over,
  };
}

function makeDeps(over: {
  primaryId?: string | null;
  userOver?: Record<string, Partial<PrimaryAdminUserRow>>;
  receipts?: Record<string, ManualReceiptRow>;
  persist?: ManualPaymentDeps['persistAuthorizedPayment'];
} = {}) {
  const table = users();
  for (const [id, patch] of Object.entries(over.userOver || {})) {
    table[id] = { ...table[id], ...patch };
  }
  const receipts: Record<string, ManualReceiptRow> = over.receipts || {
    [RECEIPT]: pendingReceipt(),
    [OTHER_RECEIPT]: pendingReceipt({ id: OTHER_RECEIPT, tenant_id: OTHER, company_id: OTHER }),
  };
  const passwordCalls: PrimaryAdminPasswordVerifyInput[] = [];
  const persistCalls: Array<{ operatorId: string; receiptId: string }> = [];
  const paid = new Set<string>();
  const cashIds: Record<string, string> = {};
  const primaryId = over.primaryId === undefined ? PRINCIPAL : over.primaryId;
  const reauthBase: PrimaryAdminReauthDeps = {
    rateLimitStore: new Map(),
    loadOperator: async (id) => table[id] || null,
    loadCompanyPrimaryAdminUserId: async (companyId) => (companyId === SV ? primaryId : null),
    loadUser: async (id) => table[id] || null,
    verifyPassword: async (input) => {
      passwordCalls.push(input);
      if (input.email === PRINCIPAL_EMAIL && input.password === PRINCIPAL_PASSWORD) {
        return { userId: PRINCIPAL, accessToken: 'ephemeral-access', refreshToken: 'ephemeral-refresh' };
      }
      if (input.email === MARCOS_EMAIL && input.password === MARCOS_PASSWORD) {
        return { userId: MARCOS, accessToken: 'marcos-token' };
      }
      if (input.email === OTHER_EMAIL && input.password === OTHER_PASSWORD) {
        return { userId: OTHER_ADMIN, accessToken: 'other-token' };
      }
      return { userId: null };
    },
  };
  const deps: ManualPaymentDeps = {
    ...reauthBase,
    loadReceipt: async (id) => receipts[id] || null,
    persistAuthorizedPayment:
      over.persist ||
      (async ({ receipt, operatorId }) => {
        persistCalls.push({ operatorId, receiptId: receipt.id });
        if (paid.has(receipt.id)) {
          return { ok: false, code: 'already_paid', receiptId: receipt.id, cashMovementId: cashIds[receipt.id] };
        }
        paid.add(receipt.id);
        receipts[receipt.id] = { ...receipt, status: 'pago', paid_at: new Date().toISOString(), paid_amount: receipt.amount };
        cashIds[receipt.id] = `cash-${receipt.id}`;
        return { ok: true, receiptId: receipt.id, cashMovementId: cashIds[receipt.id] };
      }),
  };
  return { deps, passwordCalls, persistCalls, paid, receipts };
}

async function testAMarcosCorrectPassword() {
  const { deps, passwordCalls, persistCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  if (!result.ok) throw new Error('A baixa deveria acontecer');
  assert(result.requestedBy === MARCOS, 'requested_by Marcos');
  assert(result.authorizedBy === PRINCIPAL, 'authorized_by Principal');
  assert(result.cashMovementId === `cash-${RECEIPT}`, 'criou cash movement');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'senha do Principal');
  assert(persistCalls.length === 1, 'uma persistência');
  console.log('OK A Marcos + senha correta do Principal');
}

async function testBWrongPasswordNoPersist() {
  const { deps, persistCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: 'errada',
  });
  assert(!result.ok, 'B nega');
  assert(persistCalls.length === 0, 'não altera receipt/cash');
  assert(toPublicManualPaymentError(result).error === PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, 'mensagem genérica');
  console.log('OK B senha errada não altera receipt');
}

async function testCMarcosOwnPassword() {
  const { deps, persistCalls, passwordCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: MARCOS_PASSWORD,
  });
  assert(!result.ok, 'C nega senha do Marcos');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'não autentica e-mail do operador');
  assert(persistCalls.length === 0, 'sem persistência');
  console.log('OK C senha do próprio Marcos');
}

async function testDOtherTenantAdminPassword() {
  const { deps, persistCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: OTHER_PASSWORD,
  });
  assert(!result.ok, 'D nega senha de outro tenant');
  assert(persistCalls.length === 0, 'sem persistência');
  console.log('OK D senha ADMIN de outro tenant');
}

async function testEMissingPrimary() {
  const { deps, persistCalls, passwordCalls } = makeDeps({ primaryId: null });
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok, 'E nega sem Principal');
  assert(passwordCalls.length === 0, 'não tenta senha');
  assert(persistCalls.length === 0, 'sem persistência');
  console.log('OK E sem primary_admin_user_id');
}

async function testFInactivePrimary() {
  const { deps, persistCalls, passwordCalls } = makeDeps({
    userOver: { [PRINCIPAL]: { status: 'INACTIVE' } },
  });
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok, 'F Principal inactive nega');
  assert(passwordCalls.length === 0, 'não tenta senha');
  assert(persistCalls.length === 0, 'sem persistência');
  console.log('OK F Primary Admin inactive');
}

async function testGOtherTenantReceipt() {
  const { deps, persistCalls, passwordCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: OTHER_RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok && result.code === 'wrong_tenant', 'G receipt de outro tenant');
  assert(passwordCalls.length === 0, 'não tenta senha cruzada');
  assert(persistCalls.length === 0, 'sem persistência');
  console.log('OK G receipt de outro tenant');
}

async function testHAlreadyPaid() {
  const { deps, persistCalls, passwordCalls } = makeDeps({
    receipts: {
      [RECEIPT]: pendingReceipt({ status: 'pago', paid_at: '2026-09-18T12:00:00Z', paid_amount: 13 }),
    },
  });
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok && result.code === 'already_paid', 'H already paid');
  assert(toPublicManualPaymentError(result).error === MANUAL_PAYMENT_ALREADY_PAID_MESSAGE, 'mensagem already paid');
  assert(passwordCalls.length === 0, 'não reautentica parcela já paga');
  assert(persistCalls.length === 0, 'não duplica cash');
  console.log('OK H parcela já paga');
}

async function testIConcurrentSinglePersist() {
  const { deps, persistCalls } = makeDeps();
  const first = authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  const second = authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  const [a, b] = await Promise.all([first, second]);
  const oks = [a.result, b.result].filter((r) => r.ok);
  const already = [a.result, b.result].filter((r) => !r.ok && r.code === 'already_paid');
  assert(oks.length === 1, 'uma única baixa');
  assert(already.length === 1, 'segunda vira already_paid');
  assert(persistCalls.length === 2, 'RPC/lock visto duas vezes');
  console.log('OK I concorrência — uma única baixa');
}

async function testJIgnoreForgedAuthorizedBy() {
  const body = readPrimaryAdminVerifyRequest({
    password: PRINCIPAL_PASSWORD,
    authorized_by: OTHER_ADMIN,
    primary_admin_user_id: OTHER_ADMIN,
    company_id: OTHER,
    tenant_id: OTHER,
    status: 'pago',
    created_by: PRINCIPAL,
  });
  const { deps } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: body.password,
  });
  if (!result.ok) throw new Error('J deveria autorizar com senha correta');
  assert(result.authorizedBy === PRINCIPAL, 'authorized_by do banco, não do body');
  assert(result.requestedBy === MARCOS, 'created_by/operador continua Marcos');
  console.log('OK J client não forja authorized_by');
}

function testKClientUpdateBlocked() {
  const page = read('app/finance/page.tsx');
  const markStart = page.indexOf('const handleMarkPaid');
  const markEnd = page.indexOf('const handleDeleteReceipt');
  assert(markStart > 0 && markEnd > markStart, 'handleMarkPaid presente');
  const markPaid = page.slice(markStart, markEnd);
  assert(!markPaid.includes("from('finance_receipts')"), 'handleMarkPaid não faz UPDATE client');
  assert(!page.includes('Confirmar pagamento desta parcela?'), 'confirm antigo removido');
  assert(page.includes('ManualPaymentAuthModal'), 'modal profissional');

  const sql = read('supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql');
  assert(sql.includes('finance_receipts_block_client_paid_update'), 'trigger RLS/DB');
  assert(sql.includes("'authenticated', 'anon'"), 'bloqueia papel de browser');
  assert(sql.includes('service_role'), 'service_role continua');
  console.log('OK K client não faz UPDATE equivalente');
}

function testLWebhooksUntouched() {
  const asaas = read('lib/finance/companyAsaasPaymentReconciliation.ts');
  const inter = read('lib/banking/inter/interPaymentSettlement.ts');
  assert(asaas.includes("status: FINANCE_RECEIPT_PAID_STATUS"), 'Asaas continua baixando');
  assert(!asaas.includes('authorizeAndExecuteManualReceiptPayment'), 'Asaas não passa pelo modal');
  assert(inter.includes('buildInterFinanceReceiptPaidPatch'), 'Inter continua baixando');
  assert(!inter.includes('manual-payment'), 'Inter não usa a API manual');
  const sql = read('supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql');
  assert(sql.includes("jwt_role NOT IN ('authenticated', 'anon')"), 'webhooks service_role passam no trigger');
  console.log('OK L webhook/sync automático continua');
}

function testMSessionUntouched() {
  const modal = read('components/finance/ManualPaymentAuthModal.tsx');
  const route = read('app/api/finance/receipts/[receiptId]/manual-payment/route.ts');
  assert(!modal.includes('signInWithPassword'), 'modal não troca sessão');
  assert(modal.includes("JSON.stringify({ password: presented })"), 'POST só senha');
  assert(!modal.includes('company_id'), 'não envia company_id');
  assert(!modal.includes('authorized_by'), 'não envia authorized_by');
  assert(route.includes('getRequestAuthUser'), 'operador da sessão');
  assert(route.includes('readPrimaryAdminVerifyRequest'), 'ignora identidade do body');
  console.log('OK M sessão do Marcos permanece');
}

async function testNAuditRequestedAuthorized() {
  const { deps } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  if (!result.ok) throw new Error('N precisava autorizar');
  const desc = buildManualPaymentAuditDescription({
    result: 'authorized',
    receiptId: result.receiptId,
    requestedBy: result.requestedBy,
    authorizedBy: result.authorizedBy,
    cashMovementId: result.cashMovementId,
    amount: 13,
    contractNumber: '000000013/2026',
    installmentNumber: 2,
  });
  const parsed = JSON.parse(desc) as Record<string, unknown>;
  assert(parsed.requested_by_user_id === MARCOS, 'audit requested_by Marcos');
  assert(parsed.authorized_by_user_id === PRINCIPAL, 'audit authorized_by Principal');
  assert(!desc.toLowerCase().includes('password'), 'audit sem senha');
  assert(MANUAL_PAYMENT_AUTHORIZED_ACTION === 'MANUAL_PAYMENT_AUTHORIZED', 'evento sucesso');
  assert(MANUAL_PAYMENT_FAILED_ACTION === 'MANUAL_PAYMENT_AUTHORIZATION_FAILED', 'evento falha');
  console.log('OK N audit requested_by / authorized_by');
}

async function testOPrincipalAlsoReauths() {
  const { deps, passwordCalls } = makeDeps();
  const { result } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: PRINCIPAL,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  if (!result.ok) throw new Error('O Principal com senha correta autoriza');
  assert(result.requestedBy === PRINCIPAL, 'requested_by Principal');
  assert(result.authorizedBy === PRINCIPAL, 'authorized_by Principal');
  assert(passwordCalls.length === 1, 'reautentica mesmo logado como Principal');
  const deniedOwnEmpty = await authorizeAndExecuteManualReceiptPayment(makeDeps().deps, {
    operatorUserId: PRINCIPAL,
    receiptId: RECEIPT,
    password: '',
  });
  assert(!deniedOwnEmpty.result.ok, 'Principal sem senha não baixa');
  console.log('OK O Principal logado também reautentica');
}

function testCashMovementSemanticsAndPreview() {
  assert(formatManualInstallmentLabel(2, 10) === '2/10', 'parcela 2/10');
  const payload = expectedManualCashMovementPayload({
    tenantId: SV,
    receipt: pendingReceipt(),
    operatorId: MARCOS,
    paidAt: '2026-09-18T15:00:00.000Z',
    amount: 13,
  });
  assert(payload.created_by === MARCOS, 'cash created_by = operador');
  assert(payload.category === 'Venda de Lote', 'categoria intacta');
  assert((payload.metadata as { provider?: string }).provider === 'MANUAL_FINANCE', 'provider MANUAL_FINANCE');
  const sql = read('supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql');
  assert(sql.includes('FOR UPDATE'), 'lock de concorrência');
  assert(sql.includes("REVOKE ALL"), 'RPC não é do browser');
  assert(sql.includes("'Venda de Lote'"), 'categoria no RPC');
  console.log('OK cash movement e preview');
}

async function testPreviewDoesNotHardcodeEmail() {
  const { deps } = makeDeps();
  const preview = await previewManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
  });
  if (!preview.ok) throw new Error('preview deveria funcionar');
  assert(preview.receipt.contractNumber === '000000013/2026', 'contrato do servidor');
  assert(preview.receipt.customerName === 'SEVERINO JOSE DE FRANÇA', 'cliente');
  assert(preview.receipt.installmentLabel === '2/10', 'parcela');
  assert(preview.principal.maskedEmail === 'dem*****@svlotes.com.br', 'e-mail mascarado');
  assert(!JSON.stringify(preview).includes(PRINCIPAL_EMAIL), 'sem e-mail completo');
  const modal = read('components/finance/ManualPaymentAuthModal.tsx');
  assert(!modal.includes('demostrar@svlotes.com.br'), 'UI sem hardcode');
  console.log('OK preview server-side sem hardcode');
}

async function main() {
  await testAMarcosCorrectPassword();
  await testBWrongPasswordNoPersist();
  await testCMarcosOwnPassword();
  await testDOtherTenantAdminPassword();
  await testEMissingPrimary();
  await testFInactivePrimary();
  await testGOtherTenantReceipt();
  await testHAlreadyPaid();
  await testIConcurrentSinglePersist();
  await testJIgnoreForgedAuthorizedBy();
  testKClientUpdateBlocked();
  testLWebhooksUntouched();
  testMSessionUntouched();
  await testNAuditRequestedAuthorized();
  await testOPrincipalAlsoReauths();
  testCashMovementSemanticsAndPreview();
  await testPreviewDoesNotHardcodeEmail();
  console.log('\nOK — mandatory-manual-receipt-payment-tests passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
