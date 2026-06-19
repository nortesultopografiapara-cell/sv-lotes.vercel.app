/**
 * Testes obrigatórios — cobrança SaaS PIX real (Fase 1).
 * npm run test:saas-payment
 */

import fs from 'node:fs';
import path from 'node:path';
import { MockPaymentProvider } from '../lib/payments/providers/mock';
import { mapProviderStatusToChargeStatus } from '../lib/payments/providers/types';
import { resolvePaymentProviderName } from '../lib/payments/providers';
import {
  assertSaasPaymentGatewayConfigured,
  getSaasPaymentGatewayStatus,
  isProductionPaymentEnvironment,
  isSaasPaymentGatewayConfigured,
  SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE,
} from '../lib/saasPaymentGateway';
import {
  classifyExternalChargeId,
  isOrphanSaasCharge,
  isProtectedSaasCharge,
  resolveSaasPixChargeSkipReason,
  resolveSaasPixChargeSkipReasonAsync,
  saasChargeStatusLabel,
} from '../lib/saasCharges';
import { isPhantomSaasInvoice } from '../lib/saasBilling';
import { resolveSaasFinancialSituation } from '../lib/masterSaasFinancialStatus';
import { shouldShowFullTenantAdminMenu, isBrokerRole, isOwnerRole } from '../lib/rolePermissions';
import {
  handleAsaasPaymentWebhook,
  type AsaasWebhookDeps,
} from '../lib/saasAsaasWebhook';
import {
  validateCompanyDocumentForAsaas,
  resolveAsaasDueDate,
} from '../lib/saasPixValidation';
import {
  buildSaasInvoiceChargeRows,
  truncatePaymentId,
} from '../lib/saasInvoiceChargeView';
import { addOneMonthToIsoDate, companyNextPaymentPatch } from '../lib/companySubscriptionDates';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(relPath: string): string {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `arquivo ausente: ${relPath}`);
  return fs.readFileSync(full, 'utf8');
}

async function testPixChargeGeneration() {
  const provider = new MockPaymentProvider();
  const result = await provider.createPixCharge({
    companyId: 'company-1',
    chargeId: 'charge-1',
    amount: 549.99,
    dueDate: '2026-07-27',
    description: 'SV LOTES — Assinatura 2026-07',
    payerName: 'MENESES IMOBILIARIA',
  });

  assert(!!result.paymentId, 'paymentId gerado');
  assert(result.pixCopyPaste.includes('BR.GOV.BCB.PIX'), 'PIX copia e cola');
  assert(result.pixQrCode.includes('svg') || result.pixQrCode.includes('png'), 'QR code');
  assert(result.status === 'PENDING', 'status pendente');
}

function testBillingMenuVisibility() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes("name: 'Minha Assinatura'"), 'item Minha Assinatura');
  assert(layout.includes("href: '/billing'"), 'rota /billing no menu');
  assert(layout.includes('CreditCard'), 'ícone cartão');
  assert(layout.includes('shouldShowFullTenantAdminMenu(role)'), 'menu admin tenant');

  assert(shouldShowFullTenantAdminMenu('ADMIN_EMPRESA'), 'ADMIN_EMPRESA vê menu tenant');
  assert(shouldShowFullTenantAdminMenu('ADMIN'), 'ADMIN vê menu tenant');
  assert(!shouldShowFullTenantAdminMenu('BROKER'), 'BROKER não usa menu admin');
  assert(!shouldShowFullTenantAdminMenu('OWNER'), 'OWNER não usa menu admin');

  assert(isBrokerRole('BROKER'), 'broker role');
  assert(isOwnerRole('OWNER'), 'owner role');

  const brokerSection = layout.split('if (isBrokerRole(role))')[1]?.split('if (isOwnerRole(role))')[0] || '';
  assert(!brokerSection.includes('/billing'), '/billing ausente para BROKER');

  const ownerSection = layout.split('if (isOwnerRole(role))')[1]?.split('return [')[0] || '';
  assert(!ownerSection.includes('/billing'), '/billing ausente para OWNER');
}

function testProductionGatewayRules() {
  const gateway = read('lib/saasPaymentGateway.ts');
  assert(gateway.includes('isProductionPaymentEnvironment'), 'detecta produção');
  assert(gateway.includes('assertSaasPaymentGatewayConfigured'), 'assert gateway');
  assert(
    gateway.includes(SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE),
    'mensagem amigável',
  );

  const providers = read('lib/payments/providers/index.ts');
  assert(providers.includes('assertSaasPaymentGatewayConfigured'), 'provider usa assert');

  const api = read('app/api/master/saas-charges/route.ts');
  assert(api.includes('assertSaasPaymentGatewayConfigured'), 'API valida gateway');
  assert(api.includes('503'), 'API retorna 503 sem gateway');

  const origNode = process.env.NODE_ENV;
  const origKey = process.env.ASAAS_API_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ASAAS_API_KEY;
    assert(isProductionPaymentEnvironment(), 'NODE_ENV production simulado');
    assert(!isSaasPaymentGatewayConfigured(), 'produção sem key não configurada');
    let threw = false;
    try {
      assertSaasPaymentGatewayConfigured();
    } catch (e) {
      threw = true;
      assert(
        (e as Error).message.includes('ASAAS_API_KEY'),
        'erro claro em produção sem key',
      );
    }
    assert(threw, 'assert lança em produção sem key');

    process.env.NODE_ENV = 'development';
    assert(isSaasPaymentGatewayConfigured(), 'development permite mock');
    assert(resolvePaymentProviderName() === 'mock', 'dev usa mock');
  } finally {
    process.env.NODE_ENV = origNode;
    if (origKey !== undefined) process.env.ASAAS_API_KEY = origKey;
    else delete process.env.ASAAS_API_KEY;
  }
}

function testSaasFinanceGatewayUi() {
  const saasFinance = read('app/saas-finance/page.tsx');
  assert(saasFinance.includes('paymentGateway'), 'estado gateway');
  assert(saasFinance.includes('Gateway PIX não configurado'), 'banner gateway');
  assert(saasFinance.includes('!gatewayReady'), 'botão desabilitado sem gateway');
  assert(saasFinance.includes('/api/master/saas-charges'), 'consulta status gateway');
  assert(saasFinance.includes('Ver cobrança'), 'botão ver cobrança');
  assert(saasFinance.includes('Copiar PIX'), 'botão copiar PIX');
  assert(saasFinance.includes('Abrir Asaas'), 'botão abrir Asaas');
  assert(saasFinance.includes('Atualizar status'), 'botão atualizar status');
  assert(saasFinance.includes('buildSaasInvoiceChargeRows'), 'merge faturas + charges');
  assert(saasFinance.includes('SaasChargeViewModal'), 'modal cobrança');
}

function testProviderArchitecture() {
  const index = read('lib/payments/providers/index.ts');
  assert(index.includes('AsaasPaymentProvider'), 'provider Asaas');
  assert(index.includes('MockPaymentProvider'), 'provider mock');
  assert(fs.existsSync(path.join(ROOT, 'lib/payments/providers/efi.ts')), 'stub efi');
}

function testWebhookRouteStructure() {
  const webhook = read('app/api/payments/webhook/route.ts');
  assert(webhook.includes('handleAsaasPaymentWebhook'), 'webhook delega ao handler');
  const handler = read('lib/saasAsaasWebhook.ts');
  assert(handler.includes('ignored: true'), 'handler retorna ignored');
  assert(!handler.includes('status: 500'), 'handler não retorna 500 ao Asaas');
}

function makeWebhookRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function mockWebhookDeps(processPaidImpl: AsaasWebhookDeps['processPaid']): AsaasWebhookDeps {
  return {
    createSupabase: () => ({
      client: {} as never,
    }),
    processPaid: processPaidImpl,
  };
}

async function testWebhookResponses() {
  const origToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-test-token';

  try {
    const deps = mockWebhookDeps(async () => {
      throw new Error('Cobrança não encontrada.');
    });

    const paidRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_RECEIVED',
          payment: { id: 'pay_unknown', status: 'RECEIVED' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(paidRes.status === 200, 'PAYMENT_RECEIVED sem cobrança → HTTP 200');
    const paidBody = await paidRes.json();
    assert(paidBody.ok === true && paidBody.ignored === true, 'PAYMENT_RECEIVED ignored=true');
    assert(
      String(paidBody.reason).includes('Cobrança não encontrada'),
      'motivo cobrança ausente',
    );

    const unknownRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_DELETED',
          payment: { id: 'pay_1', status: 'DELETED' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(unknownRes.status === 200, 'evento desconhecido → HTTP 200');
    const unknownBody = await unknownRes.json();
    assert(unknownBody.ignored === true, 'evento desconhecido ignored=true');
    assert(String(unknownBody.reason).includes('Evento não tratado'), 'motivo evento desconhecido');

    const noIdRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        { event: 'PAYMENT_RECEIVED', payment: { status: 'RECEIVED' } },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(noIdRes.status === 200, 'sem payment.id → HTTP 200');
    const noIdBody = await noIdRes.json();
    assert(noIdBody.ignored === true, 'sem payment.id ignored=true');
    assert(String(noIdBody.reason).includes('payment.id ausente'), 'motivo payment.id ausente');

    const invalidTokenRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
        { 'asaas-access-token': 'token-errado' },
      ),
      deps,
    );
    assert(invalidTokenRes.status === 401, 'token inválido → HTTP 401');

    const invalidJsonRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest('{ invalid json', { 'asaas-access-token': 'webhook-test-token' }),
      deps,
    );
    assert(invalidJsonRes.status === 400, 'JSON inválido → HTTP 400');
  } finally {
    if (origToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = origToken;
  }
}

function testFinancialStatusRules() {
  const emDia = resolveSaasFinancialSituation({
    company: { id: 'c1', active: true, status_operacional: 'Ativa' },
    subscription: {
      id: 's1',
      company_id: 'c1',
      next_due_date: '2026-12-27',
      payment_status: 'paid',
      contract_status: 'active',
    } as never,
    nextDueDate: '2026-12-27',
    today: new Date('2026-06-01T12:00:00'),
  });
  assert(emDia.situation === 'EM DIA', 'EM DIA');
}

function testMonthlyAsaasChargeFlow() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('generateMonthlySaasCharges'), 'geração mensal via saas_charges');
  assert(saasCharges.includes('resolveSaasPixChargeSkipReasonAsync'), 'skip async asaas');
  assert(saasCharges.includes('isOrphanSaasCharge'), 'remove charge órfã');
  assert(saasCharges.includes("outcome: invoiceCreated ? 'created' : 'completed'"), 'backfill fatura existente');
  assert(saasCharges.includes('chargeId: charge.id'), 'externalReference = saas_charges.id');
  assert(saasCharges.includes('validateCompanyDocumentForAsaas'), 'valida CPF/CNPJ');
  assert(saasCharges.includes('resolveAsaasDueDate'), 'corrige dueDate');
  assert(saasCharges.includes('findExistingSaasPaymentForReference'), 'anti-duplicidade pagamento');
  assert(saasCharges.includes('syncSaasChargeStatusFromAsaas'), 'sync status Asaas');
  assert(saasCharges.includes('findSaasChargeRowForPayment'), 'localiza cobrança webhook');

  const api = read('app/api/master/saas-invoices/route.ts');
  assert(api.includes('generateMonthlySaasCharges'), 'API mensal usa fluxo real');
  assert(api.includes('assertSaasPaymentGatewayConfigured'), 'API mensal exige gateway');
  assert(api.includes('...result'), 'resposta repassa created/completed/skipped/errors');

  const chargesApi = read('app/api/master/saas-charges/route.ts');
  assert(chargesApi.includes("action === 'sync_status'"), 'API sync status');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('Faturas completadas com PIX'), 'alerta mensal detalhado');
  assert(page.includes('Erros por empresa'), 'erros por empresa no alerta');
  assert(page.includes("setMainTab('faturas')"), 'link aba faturas após cobrança');
}

function testSaasPixChargeSkipRules() {
  assert(classifyExternalChargeId('mock_abc_123') === 'mock', 'mock classificado');
  assert(classifyExternalChargeId('pay_abc123') === 'pay_asaas', 'pay classificado');
  assert(
    classifyExternalChargeId('59d38b25-61bb-4114-a8c1-8e34d9c78c2c') === 'legacy_uuid',
    'uuid legado classificado',
  );

  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: 'mock_abc' }, null) === null,
    'mock_* não bloqueia',
  );
  assert(
    resolveSaasPixChargeSkipReason(
      { external_charge_id: '59d38b25-61bb-4114-a8c1-8e34d9c78c2c' },
      null,
    ) === null,
    'external_charge_id legado (uuid) não bloqueia',
  );
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: 'pay_123' }, null) === null,
    'pay_ sozinho não bloqueia sync',
  );
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, { status: 'PENDING', payment_id: null }) ===
      null,
    'charge órfã PENDING sem payment_id não bloqueia',
  );
  assert(isOrphanSaasCharge({ status: 'PENDING', payment_id: null }), 'detecta órfã PENDING');
  const orphanOverdue = {
    status: 'OVERDUE' as const,
    payment_id: null,
    pix_copy_paste: null,
    payment_url: null,
    master_payment_id: null,
  };
  assert(isOrphanSaasCharge(orphanOverdue), 'detecta órfã OVERDUE sem payment_id');
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, orphanOverdue) === null,
    'OVERDUE órfã não bloqueia cobrança',
  );
  assert(
    resolveSaasPixChargeSkipReason(
      { external_charge_id: null },
      { status: 'PENDING', payment_id: 'pay_real' },
    ) === 'Cobrança PIX já existe para esta fatura',
    'PENDING com payment_id bloqueia',
  );
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, { status: 'PAID', payment_id: 'pay_1' }) ===
      'Cobrança PIX já existe para esta fatura',
    'saas_charges PAID bloqueia duplicata',
  );
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, null) === null,
    'fatura sem PIX permite criar cobrança',
  );
}

async function testSaasPixChargeSkipAsyncRules() {
  const blocked = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_valid' },
    null,
    async () => true,
  );
  assert(blocked === 'Fatura já possui cobrança Asaas', 'pay_ existente no Asaas bloqueia');

  const allowed = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_missing' },
    null,
    async () => {
      throw new Error('not found');
    },
  );
  assert(allowed === null, 'pay_ inexistente no Asaas permite backfill');
}

function testWebhookExternalReference() {
  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes('externalReference: input.chargeId'), 'Asaas usa chargeId como externalReference');
  const webhook = read('lib/saasAsaasWebhook.ts');
  assert(webhook.includes('chargeId: payment.externalReference'), 'webhook busca por externalReference');
  assert(webhook.includes('paymentId: payment.id'), 'webhook busca por payment_id');
}

function testReactivationAndHistory() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('reactivateCompanyOnPayment'), 'reativação automática');
  assert(saasCharges.includes("from('master_saas_payments')"), 'histórico');
  assert(saasCharges.includes('advanceSubscriptionAfterSaasPayment'), 'próximo vencimento');

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('findExistingSaasPaymentForReference'), 'idempotência pagamento');
  assert(billing.includes('advanceSubscriptionAfterSaasPayment'), 'avanço vencimento billing');
}

function testSaasPixValidation() {
  const invalid = validateCompanyDocumentForAsaas('Empresa Teste LTDA', '123');
  assert(!!invalid && invalid.includes('Empresa Teste LTDA'), 'CPF/CNPJ inválido com nome');
  assert(invalid!.includes('inválido'), 'mensagem inválido');

  const empty = validateCompanyDocumentForAsaas('Meneses', '');
  assert(!!empty && empty.includes('Meneses'), 'documento ausente com nome');

  assert(validateCompanyDocumentForAsaas('Ok', '12345678901') === null, 'CPF 11 dígitos ok');
  assert(validateCompanyDocumentForAsaas('Ok', '12345678000195') === null, 'CNPJ 14 dígitos ok');

  const today = new Date().toISOString().split('T')[0];
  assert(resolveAsaasDueDate('2020-01-01') === today, 'dueDate passado → hoje');
  assert(resolveAsaasDueDate('2099-12-31') === '2099-12-31', 'dueDate futuro mantido');
}

function testSaasInvoiceChargeView() {
  const rows = buildSaasInvoiceChargeRows(
    [
      {
        id: 'inv-1',
        company_id: 'co-1',
        company_name: 'Meneses',
        reference_month: '2026-06',
        final_amount: 549.99,
        due_date: '2026-06-27',
        status: 'PENDENTE',
        external_charge_id: null,
      } as never,
    ],
    [
      {
        id: 'ch-1',
        company_id: 'co-1',
        invoice_id: 'inv-1',
        amount: 549.99,
        due_date: '2026-06-27',
        status: 'PENDING',
        payment_provider: 'asaas',
        payment_id: 'pay_abc123456789',
        pix_copy_paste: '00020126580014BR.GOV.BCB.PIX',
        payment_url: 'https://sandbox.asaas.com/i/abc',
        pix_qr_code: '<svg></svg>',
      } as never,
    ],
  );

  assert(rows.length === 1, 'uma linha merged');
  assert(rows[0].pixCopyPaste?.includes('BR.GOV.BCB.PIX'), 'PIX na linha');
  assert(rows[0].paymentUrl?.includes('asaas.com'), 'link Asaas');
  assert(rows[0].hasCharge === true, 'tem charge');
  assert(truncatePaymentId('pay_abc123456789').includes('…'), 'payment id truncado');
  assert(truncatePaymentId(null) === '—', 'payment id vazio');

  const fallback = buildSaasInvoiceChargeRows(
    [
      {
        id: 'inv-2',
        company_id: 'co-2',
        company_name: 'Legado',
        reference_month: '2026-05',
        final_amount: 100,
        due_date: '2026-05-10',
        status: 'PENDENTE',
        pix_code: '00020126580014BR.GOV.BCB.PIX',
        external_charge_id: 'pay_legacy',
      } as never,
    ],
    [],
  );
  assert(fallback[0].pixCopyPaste?.includes('PIX'), 'fallback invoice pix_code');
  assert(fallback[0].paymentId === 'pay_legacy', 'fallback external_charge_id');
}

function testAdvanceSubscriptionDueDate() {
  const next = addOneMonthToIsoDate('2026-06-27');
  assert(next === '2026-07-27', 'próximo vencimento +1 mês');
}

function testDuplicateChargeProtection() {
  const menesesCharge = {
    status: 'PENDING' as const,
    payment_id: 'pay_meneses_abc',
    pix_copy_paste: null,
    payment_url: null,
    master_payment_id: null,
  };
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, menesesCharge) ===
      'Cobrança PIX já existe para esta fatura',
    'Meneses: saas_charges PENDING+payment_id bloqueia 2ª cobrança',
  );
  assert(isProtectedSaasCharge(menesesCharge), 'charge protegida com payment_id');

  assert(
    resolveSaasPixChargeSkipReason(
      { external_charge_id: null },
      { status: 'PAID', payment_id: 'pay_1', pix_copy_paste: null, payment_url: null, master_payment_id: 'mp-1' },
    ) !== null,
    'PAID bloqueia nova cobrança',
  );

  const orphanOverdue = {
    status: 'OVERDUE' as const,
    payment_id: null,
    pix_copy_paste: null,
    payment_url: null,
    master_payment_id: null,
  };
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, orphanOverdue) === null,
    'OVERDUE sem payment_id/PIX não bloqueia',
  );

  const protectedOverdue = {
    status: 'OVERDUE' as const,
    payment_id: 'pay_overdue_real',
    pix_copy_paste: null,
    payment_url: null,
    master_payment_id: null,
  };
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: null }, protectedOverdue) !== null,
    'OVERDUE com payment_id bloqueia nova cobrança',
  );

  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('findExistingSaasPaymentForReference'), 'pagamento confirmado bloqueia create');
  assert(saasCharges.includes('generateMonthlySaasCharges'), 'mensal usa createSaasPixCharge');
  assert(saasCharges.includes('createSaasPixCharge'), 'individual usa createSaasPixCharge');
  assert(saasCharges.includes("status: 'CANCELLED'"), 'órfãs canceladas antes do backfill');

  const monthlyApi = read('app/api/master/saas-invoices/route.ts');
  const individualApi = read('app/api/master/saas-charges/route.ts');
  assert(monthlyApi.includes('generateMonthlySaasCharges'), 'API mensal centralizada');
  assert(individualApi.includes('createSaasPixCharge'), 'API individual centralizada');
}

function testPhantomInvoiceAndDiagnoseEndpoint() {
  assert(
    isPhantomSaasInvoice({
      final_amount: 0,
      amount: 0,
      status: 'PAGO',
      external_charge_id: 'mock_abc',
    }),
    'fatura mock PAGO valor 0 é fantasma',
  );
  assert(
    !isPhantomSaasInvoice({
      final_amount: 10,
      amount: 10,
      status: 'PENDENTE',
      external_charge_id: null,
    }),
    'fatura real não é fantasma',
  );

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('isPhantomSaasInvoice'), 'detecção fatura fantasma');
  assert(billing.includes('repairPhantomSaasInvoiceIfNeeded'), 'reparo fatura fantasma');
  assert(billing.includes('Number(data.amount || 0) <= 0'), 'pagamento mock amount 0 ignorado');

  assert(
    !fs.existsSync(path.join(ROOT, 'app/api/setup/diagnose-saas-charge/route.ts')),
    'endpoint diagnóstico público removido',
  );
}

function testPaymentRegistrationIdempotency() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(
    saasCharges.includes("charge.status === 'PAID' && charge.master_payment_id"),
    'processSaasChargePaid retorno idempotente',
  );
  assert(saasCharges.includes('findExistingSaasPaymentForReference'), 'charge paid checa pagamento existente');

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('findExistingSaasPaymentForReference'), 'markInvoicePaid idempotente');
  assert(!billing.includes('vencimento_plano: nextDue'), 'vencimento_plano via companyNextPaymentPatch');
  assert(billing.includes('companyNextPaymentPatch'), 'patch centralizado de vencimento');
  assert(!billing.includes('vencimento_plano'), 'billing não grava vencimento_plano');
}

function testTopografiaChargeWithoutVencimentoPlano() {
  const TOPOGRAFIA_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';
  const TOPOGRAFIA_CNPJ = '12631238000102';

  const financialStatus = read('lib/saasCompanyFinancialStatus.ts');
  assert(!financialStatus.includes('vencimento_plano'), 'status financeiro não consulta vencimento_plano');

  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('updateCompanyFinancialStatus'), 'create charge atualiza status financeiro');

  for (const rel of [
    'lib/saasBilling.ts',
    'lib/saasSubscriptionService.ts',
    'lib/saasContractService.ts',
    'lib/saasCompanyFinancialStatus.ts',
    'app/api/companies/update/route.ts',
    'app/api/company-subscriptions/[id]/route.ts',
    'app/api/master/subscription-action/route.ts',
  ]) {
    assert(!read(rel).includes('vencimento_plano'), `${rel} sem vencimento_plano`);
  }

  assert(
    validateCompanyDocumentForAsaas('SV TOPOGRAFIA E PROJETOS LTDA', TOPOGRAFIA_CNPJ) === null,
    'Topografia CNPJ válido para Asaas',
  );

  const patch = companyNextPaymentPatch('2026-07-20');
  assert(patch.next_payment_date === '2026-07-20', 'patch next_payment_date Topografia');
  assert(!('vencimento_plano' in patch), 'patch sem vencimento_plano legado');

  const dates = read('lib/companySubscriptionDates.ts');
  assert(dates.includes('subscription?.next_due_date'), 'normalize usa subscription.next_due_date');
  assert(!dates.includes('company?.vencimento_plano'), 'normalize não lê vencimento_plano');

  void TOPOGRAFIA_ID;
}

function testAsaasSyncStatus() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('syncSaasChargeStatusFromAsaas'), 'sync status Asaas');
  assert(saasCharges.includes('getChargeStatus'), 'consulta provider');
  assert(saasCharges.includes('processSaasChargePaid'), 'sync PAID registra pagamento');

  const api = read('app/api/master/saas-charges/route.ts');
  assert(api.includes("action === 'sync_status'"), 'endpoint sync_status');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('sync_status'), 'UI chama sync_status');
}

function testCompanyNextPaymentPatch() {
  const patch = companyNextPaymentPatch('2026-07-27');
  assert(patch.next_payment_date === '2026-07-27', 'next_payment_date');
  assert(!('vencimento_plano' in patch), 'sem vencimento_plano legado');
}

async function testWebhookPaymentIdempotency() {
  const origToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-test-token';

  let calls = 0;
  const deps = mockWebhookDeps(async () => {
    calls += 1;
    return {
      charge: { id: 'ch-1' } as never,
      paymentId: 'pay-master-1',
    };
  });

  try {
    const payload = {
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_same', status: 'RECEIVED', externalReference: 'ch-1' },
    };
    const req1 = makeWebhookRequest(payload, { 'asaas-access-token': 'webhook-test-token' });
    const req2 = makeWebhookRequest(payload, { 'asaas-access-token': 'webhook-test-token' });
    const res1 = await handleAsaasPaymentWebhook(req1, deps);
    const res2 = await handleAsaasPaymentWebhook(req2, deps);
    assert(res1.status === 200 && res2.status === 200, 'webhook idempotente HTTP 200');
    assert(calls === 2, 'handler delega processPaid (idempotência no lib)');
    const body1 = await res1.json();
    assert(body1.ok === true, 'webhook ok');
  } finally {
    if (origToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = origToken;
  }
}

function testDatabaseMigration() {
  const migration = read('supabase/migrations/20260720130000_saas_charges.sql');
  assert(migration.includes('saas_charges'), 'tabela saas_charges');
}

function testBillingPage() {
  assert(fs.existsSync(path.join(ROOT, 'app/billing/page.tsx')), 'página /billing');
}

function testChargeStatusMapping() {
  assert(mapProviderStatusToChargeStatus('RECEIVED') === 'PAID', 'RECEIVED → PAID');
  assert(saasChargeStatusLabel('PAID') === 'Pago', 'label pago');
  const status = getSaasPaymentGatewayStatus();
  assert(typeof status.configured === 'boolean', 'status gateway objeto');
}

async function run() {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ['geração cobrança PIX', testPixChargeGeneration],
    ['menu /billing ADMIN', testBillingMenuVisibility],
    ['produção sem mock', testProductionGatewayRules],
    ['UI gateway saas-finance', testSaasFinanceGatewayUi],
    ['arquitetura providers', testProviderArchitecture],
    ['webhook estrutura', testWebhookRouteStructure],
    ['webhook respostas Asaas', testWebhookResponses],
    ['fluxo mensal Asaas', testMonthlyAsaasChargeFlow],
    ['regras skip cobrança', testSaasPixChargeSkipRules],
    ['duplicidade mensal e individual', testDuplicateChargeProtection],
    ['fatura fantasma e endpoint diagnóstico', testPhantomInvoiceAndDiagnoseEndpoint],
    ['pagamento registrado não duplica', testPaymentRegistrationIdempotency],
    ['Topografia sem vencimento_plano', testTopografiaChargeWithoutVencimentoPlano],
    ['sync status Asaas', testAsaasSyncStatus],
    ['patch vencimento empresa', testCompanyNextPaymentPatch],
    ['regras skip async Asaas', testSaasPixChargeSkipAsyncRules],
    ['webhook externalReference', testWebhookExternalReference],
    ['status financeiro', testFinancialStatusRules],
    ['reativação e histórico', testReactivationAndHistory],
    ['validação PIX Asaas', testSaasPixValidation],
    ['view faturas + PIX', testSaasInvoiceChargeView],
    ['próximo vencimento pagamento', testAdvanceSubscriptionDueDate],
    ['webhook PAYMENT_RECEIVED idempotente', testWebhookPaymentIdempotency],
    ['migration saas_charges', testDatabaseMigration],
    ['página /billing', testBillingPage],
    ['mapeamento status charge', testChargeStatusMapping],
  ];

  for (const [name, fn] of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }

  console.log(`\n${tests.length} grupos de testes SaaS payment OK.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
