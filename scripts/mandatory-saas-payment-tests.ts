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
  isLocalAsaasPaymentInactive,
  isOrphanSaasCharge,
  isProtectedSaasCharge,
  isSaasChargeBlockingDuplicate,
  isSaasInvoiceCancelled,
  resolveSaasPixChargeSkipReason,
  resolveSaasPixChargeSkipReasonAsync,
  saasChargeStatusLabel,
  shouldIgnoreInvoiceExternalChargeForRegeneration,
  shouldReconcileSaasChargeFromAsaasVerify,
} from '../lib/saasCharges';
import { isPhantomSaasInvoice } from '../lib/saasBilling';
import {
  buildSaasInvoiceChargeRows,
  pickBestChargeForInvoice,
  truncatePaymentId,
} from '../lib/saasInvoiceChargeView';
import {
  compareSaasChargeRows,
  DEFAULT_SAAS_CHARGE_SORT,
  saasChargeSortPresetToState,
  sortSaasInvoiceChargeRows,
  toggleSaasChargeColumnSort,
} from '../lib/saasChargeTableSort';
import { addOneMonthToIsoDate, companyNextPaymentPatch, todayBrazilIsoDate } from '../lib/companySubscriptionDates';
import { resolveSaasFinancialSituation } from '../lib/masterSaasFinancialStatus';
import { shouldShowFullTenantAdminMenu, isBrokerRole, isOwnerRole } from '../lib/rolePermissions';
import {
  handleAsaasPaymentWebhook,
  type AsaasWebhookDeps,
} from '../lib/saasAsaasWebhook';
import {
  validateCompanyDocumentForAsaas,
  resolveAsaasDueDate,
  resolveSaasChargeDueDate,
} from '../lib/saasPixValidation';
import {
  isSaasChargeStatusBlockedForReminder,
  isSaasChargeStatusEligibleForReminder,
  resolveReminderTypesForCharge,
} from '../lib/saasBillingReminderTypes';
import { isCronSecretValid, resolveCronSecret, resolveCronSecrets } from '../lib/saasCronAuth';
import { buildSaasBillingReminderEmailHtml } from '../lib/saasBillingReminderEmail';
import {
  buildSaasBillingReminderWhatsAppMessage,
  isSaasBillingWhatsAppConfigured,
  normalizeBrazilianWhatsAppPhone,
} from '../lib/saasBillingReminderWhatsApp';
import { isZapiConfigured, sendText } from '../lib/whatsapp/zapiProvider';
import {
  SAAS_WHATSAPP_TEST_MESSAGE,
  sendSaasWhatsAppTest,
} from '../lib/saasWhatsAppTest';
import {
  DEFAULT_FINE_PERCENT,
  DEFAULT_INTEREST_PERCENT,
  hasAsaasLateFeesConfigured,
  isSaasChargeEligibleForLateFeeUpdate,
  isSaasChargeOpenForLateFeeDisplay,
  resolveSaasLateFeePercents,
} from '../lib/saasLateFeeConfig';
import { shouldSkipLateFeeForAsaasStatus } from '../lib/saasLateFees';

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
  const chargesTable = read('components/master/saas/SaasChargesTable.tsx');
  const chargeModal = read('components/master/SaasChargeViewModal.tsx');
  const workspace = read('components/master/saas/SaasCompanyWorkspace.tsx');

  assert(saasFinance.includes('paymentGateway'), 'estado gateway');
  assert(saasFinance.includes('Gateway PIX não configurado'), 'banner gateway');
  assert(saasFinance.includes('!gatewayReady'), 'botão desabilitado sem gateway');
  assert(saasFinance.includes('/api/master/saas-charges'), 'consulta status gateway');
  assert(saasFinance.includes('SaasChargesTable'), 'tabela cobranças refatorada');
  assert(saasFinance.includes('SaasCompanyWorkspace'), 'workspace empresa');
  assert(saasFinance.includes('chargeActionHandlers'), 'handlers centralizados');
  assert(chargesTable.includes('Ver cobrança'), 'ação ver cobrança no dropdown');
  assert(chargesTable.includes('Atualizar status'), 'ação sync no dropdown');
  assert(chargesTable.includes('Enviar WhatsApp'), 'ação whatsapp');
  assert(chargesTable.includes('Enviar E-mail'), 'ação e-mail');
  assert(chargesTable.includes('SAAS_CHARGE_SORT_PRESET_OPTIONS'), 'dropdown ordenação cobranças');
  assert(chargesTable.includes('SortableHeader'), 'cabeçalhos ordenáveis cobranças');
  assert(chargesTable.includes('DEFAULT_SAAS_CHARGE_SORT'), 'ordenacao padrao vencimento');
  assert(chargeModal.includes('Copiar PIX'), 'copiar PIX no modal');
  assert(workspace.includes('SaasContractPanel'), 'contrato no workspace');
  assert(workspace.includes('showGenerateButton'), 'workspace flag gerar cobrança');
  assert(workspace.includes('Gerar Cobrança'), 'workspace botão gerar cobrança');
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
  assert(handler.includes('processOverdue'), 'handler processa overdue');
  assert(handler.includes('processCancelled'), 'handler processa cancelled');
  assert(handler.includes('INFORMATIVE_EVENTS'), 'eventos informativos');
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

function mockWebhookDeps(
  processPaidImpl: AsaasWebhookDeps['processPaid'],
  overrides?: Partial<AsaasWebhookDeps>,
): AsaasWebhookDeps {
  return {
    createSupabase: () => ({
      client: {} as never,
    }),
    processPaid: processPaidImpl,
    processOverdue: overrides?.processOverdue ?? (async () => ({ charge: { id: 'ch-1' } as never })),
    processCancelled:
      overrides?.processCancelled ?? (async () => ({ charge: { id: 'ch-1' } as never })),
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

    const deletedRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_DELETED',
          payment: { id: 'pay_1', status: 'DELETED', externalReference: 'ch-1' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      mockWebhookDeps(async () => {
        throw new Error('should not call paid');
      }),
    );
    assert(deletedRes.status === 200, 'PAYMENT_DELETED → HTTP 200');
    const deletedBody = await deletedRes.json();
    assert(deletedBody.ok === true && !deletedBody.ignored, 'PAYMENT_DELETED processado');

    const unknownRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'UNKNOWN_EVENT_X',
          payment: { id: 'pay_1', status: 'PENDING' },
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
  assert(page.includes("setPanelView('cobrancas')"), 'view cobranças após geração mensal');
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
    { external_charge_id: 'pay_valid', status: 'PENDENTE' },
    null,
    async () => 'blocking',
  );
  assert(blocked === 'Fatura já possui cobrança Asaas', 'pay_ ativo no Asaas bloqueia');

  const allowedMissing = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_missing', status: 'PENDENTE' },
    null,
    async () => {
      throw new Error('not found');
    },
  );
  assert(allowedMissing === null, 'pay_ inexistente no Asaas permite nova cobrança');

  const allowedCancelledInvoice = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_old', status: 'CANCELADO' },
    null,
    async () => 'blocking',
  );
  assert(allowedCancelledInvoice === null, 'fatura cancelada ignora external_charge_id legado');

  const allowedInactiveAsaas = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_cancelled', status: 'PENDENTE' },
    null,
    async () => 'inactive',
  );
  assert(allowedInactiveAsaas === null, 'pay_ cancelado/inativo no Asaas permite nova cobrança');

  const allowedLocalCancel = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_local_cancel', status: 'PENDENTE' },
    null,
    async () => 'blocking',
    {
      invoiceCharges: [
        {
          status: 'CANCELLED',
          payment_id: 'pay_local_cancel',
          pix_copy_paste: null,
          payment_url: null,
          master_payment_id: null,
          deleted_at: null,
        },
      ],
    },
  );
  assert(
    allowedLocalCancel === null,
    'cancelar localmente permite regenerar mesmo se Asaas ainda responder',
  );

  const allowedLocalDelete = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_local_delete', status: 'PENDENTE' },
    null,
    async () => 'blocking',
    {
      invoiceCharges: [
        {
          status: 'CANCELLED',
          payment_id: 'pay_local_delete',
          pix_copy_paste: null,
          payment_url: null,
          master_payment_id: null,
          deleted_at: '2026-06-20T12:00:00.000Z',
        },
      ],
    },
  );
  assert(allowedLocalDelete === null, 'excluir (soft delete) permite regenerar na mesma competência');

  const menesesInactiveCharges = [
    {
      status: 'CANCELLED' as const,
      payment_id: 'pay_meneses_old',
      pix_copy_paste: null,
      payment_url: 'https://asaas.com/boleto/old',
      master_payment_id: null,
      deleted_at: '2026-07-08T12:00:00.000Z',
    },
  ];
  assert(
    shouldIgnoreInvoiceExternalChargeForRegeneration(null, menesesInactiveCharges),
    'Meneses: sem cobrança ativa local',
  );
  const menesesOrphanPay = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_meneses_orphan', status: 'PENDENTE' },
    null,
    async () => 'blocking',
    { invoiceCharges: menesesInactiveCharges },
  );
  assert(
    menesesOrphanPay === null,
    'Meneses: pay_ legado na fatura não bloqueia após cancelar/excluir cobranças',
  );

  const menesesStillActive = await resolveSaasPixChargeSkipReasonAsync(
    { external_charge_id: 'pay_meneses_active', status: 'PENDENTE' },
    {
      status: 'PENDING',
      payment_id: 'pay_meneses_active',
      pix_copy_paste: null,
      payment_url: null,
      master_payment_id: null,
      deleted_at: null,
    },
    async () => 'blocking',
    { invoiceCharges: [] },
  );
  assert(
    menesesStillActive === 'Cobrança PIX já existe para esta fatura',
    'Meneses: cobrança ativa continua bloqueando',
  );
}

function testSaasChargeDueDateFromModal() {
  assert(
    resolveSaasChargeDueDate('2026-07-27', '2026-06-27') === '2026-07-27',
    'Jul/2026 vencimento 27/07 prevalece sobre fatura 27/06',
  );
  assert(
    resolveSaasChargeDueDate(undefined, '2026-06-27') === '2026-06-27',
    'sem vencimento solicitado mantém due_date da fatura',
  );
  assert(
    resolveSaasChargeDueDate('2026-08-15', '2026-07-27') === '2026-08-15',
    'competência e vencimento em meses diferentes são preservados',
  );

  const billing = read('lib/saasBilling.ts');
  assert(
    billing.includes('applyRequestedDueDateToExistingInvoice'),
    'fatura existente recebe due_date solicitado',
  );
  assert(
    billing.includes('resolveAsaasDueDate(options.dueDate)'),
    'nova fatura usa dueDate do modal',
  );

  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('[saas-charge-create-payload]'), 'log payload create');
  assert(saasCharges.includes('[saas-charge-create-result]'), 'log result create');
  assert(saasCharges.includes('resolveSaasChargeDueDate'), 'createSaasPixCharge usa dueDate solicitado');
  assert(saasCharges.includes('dueDate: resolvedDueDate'), 'Asaas recebe resolvedDueDate');
  assert(saasCharges.includes('syncSaasDueDatesFromAsaas'), 'sync atualiza due_date local');

  const route = read('app/api/master/saas-charges/route.ts');
  assert(route.includes('dueDate: body.dueDate'), 'API repassa dueDate do modal');

  const modal = read('components/master/saas/SaasGenerateChargeModal.tsx');
  assert(modal.includes('dueDate') && modal.includes('referenceMonth'), 'modal envia dueDate e competência');
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
  assert(saasCharges.includes('[saas-charge-skip]'), 'log diagnóstico skip cobrança');
  assert(saasCharges.includes('findConfirmedSaasPaymentForReference'), 'pagamento confirmado real');
  assert(saasCharges.includes('reopenInvoiceWhenSafeForRegeneration'), 'reabre fatura sem cobrança ativa');

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('findExistingSaasPaymentForReference'), 'idempotência pagamento');
  assert(billing.includes('findConfirmedSaasPaymentForReference'), 'bloqueio só pagamento confirmado');
  assert(billing.includes('advanceSubscriptionAfterSaasPayment'), 'avanço vencimento billing');

  const financePage = read('app/saas-finance/page.tsx');
  assert(
    financePage.includes('formatChargeSkipAlert') && !financePage.includes('normalizeChargeSkipMessage'),
    'UI exibe motivo real do skip',
  );
  assert(financePage.includes('json.skipCode'), 'UI repassa skipCode');
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

function testSaasChargeTableSort() {
  type Row = ReturnType<typeof buildSaasInvoiceChargeRows>[number];

  const row = (
    partial: Partial<Row> & Pick<Row, 'invoiceId' | 'dueDate'>,
  ): Row => ({
    invoiceId: partial.invoiceId,
    companyId: partial.companyId || 'c1',
    companyName: partial.companyName || 'Empresa',
    referenceMonth: partial.referenceMonth || '2026-07',
    amount: partial.amount ?? 100,
    dueDate: partial.dueDate,
    invoiceStatus: partial.invoiceStatus || 'PENDENTE',
    chargeStatus: partial.chargeStatus ?? 'PENDING',
    asaasStatus: partial.asaasStatus || 'Pendente',
    paymentId: partial.paymentId ?? 'pay_test',
    paymentProvider: partial.paymentProvider ?? 'asaas',
    billingType: partial.billingType || 'PIX',
    pixCopyPaste: partial.pixCopyPaste ?? 'BR.GOV.BCB.PIX',
    pixQrCode: partial.pixQrCode ?? null,
    paymentUrl: partial.paymentUrl ?? null,
    invoiceUrl: partial.invoiceUrl ?? null,
    bankSlipUrl: partial.bankSlipUrl ?? null,
    bankSlipIdentification: partial.bankSlipIdentification ?? null,
    chargeId: partial.chargeId ?? 'ch1',
    hasCharge: partial.hasCharge ?? true,
  });

  assert(
    DEFAULT_SAAS_CHARGE_SORT.column === 'dueDate' && DEFAULT_SAAS_CHARGE_SORT.direction === 'asc',
    'ordenacao padrao due_date ASC',
  );

  const byDue = sortSaasInvoiceChargeRows(
    [
      row({ invoiceId: 'a', dueDate: '2026-08-15' }),
      row({ invoiceId: 'b', dueDate: '2026-07-15' }),
      row({ invoiceId: 'c', dueDate: '2026-07-27' }),
      row({ invoiceId: 'd', dueDate: '2026-07-19' }),
    ],
    DEFAULT_SAAS_CHARGE_SORT,
  );
  assert(
    byDue.map((r) => r.dueDate).join(',') === '2026-07-15,2026-07-19,2026-07-27,2026-08-15',
    'vencimento ASC mais proximo primeiro',
  );

  const byDueDesc = sortSaasInvoiceChargeRows(byDue, saasChargeSortPresetToState('due_desc'));
  assert(byDueDesc[0]?.dueDate === '2026-08-15', 'vencimento DESC');

  const byCompany = sortSaasInvoiceChargeRows(
    [
      row({ invoiceId: 'a', dueDate: '2026-07-01', companyName: 'SV Topografia' }),
      row({ invoiceId: 'b', dueDate: '2026-07-02', companyName: 'Ivanilde de Moura Silva' }),
      row({ invoiceId: 'c', dueDate: '2026-07-03', companyName: 'Meneses Imobiliária' }),
    ],
    saasChargeSortPresetToState('company_asc'),
  );
  assert(byCompany[0]?.companyName === 'Ivanilde de Moura Silva', 'empresa A-Z');

  const byStatus = sortSaasInvoiceChargeRows(
    [
      row({ invoiceId: 'paid', dueDate: '2026-08-19', chargeStatus: 'PAID', invoiceStatus: 'PAGO' }),
      row({ invoiceId: 'pend', dueDate: '2026-07-19', chargeStatus: 'PENDING' }),
      row({ invoiceId: 'over', dueDate: '2026-06-15', chargeStatus: 'OVERDUE', invoiceStatus: 'VENCIDO' }),
      row({ invoiceId: 'cancel', dueDate: '2026-09-15', chargeStatus: 'CANCELLED' }),
    ],
    saasChargeSortPresetToState('status'),
  );
  assert(byStatus.map((r) => r.invoiceId).join(',') === 'over,pend,paid,cancel', 'prioridade status ASC');
  assert(
    compareSaasChargeRows(byStatus[0]!, byStatus[1]!, saasChargeSortPresetToState('status')) < 0,
    'VENCIDA antes de GERADA',
  );
  assert(
    byStatus[1]?.dueDate === '2026-07-19' && byStatus[0]?.dueDate === '2026-06-15',
    'dentro do grupo status mantem vencimento',
  );

  const toggled = toggleSaasChargeColumnSort(DEFAULT_SAAS_CHARGE_SORT, 'dueDate');
  assert(toggled.direction === 'desc', 'segundo clique cabecalho inverte direcao');
  const newCol = toggleSaasChargeColumnSort(toggled, 'amount');
  assert(newCol.column === 'amount' && newCol.direction === 'asc', 'primeiro clique nova coluna ASC');
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

  const picked = pickBestChargeForInvoice(
    [
      {
        id: 'ch-orphan',
        invoice_id: 'inv-topo',
        status: 'CANCELLED',
        payment_id: null,
        created_at: '2026-06-20T10:00:00Z',
      } as never,
      {
        id: 'ch-real',
        invoice_id: 'inv-topo',
        status: 'PENDING',
        payment_id: 'pay_topo_real',
        pix_copy_paste: '000201PIXREAL',
        pix_qr_code: 'data:image/png;base64,abc',
        payment_url: 'https://www.asaas.com/i/topo',
        created_at: '2026-06-20T09:00:00Z',
      } as never,
    ],
    'inv-topo',
  );
  assert(picked?.id === 'ch-real', 'UI prefere charge real com PIX sobre órfã');

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

function testAsaasPixProviderAndRefresh() {
  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes('fetchAsaasPixQrCode'), 'retry pixQrCode Asaas');
  assert(asaas.includes('/payments/${paymentId}/pixQrCode'), 'GET pixQrCode');
  assert(asaas.includes('`/payments/${payment.id}`'), 'GET payment após POST');
  assert(asaas.includes('fetchAsaasPaymentPixData'), 'backfill PIX existente');

  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('refreshSaasChargePixFromAsaas'), 'refresh PIX backfill');

  const api = read('app/api/master/saas-charges/route.ts');
  assert(api.includes("action === 'refresh_pix'"), 'endpoint refresh_pix');
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

  const cancelledCharge = {
    status: 'CANCELLED' as const,
    payment_id: 'pay_cancelled_old',
    pix_copy_paste: 'pix-old',
    payment_url: 'https://asaas.com/old',
    master_payment_id: null,
    deleted_at: null,
  };
  assert(!isSaasChargeBlockingDuplicate(cancelledCharge), 'CANCELLED não bloqueia nova cobrança');
  assert(
    resolveSaasPixChargeSkipReason({ external_charge_id: 'pay_cancelled_old', status: 'PENDENTE' }, cancelledCharge) ===
      null,
    'CANCELLED permite nova cobrança na mesma competência',
  );

  const softDeletedCharge = {
    status: 'PENDING' as const,
    payment_id: 'pay_soft_deleted',
    pix_copy_paste: null,
    payment_url: null,
    master_payment_id: null,
    deleted_at: '2026-06-20T12:00:00.000Z',
  };
  assert(!isSaasChargeBlockingDuplicate(softDeletedCharge), 'soft-deleted não bloqueia');

  assert(isSaasInvoiceCancelled({ status: 'CANCELADO' }), 'fatura cancelada detectada');

  assert(
    isLocalAsaasPaymentInactive('pay_x', [
      { status: 'CANCELLED', payment_id: 'pay_x', deleted_at: null },
    ]),
    'cancelar → payment_id inativo localmente',
  );
  assert(
    isLocalAsaasPaymentInactive('pay_y', [
      {
        status: 'PENDING',
        payment_id: 'pay_y',
        deleted_at: '2026-06-01T00:00:00.000Z',
      },
    ]),
    'excluir → payment_id inativo localmente',
  );
  assert(
    !isLocalAsaasPaymentInactive('pay_z', [
      { status: 'PENDING', payment_id: 'pay_z', deleted_at: null },
    ]),
    'cobrança ativa continua bloqueando',
  );
  assert(shouldReconcileSaasChargeFromAsaasVerify('missing'), 'pay_ ausente no Asaas reconcilia');
  assert(shouldReconcileSaasChargeFromAsaasVerify('inactive'), 'pay_ inativo no Asaas reconcilia');
  assert(!shouldReconcileSaasChargeFromAsaasVerify('blocking'), 'pay_ ativo no Asaas não reconcilia');

  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('findExistingSaasPaymentForReference'), 'pagamento confirmado bloqueia create');
  assert(saasCharges.includes('generateMonthlySaasCharges'), 'mensal usa createSaasPixCharge');
  assert(saasCharges.includes('createSaasPixCharge'), 'individual usa createSaasPixCharge');
  assert(saasCharges.includes("status: 'CANCELLED'"), 'órfãs canceladas antes do backfill');
  assert(saasCharges.includes('isSaasChargeBlockingDuplicate'), 'bloqueio só cobranças ativas');
  assert(saasCharges.includes('reconcileSaasChargesBeforeRegeneration'), 'reconcilia pay_ ausente no Asaas');
  assert(saasCharges.includes('shouldIgnoreInvoiceExternalChargeForRegeneration'), 'ignora pay_ legado na fatura');
  assert(saasCharges.includes('detachSaasInvoiceFromGateway'), 'cancel/excluir limpa gateway da fatura');

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('reopenSaasInvoiceForNewCharge'), 'reabre fatura ao emitir nova cobrança');

  const migration = read('supabase/migrations/20260815120000_saas_charges_active_invoice_unique.sql');
  assert(migration.includes('idx_saas_charges_active_invoice_unique'), 'índice parcial cobrança ativa');

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
  assert(fs.existsSync(path.join(ROOT, 'app/minha-assinatura/page.tsx')), 'alias /minha-assinatura');
  assert(
    fs.existsSync(path.join(ROOT, 'components/billing/CompanyBillingPortal.tsx')),
    'portal billing empresa',
  );
}

function testTenantBillingAuth() {
  const server = read('lib/supabase/server.ts');
  assert(server.includes('CALLER_PROFILE_SELECT'), 'select perfil sem company_id');
  assert(!server.includes('company_id, name'), 'resolveCallerProfile sem colunas inválidas');

  const auth = read('lib/tenantBillingAuth.ts');
  assert(auth.includes('isTenantEnterpriseAdminRole'), 'auth usa admin empresa');
  assert(auth.includes('resolveUsersTenantId'), 'auth usa tenant_id');

  const route = read('app/api/billing/route.ts');
  assert(route.includes('buildSaasInvoiceChargeRows'), 'api retorna rows');
  assert(route.includes('syncSaasChargeStatusFromAsaas'), 'api sync status tenant');
  assert(route.includes('authorizeTenantBilling'), 'api usa auth centralizada');
}

function testChargeStatusMapping() {
  assert(mapProviderStatusToChargeStatus('RECEIVED') === 'PAID', 'RECEIVED → PAID');
  assert(mapProviderStatusToChargeStatus('DELETED') === 'CANCELLED', 'DELETED → CANCELLED');
  assert(saasChargeStatusLabel('PAID') === 'Pago', 'label pago');
  const status = getSaasPaymentGatewayStatus();
  assert(typeof status.configured === 'boolean', 'status gateway objeto');
}

function testBoletoSupport() {
  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes("billingType === 'BOLETO' ? 'BOLETO' : 'PIX'"), 'Asaas billingType BOLETO');
  assert(asaas.includes('bankSlipUrl'), 'Asaas bankSlipUrl');
  assert(asaas.includes('invoiceUrl'), 'Asaas invoiceUrl');
  assert(asaas.includes('bankSlipIdentification'), 'Asaas identification boleto');

  const migration = read('supabase/migrations/20260808120000_saas_charges_boleto.sql');
  assert(migration.includes('billing_type'), 'migration billing_type');
  assert(migration.includes('bank_slip_url'), 'migration bank_slip_url');

  const charges = read('lib/saasCharges.ts');
  assert(charges.includes('billingType'), 'create charge billingType');
  assert(charges.includes('processSaasChargeOverdue'), 'process overdue');
  assert(charges.includes('processSaasChargeCancelled'), 'process cancelled');
  assert(charges.includes('autoSuspendCompanyIfEligible'), 'auto suspend');

  const mock = read('lib/payments/providers/mock.ts');
  assert(mock.includes("billingType === 'BOLETO'"), 'mock boleto');
}

async function testWebhookOverdueEvent() {
  const origToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-test-token';
  let overdueCalls = 0;

  try {
    const res = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_OVERDUE',
          payment: { id: 'pay_od', status: 'OVERDUE', externalReference: 'ch-od' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      mockWebhookDeps(async () => ({ charge: { id: 'x' } as never, paymentId: 'p' }), {
        processOverdue: async () => {
          overdueCalls += 1;
          return { charge: { id: 'ch-od' } as never };
        },
      }),
    );
    assert(res.status === 200, 'PAYMENT_OVERDUE HTTP 200');
    const body = await res.json();
    assert(body.ok === true && body.status === 'OVERDUE', 'overdue processado');
    assert(overdueCalls === 1, 'processOverdue chamado');
  } finally {
    if (origToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = origToken;
  }
}

function testAutoSuspendConfig() {
  const config = read('lib/saasMasterConfig.ts');
  assert(config.includes('SAAS_AUTO_SUSPEND_AFTER_DAYS = 10'), 'suspend 10 dias');
  assert(config.includes('ASAAS_SUPPORTS_COMBINED_PIX_BOLETO = false'), 'PIX+BOLETO doc');

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('SAAS_AUTO_SUSPEND_AFTER_DAYS'), 'billing usa constante suspend');
  assert(billing.includes('SAAS_COMPANY_AUTO_REACTIVATED'), 'audit reativação');

  const automations = read('lib/masterSaasPanel.ts');
  assert(automations.includes("id: 'auto_suspend'"), 'regra auto_suspend');
  assert(automations.includes('enabled: true'), 'auto_suspend ativo');
}

function testChargesUiBoleto() {
  const table = read('components/master/saas/SaasChargesTable.tsx');
  assert(table.includes('billingType'), 'UI forma cobrança');
  assert(table.includes('onCopyPix'), 'UI copiar PIX');
  assert(table.includes('onOpenBankSlip'), 'UI abrir boleto');
  assert(table.includes('Link Asaas'), 'UI link Asaas');
  assert(table.includes('showGenerateButton'), 'flag explícita gerar cobrança');
  assert(table.includes('Gerar Cobrança'), 'label botão gerar cobrança');

  const dropdown = read('components/master/saas/SaasActionsDropdown.tsx');
  assert(dropdown.includes('createPortal'), 'dropdown portal');
  assert(dropdown.includes('z-[9999]'), 'dropdown z-index alto');

  const generateModal = read('components/master/saas/SaasGenerateChargeModal.tsx');
  assert(generateModal.includes('Forma de cobrança'), 'modal forma cobrança');
  assert(generateModal.includes("'PIX'"), 'modal opção PIX');
  assert(generateModal.includes("'BOLETO'"), 'modal opção BOLETO');
  assert(generateModal.includes('max-w-3xl'), 'modal largura desktop');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('SaasGenerateChargeModal'), 'page usa modal gerar cobrança');
  assert(page.includes('billingType: payload.billingType'), 'page envia billingType');

  const modal = read('components/master/SaasChargeViewModal.tsx');
  assert(modal.includes('Abrir boleto'), 'modal boleto');
  assert(modal.includes('bankSlipIdentification'), 'modal identificação boleto');
  assert(modal.includes('SaasLateFeeLabels'), 'modal multa/juros');
}

function testSaasLateFees() {
  assert(DEFAULT_FINE_PERCENT === 2, 'DEFAULT_FINE_PERCENT = 2');
  assert(DEFAULT_INTEREST_PERCENT === 0.033, 'DEFAULT_INTEREST_PERCENT = 0.033');

  const resolved = resolveSaasLateFeePercents();
  assert(resolved.finePercent === 2, 'resolve fine');
  assert(resolved.interestPercent === 0.033, 'resolve interest');

  assert(isSaasChargeEligibleForLateFeeUpdate('PENDING'), 'PENDING elegível');
  assert(isSaasChargeEligibleForLateFeeUpdate('OVERDUE'), 'OVERDUE elegível');
  assert(!isSaasChargeEligibleForLateFeeUpdate('PAID'), 'PAID bloqueado');
  assert(!isSaasChargeEligibleForLateFeeUpdate('CANCELLED'), 'CANCELLED bloqueado');

  assert(
    hasAsaasLateFeesConfigured({ fine: { value: 2 }, interest: { value: 0.033 } }),
    'multa/juros configurados no Asaas',
  );
  assert(
    !hasAsaasLateFeesConfigured({ fine: { value: 0 }, interest: { value: 0.033 } }),
    'sem multa = não configurado',
  );

  assert(shouldSkipLateFeeForAsaasStatus('RECEIVED'), 'RECEIVED não altera');
  assert(shouldSkipLateFeeForAsaasStatus('CONFIRMED'), 'CONFIRMED não altera');
  assert(shouldSkipLateFeeForAsaasStatus('REFUNDED'), 'REFUNDED não altera');
  assert(shouldSkipLateFeeForAsaasStatus('CANCELLED'), 'CANCELLED Asaas não altera');

  assert(isSaasChargeOpenForLateFeeDisplay('PENDING'), 'UI aberta PENDING');
  assert(isSaasChargeOpenForLateFeeDisplay('OVERDUE'), 'UI aberta OVERDUE');
  assert(!isSaasChargeOpenForLateFeeDisplay('PAID'), 'UI paga oculta encargos');

  const asaas = read('lib/payments/providers/asaas.ts');
  assert(asaas.includes('fine: lateFees.fine'), 'POST Asaas inclui fine');
  assert(asaas.includes('interest: lateFees.interest'), 'POST Asaas inclui interest');
  assert(asaas.includes('updateAsaasPaymentLateFees'), 'PUT multa/juros');
  assert(asaas.includes('fetchAsaasPaymentDetails'), 'GET detalhes cobrança');

  const charges = read('lib/saasCharges.ts');
  assert(charges.includes('finePercent: lateFee.finePercent'), 'createSaasPixCharge envia multa');
  assert(charges.includes('interestPercent: lateFee.interestPercent'), 'createSaasPixCharge envia juros');
  assert(charges.includes('late_fee_enabled'), 'persiste late_fee_enabled');

  const migration = read('supabase/migrations/20260813120000_saas_charges_late_fee.sql');
  assert(migration.includes('fine_percent'), 'migration fine_percent');
  assert(migration.includes('interest_percent'), 'migration interest_percent');
  assert(migration.includes('late_fee_enabled'), 'migration late_fee_enabled');
  assert(migration.includes('late_fee_configured_at'), 'migration late_fee_configured_at');

  const api = read('app/api/master/saas-charges/route.ts');
  assert(api.includes("action === 'configure_late_fees'"), 'API configure_late_fees SUPER_ADMIN');
  assert(api.includes('backfillSaasChargesLateFees'), 'API backfill importada');

  const table = read('components/master/saas/SaasChargesTable.tsx');
  assert(table.includes('SaasLateFeeLabels'), 'tabela exibe multa/juros');

  const lateFees = read('lib/saasLateFees.ts');
  assert(lateFees.includes('configureAsaasPaymentLateFeesIfMissing'), 'rotina idempotente');
  assert(lateFees.includes('already_configured'), 'não duplica no Asaas');
}

function testSaasBillingReminders() {
  assert(
    resolveReminderTypesForCharge('2026-06-27', 'PENDING', '2026-06-20').includes('reminder_7_days'),
    '7 dias antes gera reminder_7_days',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-23', 'PENDING', '2026-06-20').includes('reminder_3_days'),
    '3 dias antes gera reminder_3_days',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-27', 'PENDING', '2026-06-24').includes('reminder_3_days'),
    'MENESES 2026-06: vencimento 27/06 com execução 24/06 gera reminder_3_days',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-27', 'PENDING', '2026-06-24').length === 1,
    'MENESES 2026-06: apenas reminder_3_days em 24/06 para vencimento 27/06',
  );
  assert(
    todayBrazilIsoDate(new Date('2026-06-24T11:00:00Z')) === '2026-06-24',
    'todayBrazilIsoDate 11:00 UTC = 08:00 BRT no mesmo dia civil',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-20', 'PENDING', '2026-06-20').includes('due_today'),
    'vencimento hoje gera due_today',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-19', 'OVERDUE', '2026-06-20').includes('overdue_friendly'),
    'vencida gera overdue_friendly',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-27', 'PAID', '2026-06-20').length === 0,
    'cobrança paga não envia',
  );
  assert(
    resolveReminderTypesForCharge('2026-06-27', 'CANCELLED', '2026-06-20').length === 0,
    'cobrança cancelada não envia',
  );
  assert(isSaasChargeStatusEligibleForReminder('PENDING'), 'PENDING elegível');
  assert(isSaasChargeStatusEligibleForReminder('OVERDUE'), 'OVERDUE elegível');
  assert(!isSaasChargeStatusEligibleForReminder('PAID'), 'PAID não elegível');
  assert(isSaasChargeStatusBlockedForReminder('RECEIVED'), 'RECEIVED bloqueado');
  assert(isSaasChargeStatusBlockedForReminder('CONFIRMED'), 'CONFIRMED bloqueado');
  assert(isSaasChargeStatusBlockedForReminder('REFUNDED'), 'REFUNDED bloqueado');
  assert(isSaasChargeStatusBlockedForReminder('DELETED'), 'DELETED bloqueado');

  const email = buildSaasBillingReminderEmailHtml({
    to: 'empresa@teste.com',
    companyName: 'Empresa Teste',
    amount: 549.99,
    dueDate: '2026-06-27',
    referenceMonth: '2026-06',
    paymentUrl: 'https://sandbox.asaas.com/i/abc',
    reminderType: 'reminder_7_days',
  });
  assert(email.subject.includes('7 dias'), 'assunto 7 dias');
  assert(email.html.includes('Multa'), 'html multa');
  assert(email.html.includes('0.033'), 'html juros');
  assert(email.text.includes('Empresa Teste'), 'texto empresa');

  const cronRoute = read('app/api/cron/saas-billing-reminders/route.ts');
  assert(cronRoute.includes('isCronSecretValid'), 'cron valida segredo');
  assert(cronRoute.includes('401'), 'cron retorna 401');

  const migration = read('supabase/migrations/20260814120000_saas_billing_reminder_logs.sql');
  assert(migration.includes('saas_billing_reminder_logs'), 'tabela logs');
  assert(migration.includes('idx_saas_billing_reminder_logs_unique_sent'), 'índice único');

  const reminders = read('lib/saasBillingReminders.ts');
  assert(reminders.includes('runSaasBillingReminders'), 'runner cron');
  assert(reminders.includes('todayBrazilIsoDate'), 'runner usa data Brasil');
  assert(reminders.includes('hasSaasChargeRealPixData'), 'candidatos aceitam link/PIX sem payment_id obrigatório');
  assert(reminders.includes('automations:'), 'retorno inclui resumo por automação');
  assert(reminders.includes('candidatesExcluded'), 'retorno inclui cobranças excluídas');
  assert(reminders.includes('wasSaasBillingReminderSent'), 'evita duplicidade');
  assert(reminders.includes('SAAS_BILLING_REMINDER_EMAIL'), 'auditoria envio email');
  assert(reminders.includes('processSaasBillingReminderWhatsAppForCharge'), 'runner whatsapp');
  assert(reminders.includes('SAAS_BILLING_REMINDER_WHATSAPP'), 'auditoria envio whatsapp');
  assert(reminders.includes('companyPhone'), 'busca telefone empresa');

  const vercel = read('vercel.json');
  assert(vercel.includes('/api/cron/saas-billing-reminders'), 'vercel cron path');
  assert(vercel.includes('0 11 * * *'), 'cron 08h BRT');

  const middleware = read('middleware.ts');
  assert(middleware.includes("'/api/cron'"), 'middleware libera rota cron sem sessão');

  const panel = read('components/master/saas/SaasAutomationsPanel.tsx');
  assert(panel.includes('E-mail · Ativo'), 'UI email ativo');
  assert(panel.includes('WhatsApp ·'), 'UI badge whatsapp');
  assert(panel.includes('whatsappConfigured'), 'UI estado whatsapp');
  assert(panel.includes("'Ativo' : 'Em breve'"), 'UI alterna whatsapp ativo/em breve');

  const apiRoute = read('app/api/master/saas-billing-reminders/route.ts');
  assert(apiRoute.includes('whatsappConfigured'), 'API retorna whatsappConfigured');

  const origSecret = process.env.CRON_SECRET;
  const origSaasSecret = process.env.SAAS_CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'test-cron-secret';
    delete process.env.SAAS_CRON_SECRET;
    assert(resolveCronSecret() === 'test-cron-secret', 'resolve cron secret');
    assert(
      resolveCronSecrets().join(',') === 'test-cron-secret',
      'resolveCronSecrets com CRON_SECRET',
    );
    assert(
      !isCronSecretValid(
        new Request('http://localhost/api/cron/saas-billing-reminders'),
      ),
      'cron sem segredo retorna inválido',
    );
    assert(
      isCronSecretValid(
        new Request('http://localhost/api/cron/saas-billing-reminders', {
          headers: { 'x-cron-secret': 'test-cron-secret' },
        }),
      ),
      'cron com segredo correto',
    );
    assert(
      isCronSecretValid(
        new Request('http://localhost/api/cron/saas-billing-reminders?secret=test-cron-secret'),
      ),
      'cron query secret',
    );

    delete process.env.CRON_SECRET;
    process.env.SAAS_CRON_SECRET = 'saas-only-secret';
    assert(
      isCronSecretValid(
        new Request('http://localhost/api/cron/saas-billing-reminders', {
          headers: { authorization: 'Bearer saas-only-secret' },
        }),
      ),
      'cron aceita SAAS_CRON_SECRET no Bearer',
    );
  } finally {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
    if (origSaasSecret === undefined) delete process.env.SAAS_CRON_SECRET;
    else process.env.SAAS_CRON_SECRET = origSaasSecret;
  }
}

function testSaasBillingReminderWhatsApp() {
  assert(
    normalizeBrazilianWhatsAppPhone('(94) 99100-1988') === '5594991001988',
    'telefone brasileiro normalizado com DDI 55',
  );
  assert(normalizeBrazilianWhatsAppPhone('') === null, 'telefone vazio retorna null');
  assert(normalizeBrazilianWhatsAppPhone('123') === null, 'telefone curto inválido');

  const msg7 = buildSaasBillingReminderWhatsAppMessage({
    phone: '559491001988',
    companyName: 'Meneses Imobiliária',
    amount: 549.99,
    dueDate: '2026-07-27',
    paymentUrl: 'https://sandbox.asaas.com/i/abc',
    reminderType: 'reminder_7_days',
  });
  assert(msg7.includes('Meneses Imobiliária'), 'mensagem 7 dias empresa');
  assert(msg7.includes('27/07/2026'), 'mensagem 7 dias vencimento');
  assert(msg7.includes('https://sandbox.asaas.com/i/abc'), 'mensagem 7 dias link');

  const msgDue = buildSaasBillingReminderWhatsAppMessage({
    phone: '559491001988',
    companyName: 'SV Topografia',
    amount: 100,
    dueDate: '2026-07-15',
    paymentUrl: 'https://sandbox.asaas.com/i/due',
    reminderType: 'due_today',
  });
  assert(msgDue.includes('vence hoje'), 'mensagem vencimento hoje');

  const zapi = read('lib/whatsapp/zapiProvider.ts');
  assert(zapi.includes('ZAPI_INSTANCE_ID'), 'provider z-api instance id');
  assert(zapi.includes('ZAPI_INSTANCE_TOKEN'), 'provider z-api instance token');
  assert(zapi.includes('ZAPI_CLIENT_TOKEN'), 'provider z-api client token');
  assert(zapi.includes("'Client-Token'"), 'provider header Client-Token');
  assert(zapi.includes('buildZapiSendTextHeaders'), 'headers z-api explicitos');
  assert(zapi.includes('requestHeadersSent'), 'debug headers enviados');
  assert(zapi.includes('requestHeadersMasked'), 'debug headers mascarados');
  assert(zapi.includes('getZapiConfigStatus'), 'status config z-api');
  assert(zapi.includes('clientTokenConfigured'), 'status client token');
  assert(zapi.includes('clientTokenOptional'), 'status client token opcional');
  assert(zapi.includes('buildZapiSendTextUrl'), 'helper url z-api');
  assert(zapi.includes('buildZapiRequestDiagnostics'), 'diagnostico z-api');
  assert(zapi.includes('zapi-send-text'), 'log request z-api');
  assert(zapi.includes('export async function sendText'), 'função sendText z-api');
  assert(!fs.existsSync(path.join(ROOT, 'lib/whatsapp/evolutionProvider.ts')), 'evolution removido');

  const whatsappLib = read('lib/saasBillingReminderWhatsApp.ts');
  assert(whatsappLib.includes('sendSaasBillingReminderWhatsApp'), 'função envio whatsapp');
  assert(whatsappLib.includes('zapiProvider'), 'whatsapp usa zapiProvider');
  assert(whatsappLib.includes('Telefone inválido'), 'bloqueia sem telefone');
  assert(whatsappLib.includes('sem link Asaas'), 'bloqueia sem link');
  assert(!whatsappLib.includes('evolutionProvider'), 'whatsapp sem evolution');

  const reminders = read('lib/saasBillingReminders.ts');
  assert(
    reminders.includes('processSaasBillingReminderForCharge') &&
      reminders.includes('processSaasBillingReminderWhatsAppForCharge'),
    'email e whatsapp processados separadamente',
  );
  assert(
    reminders.indexOf('processSaasBillingReminderForCharge') <
      reminders.indexOf('processSaasBillingReminderWhatsAppForCharge'),
    'whatsapp após email no runner',
  );
  assert(reminders.includes("channel: 'whatsapp'"), 'canal whatsapp nos logs');

  const envExample = read('.env.example');
  assert(envExample.includes('ZAPI_INSTANCE_ID='), 'env example z-api instance id');
  assert(envExample.includes('ZAPI_INSTANCE_TOKEN='), 'env example z-api token');
  assert(envExample.includes('ZAPI_CLIENT_TOKEN='), 'env example zapi client token');
  assert(!envExample.includes('EVOLUTION_API_URL'), 'env example sem evolution');

  const origId = process.env.ZAPI_INSTANCE_ID;
  const origToken = process.env.ZAPI_INSTANCE_TOKEN;
  const origClientToken = process.env.ZAPI_CLIENT_TOKEN;
  try {
    delete process.env.ZAPI_INSTANCE_ID;
    delete process.env.ZAPI_INSTANCE_TOKEN;
    delete process.env.ZAPI_CLIENT_TOKEN;
    assert(!isZapiConfigured(), 'z-api não configurada sem envs');
    assert(!isSaasBillingWhatsAppConfigured(), 'whatsapp billing não configurado sem envs');

    process.env.ZAPI_INSTANCE_ID = 'inst-test';
    process.env.ZAPI_INSTANCE_TOKEN = 'token-test';
    assert(isZapiConfigured(), 'z-api configurada com instance id e token');
    assert(isSaasBillingWhatsAppConfigured(), 'whatsapp billing configurado com instance e token');

    delete process.env.ZAPI_CLIENT_TOKEN;
    assert(isZapiConfigured(), 'z-api permanece configurada sem client token');

    process.env.ZAPI_CLIENT_TOKEN = 'client-test';
    assert(isZapiConfigured(), 'z-api configurada com client token opcional');
    assert(isSaasBillingWhatsAppConfigured(), 'whatsapp billing com client token opcional');
  } finally {
    if (origId === undefined) delete process.env.ZAPI_INSTANCE_ID;
    else process.env.ZAPI_INSTANCE_ID = origId;
    if (origToken === undefined) delete process.env.ZAPI_INSTANCE_TOKEN;
    else process.env.ZAPI_INSTANCE_TOKEN = origToken;
    if (origClientToken === undefined) delete process.env.ZAPI_CLIENT_TOKEN;
    else process.env.ZAPI_CLIENT_TOKEN = origClientToken;
  }
}

async function testZapiSendTextInstanceOnly() {
  const origFetch = globalThis.fetch;
  const origId = process.env.ZAPI_INSTANCE_ID;
  const origToken = process.env.ZAPI_INSTANCE_TOKEN;
  const origClientToken = process.env.ZAPI_CLIENT_TOKEN;

  try {
    process.env.ZAPI_INSTANCE_ID = 'inst-test';
    process.env.ZAPI_INSTANCE_TOKEN = 'token-test';
    delete process.env.ZAPI_CLIENT_TOKEN;

    let fetchCalled = false;
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url, init) => {
      fetchCalled = true;
      const headers = init?.headers;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          capturedHeaders[key] = value;
        });
      } else if (Array.isArray(headers)) {
        for (const [key, value] of headers) capturedHeaders[key] = value;
      } else if (headers) {
        capturedHeaders = { ...(headers as Record<string, string>) };
      }
      return new Response(JSON.stringify({ messageId: 'zapi-msg-instance' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await sendText({ phone: '5594991001988', message: 'teste' });
    assert(result.ok, 'envia com instance id e token sem client token');
    assert(fetchCalled, 'chama Z-API com instance id e token');
    assert(capturedHeaders['Content-Type'] === 'application/json', 'header Content-Type');
    assert(!capturedHeaders['Client-Token'], 'sem header Client-Token quando opcional ausente');
    assert(
      Array.isArray(result.debug?.requestHeadersMasked) &&
        result.debug?.requestHeadersMasked.includes('Client-Token: não enviado'),
      'debug indica Client-Token não enviado',
    );

    process.env.ZAPI_CLIENT_TOKEN = 'client-test';
    capturedHeaders = {};
    const resultWithClient = await sendText({ phone: '5594991001988', message: 'teste' });
    assert(resultWithClient.ok, 'envia com client token quando configurado');
    assert(capturedHeaders['Client-Token'] === 'client-test', 'header Client-Token quando configurado');
    assert(
      Array.isArray(resultWithClient.debug?.requestHeadersSent) &&
        resultWithClient.debug?.requestHeadersSent.includes('Client-Token'),
      'debug confirma Client-Token enviado',
    );
    assert(
      Array.isArray(resultWithClient.debug?.requestHeadersMasked) &&
        resultWithClient.debug?.requestHeadersMasked.some((line) =>
          line.startsWith('Client-Token: ****'),
        ),
      'debug mascara Client-Token',
    );
  } finally {
    globalThis.fetch = origFetch;
    if (origId === undefined) delete process.env.ZAPI_INSTANCE_ID;
    else process.env.ZAPI_INSTANCE_ID = origId;
    if (origToken === undefined) delete process.env.ZAPI_INSTANCE_TOKEN;
    else process.env.ZAPI_INSTANCE_TOKEN = origToken;
    if (origClientToken === undefined) delete process.env.ZAPI_CLIENT_TOKEN;
    else process.env.ZAPI_CLIENT_TOKEN = origClientToken;
  }
}

async function testZapiSendTextMocked() {
  const origFetch = globalThis.fetch;
  const origId = process.env.ZAPI_INSTANCE_ID;
  const origToken = process.env.ZAPI_INSTANCE_TOKEN;
  const origClientToken = process.env.ZAPI_CLIENT_TOKEN;

  try {
    process.env.ZAPI_INSTANCE_ID = 'inst-mock';
    process.env.ZAPI_INSTANCE_TOKEN = 'token-mock';
    process.env.ZAPI_CLIENT_TOKEN = 'client-mock';

    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body || '');
      const headers = init?.headers;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          capturedHeaders[key] = value;
        });
      } else if (Array.isArray(headers)) {
        for (const [key, value] of headers) capturedHeaders[key] = value;
      } else if (headers) {
        capturedHeaders = { ...(headers as Record<string, string>) };
      }
      return new Response(JSON.stringify({ messageId: 'zapi-msg-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await sendText({
      phone: '5594991955918',
      message: 'Mensagem teste',
    });

    assert(result.ok, 'mock z-api send ok');
    assert(result.messageId === 'zapi-msg-123', 'mock z-api messageId');
    assert(
      capturedUrl ===
        'https://api.z-api.io/instances/inst-mock/token/token-mock/send-text',
      'mock z-api url',
    );
    assert(capturedHeaders['Client-Token'] === 'client-mock', 'mock z-api Client-Token');
    assert(capturedHeaders['Content-Type'] === 'application/json', 'mock z-api Content-Type');

    const payload = JSON.parse(capturedBody) as { phone?: string; message?: string };
    assert(payload.phone === '5594991955918', 'mock z-api payload phone');
    assert(payload.message === 'Mensagem teste', 'mock z-api payload message');
  } finally {
    globalThis.fetch = origFetch;
    if (origId === undefined) delete process.env.ZAPI_INSTANCE_ID;
    else process.env.ZAPI_INSTANCE_ID = origId;
    if (origToken === undefined) delete process.env.ZAPI_INSTANCE_TOKEN;
    else process.env.ZAPI_INSTANCE_TOKEN = origToken;
    if (origClientToken === undefined) delete process.env.ZAPI_CLIENT_TOKEN;
    else process.env.ZAPI_CLIENT_TOKEN = origClientToken;
  }
}

async function testSaasWhatsAppTestButton() {
  assert(
    SAAS_WHATSAPP_TEST_MESSAGE === '✅ Teste de integração WhatsApp do SV LOTES',
    'mensagem fixa teste whatsapp',
  );

  const apiRoute = read('app/api/master/saas-whatsapp-test/route.ts');
  assert(apiRoute.includes('assertSuperAdmin'), 'api teste whatsapp super admin');
  assert(apiRoute.includes('sendSaasWhatsAppTest'), 'api usa serviço teste');
  assert(apiRoute.includes('getZapiConfigStatus'), 'api diagnostico z-api');

  const service = read('lib/saasWhatsAppTest.ts');
  assert(service.includes('WHATSAPP_TEST_SENT'), 'auditoria WHATSAPP_TEST_SENT');
  assert(service.includes('sendText'), 'teste usa mesmo provider z-api');

  const panel = read('components/master/saas/SaasAutomationsPanel.tsx');
  assert(panel.includes('Testar WhatsApp'), 'botão testar whatsapp');
  assert(panel.includes('isSuperAdmin'), 'botão restrito super admin');
  assert(panel.includes('SaasWhatsAppTestModal'), 'modal teste whatsapp');

  const modal = read('components/master/saas/SaasWhatsAppTestModal.tsx');
  assert(modal.includes('/api/master/saas-whatsapp-test'), 'modal chama api teste');
  assert(modal.includes('SAAS_WHATSAPP_TEST_MESSAGE'), 'modal exibe mensagem fixa');
  assert(modal.includes('Instância configurada'), 'modal diagnostico instancia');
  assert(modal.includes('Token configurado'), 'modal diagnostico token');
  assert(modal.includes('Client Token configurado'), 'modal diagnostico client token');
  assert(modal.includes('não / opcional'), 'modal client token opcional');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('isSuperAdmin={isSuperAdmin}'), 'page passa isSuperAdmin');

  const origFetch = globalThis.fetch;
  const origId = process.env.ZAPI_INSTANCE_ID;
  const origToken = process.env.ZAPI_INSTANCE_TOKEN;
  const origClientToken = process.env.ZAPI_CLIENT_TOKEN;

  try {
    process.env.ZAPI_INSTANCE_ID = 'inst-test';
    process.env.ZAPI_INSTANCE_TOKEN = 'token-test';
    delete process.env.ZAPI_CLIENT_TOKEN;

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}')) as { phone?: string; message?: string };
      assert(body.phone === '5594991001988', 'teste serviço normaliza telefone');
      assert(body.message === SAAS_WHATSAPP_TEST_MESSAGE, 'teste serviço mensagem fixa');
      return new Response(JSON.stringify({ messageId: 'zapi-test-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const mockSupabase = {
      from(table: string) {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { tenant_id: 'company-audit-1' } }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: async (row: Record<string, unknown>) => {
              assert(row.action === 'WHATSAPP_TEST_SENT', 'auditoria inserida');
              assert(row.module === 'SAAS_BILLING', 'modulo auditoria');
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await sendSaasWhatsAppTest(mockSupabase as never, {
      phone: '(94) 99100-1988',
      actorUserId: 'user-super-admin',
    });

    assert(result.ok, 'serviço teste whatsapp ok');
    assert(result.normalizedPhone === '5594991001988', 'telefone normalizado no serviço');
    assert(result.messageId === 'zapi-test-1', 'messageId retornado');
  } finally {
    globalThis.fetch = origFetch;
    if (origId === undefined) delete process.env.ZAPI_INSTANCE_ID;
    else process.env.ZAPI_INSTANCE_ID = origId;
    if (origToken === undefined) delete process.env.ZAPI_INSTANCE_TOKEN;
    else process.env.ZAPI_INSTANCE_TOKEN = origToken;
    if (origClientToken === undefined) delete process.env.ZAPI_CLIENT_TOKEN;
    else process.env.ZAPI_CLIENT_TOKEN = origClientToken;
  }
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
    ['vencimento modal cobrança', testSaasChargeDueDateFromModal],
    ['validação PIX Asaas', testSaasPixValidation],
    ['provider Asaas PIX + refresh', testAsaasPixProviderAndRefresh],
    ['view faturas + PIX', testSaasInvoiceChargeView],
    ['ordenacao tabela cobranças', testSaasChargeTableSort],
    ['próximo vencimento pagamento', testAdvanceSubscriptionDueDate],
    ['webhook PAYMENT_RECEIVED idempotente', testWebhookPaymentIdempotency],
    ['webhook PAYMENT_OVERDUE', testWebhookOverdueEvent],
    ['boleto Asaas + migration', testBoletoSupport],
    ['auto-suspend 10 dias', testAutoSuspendConfig],
    ['UI cobrança boleto', testChargesUiBoleto],
    ['multa e juros automáticos SaaS', testSaasLateFees],
    ['automações lembretes SaaS', testSaasBillingReminders],
    ['automações WhatsApp Z-API', testSaasBillingReminderWhatsApp],
    ['Z-API envio instance + token (client token opcional)', testZapiSendTextInstanceOnly],
    ['envio mockado Z-API', testZapiSendTextMocked],
    ['botão testar WhatsApp SaaS', testSaasWhatsAppTestButton],
    ['migration saas_charges', testDatabaseMigration],
    ['página /billing', testBillingPage],
    ['auth tenant billing', testTenantBillingAuth],
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
