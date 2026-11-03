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
  MANUAL_PAYMENT_LOAD_FAILED_MESSAGE,
  MANUAL_PAYMENT_PERSISTENCE_FAILED_ACTION,
  MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE,
  authorizeAndExecuteManualReceiptPayment,
  buildManualPaymentAuditDescription,
  expectedManualCashMovementPayload,
  formatManualInstallmentLabel,
  previewManualReceiptPayment,
  readPrimaryAdminVerifyRequest,
  toPublicManualPaymentError,
  toPublicManualPaymentPreviewError,
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

function testHotfixModalLocksAJ() {
  const modal = read('components/finance/ManualPaymentAuthModal.tsx');
  const route = read('app/api/finance/receipts/[receiptId]/manual-payment/route.ts');
  const server = read('lib/finance/manualReceiptPaymentServer.ts');
  const page = read('app/finance/page.tsx');
  const getBlock = route.slice(
    route.indexOf('export async function GET'),
    route.indexOf('export async function POST'),
  );
  const postBlock = route.slice(route.indexOf('export async function POST'));

  assert(modal.includes("useState<ModalView>('loading')"), 'A modal abre em loading');
  assert(modal.includes("view === 'loading'"), 'A render loading');

  assert(modal.includes("setView('ready')"), 'B GET sucesso → ready');
  assert(modal.includes('preview.principal.displayName'), 'B identidade do Principal');
  assert(modal.includes('preview.principal.maskedEmail'), 'B e-mail mascarado');
  assert(modal.includes('type="password"'), 'B campo de senha');
  assert(modal.includes('Autorizar e registrar pagamento'), 'B botão autorizar');
  assert(modal.includes('preview.receipt.contractNumber'), 'B contrato');
  assert(modal.includes('preview.receipt.customerName'), 'B cliente');
  assert(modal.includes('preview.receipt.installmentLabel'), 'B parcela');
  assert(modal.includes('preview.receipt.dueDateLabel'), 'B vencimento');
  assert(modal.includes('preview.receipt.amountLabel'), 'B valor');

  assert(modal.includes("setView('load_failed')"), 'C GET erro → load_failed');
  assert(modal.includes('MANUAL_PAYMENT_LOAD_FAILED_MESSAGE'), 'C mensagem de carga');
  assert(modal.includes('Tentar novamente'), 'C botão retry');
  assert(modal.includes("view === 'load_failed'"), 'C UI de falha de carga');

  assert(!getBlock.includes('PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE'), 'D GET não devolve senha recusada');
  assert(getBlock.includes('toPublicManualPaymentPreviewError'), 'D GET usa erro de carga');
  assert(
    !modal.includes('setError(json?.error || PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE)'),
    'D GET não cai em senha recusada',
  );

  assert(modal.includes('if (!presented) return'), 'E senha vazia não submete');
  assert(modal.includes('disabled={submitting || !password.trim()}'), 'E botão exige senha');

  assert(modal.includes("setView('authorization_failed')"), 'F senha errada');
  assert(
    modal.includes("view === 'ready' || view === 'authorization_failed'"),
    'F formulário permanece',
  );
  assert(modal.includes('PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE'), 'F Autorização não concedida só no POST');

  assert(modal.includes("setPassword('')"), 'G limpa senha após falha');

  assert(modal.includes('MANUAL_PAYMENT_SUCCESS_MESSAGE'), 'H sucesso fecha e avisa');
  assert(modal.includes('onSuccess()'), 'H atualiza parcela');
  assert(modal.includes('JSON.stringify({ password: presented })'), 'H POST só password');
  assert(modal.includes('Autorizando...'), 'H desabilita e mostra Autorizando');

  assert(!modal.includes('signOut'), 'I sessão permanece Marcos');
  assert(!modal.includes('signInWithPassword'), 'I modal não troca sessão');

  const markStart = page.indexOf('const handleMarkPaid');
  const markEnd = page.indexOf('const handleDeleteReceipt');
  const markPaid = page.slice(markStart, markEnd);
  assert(!markPaid.includes("from('finance_receipts')"), 'J sem UPDATE client');
  assert(!markPaid.includes('window.confirm'), 'J sem confirm na baixa');
  assert(!modal.includes('.update('), 'J modal não persiste');
  assert(postBlock.includes('authorizeAndExecuteManualReceiptPayment'), 'J baixa só no endpoint');

  assert(!server.includes('customers(name, full_name)'), 'loader sem embed ambíguo de customers');
  assert(server.includes("from('customers')"), 'loader busca cliente separado');
  assert(server.includes(".select('name')"), 'cliente usa customers.name');
  assert(!server.includes('full_name'), 'sem customers.full_name');
  assert(server.includes("from('sales')"), 'loader busca venda separado');
  assert(server.includes("from('contracts')"), 'loader busca contrato separado');
  assert(server.includes('MANUAL_RECEIPT_BASE_SELECT'), 'select plano da parcela');
  console.log('OK HOTFIX A–J estados do modal e GET');
}

async function testGetFailureIsNotPasswordDenied() {
  const missing = await previewManualReceiptPayment(makeDeps({ receipts: {} }).deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
  });
  assert(!missing.ok, 'parcela ausente falha o GET');
  if (missing.ok) throw new Error('unreachable');
  const pubMissing = toPublicManualPaymentPreviewError(missing.code);
  assert(pubMissing.error === MANUAL_PAYMENT_LOAD_FAILED_MESSAGE, 'GET not_found → carga falhou');
  assert(pubMissing.error !== PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, 'GET not_found ≠ senha recusada');

  const noPrimary = await previewManualReceiptPayment(makeDeps({ primaryId: null }).deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
  });
  assert(!noPrimary.ok, 'sem Principal falha o GET');
  if (noPrimary.ok) throw new Error('unreachable');
  const pubDenied = toPublicManualPaymentPreviewError(noPrimary.code);
  assert(pubDenied.error === MANUAL_PAYMENT_LOAD_FAILED_MESSAGE, 'GET denied → carga falhou');
  assert(pubDenied.error !== PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, 'GET denied ≠ senha recusada');
  console.log('OK GET falho não aparece como senha recusada');
}

function testRpcAmbiguityHotfixAL() {
  const oldSql = read('supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql');
  const sql = read('supabase/migrations/20261021130000_fix_manual_receipt_payment_rpc_ambiguity.sql');
  const modal = read('components/finance/ManualPaymentAuthModal.tsx');
  const route = read('app/api/finance/receipts/[receiptId]/manual-payment/route.ts');
  const server = read('lib/finance/manualReceiptPaymentServer.ts');
  const lib = read('lib/finance/manualReceiptPayment.ts');

  assert(oldSql.includes('paid_amount numeric'), 'A migration antiga permanece intacta');
  assert(!sql.includes('DROP TRIGGER'), 'hotfix não remove trigger');
  assert(sql.includes('v_paid_amount'), 'A variável v_paid_amount');
  assert(sql.includes('paid_amount = v_paid_amount'), 'A SET usa v_paid_amount');
  assert(!/paid_amount\s*=\s*paid_amount/.test(sql), 'A sem SET ambíguo');
  assert(sql.includes('SECURITY DEFINER'), 'A SECURITY DEFINER');
  assert(sql.includes('SET search_path = public'), 'A search_path');
  assert(sql.includes('GRANT EXECUTE') && sql.includes('service_role'), 'A só service_role');
  assert(sql.includes('REVOKE ALL'), 'A REVOKE browser');
  assert(!sql.includes('CREATE TRIGGER'), 'A não recria trigger');
  assert(!sql.includes('DROP TRIGGER'), 'A não dropa trigger');

  const nine = pendingReceipt({ amount: 9, installment_number: 0, contract_number: '000000026/2026' });
  const payload = expectedManualCashMovementPayload({
    tenantId: SV,
    receipt: nine,
    operatorId: MARCOS,
    paidAt: '2026-09-18T15:00:00.000Z',
    amount: 9,
  });
  assert(payload.amount === 9, 'B cash amount = 9');
  assert(payload.created_by === MARCOS, 'I created_by Marcos');
  assert(sql.includes('v_paid_amount := COALESCE(p_amount, r.amount, 0)'), 'B RPC usa p_amount/r.amount');
  assert(sql.includes("'amount', v_paid_amount"), 'B retorno amount = v_paid_amount');

  assert(oldSql.includes('finance_receipts_block_client_paid_update'), 'L trigger original permanece');
  assert(modal.includes('MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE'), 'G modal distingue persistência');
  assert(modal.includes("setView('authorization_failed')"), 'F senha errada continua authorization_failed');
  assert(!route.includes('ambiguous'), 'H route sem SQL');
  assert(!lib.includes('column reference'), 'H lib sem detalhe Postgres');
  assert(lib.includes('MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE'), 'G mensagem operacional');
  assert(server.includes("code: 'rpc_failure'"), 'G persistência vira rpc_failure');
  assert(!modal.includes('signOut'), 'K sessão permanece');
  console.log('OK HOTFIX RPC A/B/G/H/I/K/L locks');
}

async function testPersistenceFailedIsNotPasswordDenied() {
  let persistHits = 0;
  const { deps } = makeDeps({
    persist: async () => {
      persistHits += 1;
      return { ok: false, code: 'rpc_failure' };
    },
  });
  const { result, verify } = await authorizeAndExecuteManualReceiptPayment(deps, {
    operatorUserId: MARCOS,
    receiptId: RECEIPT,
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok, 'persistência falhou');
  assert(result.code === 'persistence_failed', 'código persistence_failed');
  assert(verify?.ok === true, 'senha do Principal já tinha passado');
  assert(persistHits === 1, 'RPC/persist foi chamada após senha OK');
  const pub = toPublicManualPaymentError(result);
  assert(pub.error === MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE, 'G mensagem operacional');
  assert(pub.error !== PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, 'G não parece senha incorreta');
  assert(!JSON.stringify(pub).toLowerCase().includes('ambiguous'), 'H sem SQL no browser');
  assert(!JSON.stringify(pub).includes('paid_amount'), 'H sem nome de coluna');
  const desc = buildManualPaymentAuditDescription({
    result: 'failed',
    stage: 'PERSISTENCE',
    reason: 'RPC_FAILURE',
    receiptId: RECEIPT,
    requestedBy: MARCOS,
    authorizedBy: PRINCIPAL,
    amount: 9,
  });
  const parsed = JSON.parse(desc) as Record<string, unknown>;
  assert(parsed.stage === 'PERSISTENCE', 'audit stage PERSISTENCE');
  assert(parsed.reason === 'RPC_FAILURE', 'audit reason RPC_FAILURE');
  assert(parsed.requested_by_user_id === MARCOS, 'J requested_by Marcos');
  assert(parsed.authorized_by_user_id === PRINCIPAL, 'J authorized_by Principal');
  assert(MANUAL_PAYMENT_PERSISTENCE_FAILED_ACTION === 'MANUAL_PAYMENT_PERSISTENCE_FAILED', 'action persistência');
  console.log('OK G/H/J persistência ≠ senha recusada');
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
  testHotfixModalLocksAJ();
  await testGetFailureIsNotPasswordDenied();
  testRpcAmbiguityHotfixAL();
  await testPersistenceFailedIsNotPasswordDenied();
  console.log('\nOK — mandatory-manual-receipt-payment-tests passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
