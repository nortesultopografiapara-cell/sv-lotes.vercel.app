/**
 * Cobrança em massa via WhatsApp — domínio, isolamento e não-regressão SaaS/OTP.
 * npx tsx scripts/mandatory-charges-whatsapp-batch-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import {
  buildChargeWhatsAppBatchPreview,
  buildConsolidatedChargeWhatsAppMessage,
  canDispatchChargeWhatsAppBatch,
  chargeWhatsAppBatchRoleDeniedMessage,
  CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS,
  CHARGE_WHATSAPP_BATCH_OWNER_DENIED,
  CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY,
  evaluateChargeWhatsAppParcel,
  filterChargeWhatsAppItemsForDispatch,
  groupChargeWhatsAppParcelsByCustomer,
  parseChargeWhatsAppInstallmentIds,
  pickExistingChargeForWhatsApp,
  receiptBelongsToTenant,
  resolveBatchStatusFromCounts,
  selectFailedItemsForRetry,
  shouldReplayExistingBatch,
  type ChargeWhatsAppBatchParcelInput,
} from '../lib/charges/chargeWhatsAppBatch';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const ROOT = process.cwd();
function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_JOAO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CUSTOMER_MARIA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CUSTOMER_PEDRO = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function charge(partial: Partial<CompanyAsaasChargeResponse>): CompanyAsaasChargeResponse {
  return {
    id: 'ch-1',
    companyId: TENANT,
    customerId: CUSTOMER_JOAO,
    saleId: 'sale-1',
    installmentId: 'inst-1',
    asaasPaymentId: 'pay_1',
    billingType: 'UNDEFINED',
    status: 'OVERDUE',
    value: 1000,
    dueDate: '2026-09-01',
    invoiceUrl: 'https://asaas.example/i/1',
    bankSlipUrl: 'https://asaas.example/b/1',
    bankSlipIdentification: null,
    pixQrCode: null,
    pixCopyPaste: 'PIXCOPY1',
    financialAccountId: null,
    paymentLink: 'https://asaas.example/p/1',
    paidAt: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

function parcel(
  partial: Partial<ChargeWhatsAppBatchParcelInput> &
    Pick<ChargeWhatsAppBatchParcelInput, 'installmentId' | 'customerId'>,
): ChargeWhatsAppBatchParcelInput {
  return {
    companyId: TENANT,
    tenantId: TENANT,
    customerName: 'João',
    phone: '11999887766',
    projectName: 'Mundo Novo',
    lotLabel: 'QD 01 • LT 12',
    parcelLabel: 'Parcela 5',
    contractNumber: '000000001/2026',
    dueDateIso: '2026-09-01',
    dueDateLabel: '01/09/2026',
    amount: 1000,
    rawStatus: 'pendente',
    computedStatus: 'atrasado',
    charge: charge({ installmentId: partial.installmentId, id: `ch-${partial.installmentId}` }),
    ...partial,
  };
}

function testGroupingSameCustomerOneMessage() {
  const evaluated = [
    evaluateChargeWhatsAppParcel(
      parcel({ installmentId: 'i5', customerId: CUSTOMER_JOAO, parcelLabel: 'Parcela 5' }),
      TENANT,
    ),
    evaluateChargeWhatsAppParcel(
      parcel({
        installmentId: 'i6',
        customerId: CUSTOMER_JOAO,
        parcelLabel: 'Parcela 6',
        dueDateIso: '2026-09-10',
        dueDateLabel: '10/09/2026',
        amount: 1100,
      }),
      TENANT,
    ),
    evaluateChargeWhatsAppParcel(
      parcel({
        installmentId: 'i7',
        customerId: CUSTOMER_JOAO,
        parcelLabel: 'Parcela 7',
        dueDateIso: '2026-09-15',
        dueDateLabel: '15/09/2026',
        amount: 1200,
      }),
      TENANT,
    ),
  ];
  assert(evaluated.every((p) => p.sendable), 'três parcelas vencidas do João são elegíveis');
  const groups = groupChargeWhatsAppParcelsByCustomer(evaluated, {
    loteadoraName: 'Loteadora Alfa',
  });
  assert(groups.length === 1, '3 parcelas do mesmo cliente → 1 grupo');
  assert(groups[0].sendableParcels.length === 3, 'grupo contém as 3 parcelas');
  assert(groups[0].message != null, 'mensagem consolidada gerada');
  assert(groups[0].message!.includes('*Parcela:* 5'), 'mensagem cita parcela 5');
  assert(groups[0].message!.includes('*Parcela:* 6'), 'mensagem cita parcela 6');
  assert(groups[0].message!.includes('*Parcela:* 7'), 'mensagem cita parcela 7');
  assert(!groups[0].message!.includes('Parcela: Parcela'), 'sem Parcela duplicada');
  assert(groups[0].message!.includes('SV Lotes'), 'identifica SV Lotes');
  assert(groups[0].message!.includes('Loteadora Alfa'), 'identifica a loteadora');
  assert(groups[0].message!.includes('Mundo Novo'), 'identifica o empreendimento');
  assert(groups[0].message!.includes('R$'), 'inclui valores');
  assert(groups[0].message!.includes('*Total:*'), 'mensagem única com total');
  assert(groups[0].message!.includes('Central de Cobranças'), 'rodapé da central');
  console.log('OK testGroupingSameCustomerOneMessage');
}

function testThreeCustomersThreeMessages() {
  const evaluated = [
    evaluateChargeWhatsAppParcel(
      parcel({ installmentId: 'j1', customerId: CUSTOMER_JOAO, customerName: 'João' }),
      TENANT,
    ),
    evaluateChargeWhatsAppParcel(
      parcel({
        installmentId: 'm1',
        customerId: CUSTOMER_MARIA,
        customerName: 'Maria',
        phone: '21988776655',
      }),
      TENANT,
    ),
    evaluateChargeWhatsAppParcel(
      parcel({
        installmentId: 'p1',
        customerId: CUSTOMER_PEDRO,
        customerName: 'Pedro',
        phone: '31977665544',
      }),
      TENANT,
    ),
  ];
  const groups = groupChargeWhatsAppParcelsByCustomer(evaluated, {
    loteadoraName: 'Loteadora Alfa',
  });
  assert(groups.length === 3, '3 clientes → 3 mensagens');
  assert(groups.every((g) => g.sendable && g.message), 'cada cliente tem uma mensagem');
  console.log('OK testThreeCustomersThreeMessages');
}

function testTenantIsolation() {
  assert(receiptBelongsToTenant({ company_id: TENANT }, TENANT), 'mesmo company_id');
  assert(!receiptBelongsToTenant({ company_id: OTHER_TENANT }, TENANT), 'outro company_id bloqueado');
  const foreign = evaluateChargeWhatsAppParcel(
    parcel({
      installmentId: 'x1',
      customerId: CUSTOMER_JOAO,
      companyId: OTHER_TENANT,
      tenantId: OTHER_TENANT,
    }),
    TENANT,
  );
  assert(!foreign.sendable, 'parcela de outro tenant não envia');
  assert(foreign.skipReason === 'other_tenant', 'motivo other_tenant');

  const preview = buildChargeWhatsAppBatchPreview({
    requestedIds: ['missing-from-other-tenant'],
    loadedParcels: [],
    tenantId: TENANT,
    loteadoraName: 'Alfa',
    zapiConfigured: true,
  });
  assert(preview.readyCustomerCount === 0, 'ID ausente no tenant não entra no lote');
  assert(
    preview.skippedParcels.some((p) => p.skipReason === 'missing_receipt'),
    'ID de outro tenant/inexistente marcado',
  );
  console.log('OK testTenantIsolation');
}

function testOwnerDenied() {
  assert(!canDispatchChargeWhatsAppBatch('OWNER'), 'OWNER não dispara');
  assert(
    chargeWhatsAppBatchRoleDeniedMessage('OWNER') === CHARGE_WHATSAPP_BATCH_OWNER_DENIED,
    'mensagem OWNER',
  );
  assert(canDispatchChargeWhatsAppBatch('ADMIN'), 'ADMIN dispara');
  assert(canDispatchChargeWhatsAppBatch('ADMIN_EMPRESA'), 'ADMIN_EMPRESA dispara');
  assert(canDispatchChargeWhatsAppBatch('COMPANY_ADMIN'), 'COMPANY_ADMIN dispara');
  console.log('OK testOwnerDenied');
}

function testInvalidPhonePaidCancelledNoCharge() {
  const invalid = evaluateChargeWhatsAppParcel(
    parcel({ installmentId: 'bad-phone', customerId: CUSTOMER_JOAO, phone: '123' }),
    TENANT,
  );
  assert(!invalid.sendable && invalid.skipReason === 'invalid_phone', 'telefone inválido');

  const missingPhone = evaluateChargeWhatsAppParcel(
    parcel({ installmentId: 'no-phone', customerId: CUSTOMER_JOAO, phone: null }),
    TENANT,
  );
  assert(!missingPhone.sendable && missingPhone.skipReason === 'missing_phone', 'sem telefone');

  const paid = evaluateChargeWhatsAppParcel(
    parcel({
      installmentId: 'paid',
      customerId: CUSTOMER_JOAO,
      rawStatus: 'pago',
      computedStatus: 'pago',
    }),
    TENANT,
  );
  assert(!paid.sendable && paid.skipReason === 'paid', 'parcela paga');

  const cancelled = evaluateChargeWhatsAppParcel(
    parcel({
      installmentId: 'canc',
      customerId: CUSTOMER_JOAO,
      rawStatus: 'cancelado',
      computedStatus: 'cancelado',
    }),
    TENANT,
  );
  assert(!cancelled.sendable && cancelled.skipReason === 'cancelled', 'parcela cancelada');

  const noCharge = evaluateChargeWhatsAppParcel(
    parcel({ installmentId: 'no-ch', customerId: CUSTOMER_JOAO, charge: null }),
    TENANT,
  );
  assert(!noCharge.sendable && noCharge.skipReason === 'no_payment_method', 'sem cobrança');
  assert(
    pickExistingChargeForWhatsApp('no-ch', {}, {}) === null,
    'não inventa cobrança inexistente',
  );

  const notDue = evaluateChargeWhatsAppParcel(
    parcel({
      installmentId: 'future',
      customerId: CUSTOMER_JOAO,
      computedStatus: 'pendente',
      dueDateIso: '2026-12-01',
    }),
    TENANT,
  );
  assert(!notDue.sendable && notDue.skipReason === 'not_overdue', 'ainda não vencida');
  console.log('OK testInvalidPhonePaidCancelledNoCharge');
}

function testIdempotencyAndPartialRetry() {
  assert(shouldReplayExistingBatch('sent'), 'batch sent é replay');
  assert(shouldReplayExistingBatch('sending'), 'batch sending é replay');
  assert(shouldReplayExistingBatch('partial'), 'batch partial é replay');
  assert(!shouldReplayExistingBatch('blocked'), 'blocked não é replay de envio');

  const items = [
    { id: '1', status: 'sent', customer: 'João' },
    { id: '2', status: 'failed', customer: 'Maria' },
    { id: '3', status: 'skipped', customer: 'Pedro' },
    { id: '4', status: 'queued', customer: 'Ana' },
  ];
  const dispatch = filterChargeWhatsAppItemsForDispatch(items);
  assert(
    dispatch.map((i) => i.id).join(',') === '2,4',
    'dispatch só queued/failed — nunca reenvia sent',
  );
  const retry = selectFailedItemsForRetry(items);
  assert(retry.length === 1 && retry[0].id === '2', 'retry só failed');
  assert(!retry.some((i) => i.status === 'sent'), 'retry não inclui sent');

  const partial = resolveBatchStatusFromCounts({ sent: 18, failed: 2, skipped: 0 });
  assert(partial === 'partial', '18 sent + 2 failed = partial');
  const allOk = resolveBatchStatusFromCounts({ sent: 20, failed: 0, skipped: 1 });
  assert(allOk === 'sent', 'somente sucessos = sent');
  console.log('OK testIdempotencyAndPartialRetry');
}

function testPreviewSummaryAndCap() {
  const loaded = [
    parcel({ installmentId: 'i1', customerId: CUSTOMER_JOAO, customerName: 'João' }),
    parcel({
      installmentId: 'i2',
      customerId: CUSTOMER_MARIA,
      customerName: 'Maria',
      phone: null,
    }),
  ];
  const preview = buildChargeWhatsAppBatchPreview({
    requestedIds: ['i1', 'i2'],
    loadedParcels: loaded,
    tenantId: TENANT,
    loteadoraName: 'Alfa',
    zapiConfigured: true,
  });
  assert(preview.readyCustomerCount === 1, 'só João pronto');
  assert(preview.missingPhoneCount === 1, 'Maria sem telefone');
  assert(preview.customerCount === 2, 'dois clientes na seleção');
  assert(!preview.sendBlockedReason, 'um cliente não estoura teto');

  const many = Array.from({ length: CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS + 1 }, (_, i) =>
    parcel({
      installmentId: `cap-${i}`,
      customerId: `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}`,
      customerName: `Cliente ${i}`,
      phone: '11999887766',
    }),
  );
  const capped = buildChargeWhatsAppBatchPreview({
    requestedIds: many.map((p) => p.installmentId),
    loadedParcels: many,
    tenantId: TENANT,
    loteadoraName: 'Alfa',
    zapiConfigured: true,
  });
  assert(capped.overCustomerCap, 'teto 20 clientes');
  assert(Boolean(capped.sendBlockedReason), 'envio bloqueado acima do teto');
  console.log('OK testPreviewSummaryAndCap');
}

function testTemplateDoesNotLookLikeSaasInvoice() {
  const message = buildConsolidatedChargeWhatsAppMessage({
    customerName: 'João',
    loteadoraName: 'Loteadora Alfa',
    parcels: [
      evaluateChargeWhatsAppParcel(
        parcel({ installmentId: 'i5', customerId: CUSTOMER_JOAO }),
        TENANT,
      ),
    ],
  });
  assert(message.includes('aviso automático do *SV Lotes*'), 'origem plataforma');
  assert(message.includes('Loteadora Alfa'), 'loteadora obrigatória');
  assert(message.includes('SV Lotes — Central de Cobranças'), 'rodapé da central');
  assert(message.includes('Já realizou o pagamento?'), 'tom natural de baixa');
  assert(!message.toLowerCase().includes('assinatura sv lotes'), 'não parece mensalidade SaaS');
  assert(message.includes(CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY) === false, 'template key não vai na mensagem');
  console.log('OK testTemplateDoesNotLookLikeSaasInvoice');
}

function testParseIdsDedupesAndCaps() {
  const ids = parseChargeWhatsAppInstallmentIds(['a', 'a', 'b', '', 'c']);
  assert(ids.join(',') === 'a,b,c', 'dedup de IDs');
  console.log('OK testParseIdsDedupesAndCaps');
}

function testSourceIsolationAndUi() {
  const saasWa = read('lib/saasBillingReminderWhatsApp.ts');
  const saasReminders = read('lib/saasBillingReminders.ts');
  const portalWa = read('lib/portal-cliente/whatsapp.ts');
  const zapi = read('lib/whatsapp/zapiProvider.ts');
  const service = read('lib/charges/chargeWhatsAppBatchService.ts');
  const domain = read('lib/charges/chargeWhatsAppBatch.ts');
  const route = read('app/api/finance/charges/whatsapp-batch/route.ts');
  const page = read('components/charges/ChargesPageClient.tsx');
  const modal = read('components/charges/ChargeWhatsAppBatchModal.tsx');
  const migration = read('supabase/migrations/20261023120000_company_collection_whatsapp.sql');

  assert(saasWa.includes('sendText'), 'SaaS WhatsApp continua no provider');
  assert(!saasWa.includes('chargeWhatsAppBatch'), 'SaaS WhatsApp não usa o lote de cobrança');
  assert(saasReminders.includes('processSaasBillingReminderWhatsAppForCharge'), 'runner SaaS intacto');
  assert(!saasReminders.includes('chargeWhatsAppBatch'), 'reminders SaaS não acoplam lote');
  assert(portalWa.includes('sendClientPortalOtpWhatsApp'), 'OTP portal intacto');
  assert(portalWa.includes('sendText'), 'OTP continua no provider');
  assert(!portalWa.includes('chargeWhatsAppBatch'), 'OTP não usa lote de cobrança');
  assert(zapi.includes('export async function sendText'), 'sendText inalterado na exportação');
  assert(service.includes("from '@/lib/whatsapp/zapiProvider'"), 'lote reutiliza provider');
  assert(!service.includes('createCompanyInstallmentCharge'), 'lote não gera cobrança Asaas');
  assert(!service.includes('generateMissing'), 'lote não gera cobrança faltante');
  assert(domain.includes('customerId'), 'agrupa por customer_id');
  assert(route.includes("action === 'preview'"), 'endpoint preview');
  assert(route.includes("action === 'send'"), 'endpoint send');
  assert(route.includes("action === 'retry'"), 'endpoint retry');
  assert(route.includes('authorizeTenantBilling'), 'auth tenant');
  assert(route.includes('isOwnerRole'), 'OWNER bloqueado no endpoint');
  assert(route.includes('maxDuration'), 'teto de duração Vercel');
  assert(page.includes('ChargeWhatsAppBatchModal'), 'modal ligado em /charges');
  assert(page.includes('/api/finance/charges/whatsapp-batch'), 'charges chama endpoint');
  assert(page.includes('executeChargeWhatsAppShare'), 'click-to-chat individual preservado');
  assert(!page.includes('WhatsApp em lote (em breve)'), 'botão em breve removido');
  assert(modal.includes('Confirmar envio'), 'modal exige confirmação');
  assert(modal.includes('Reenviar somente falhas'), 'retry só falhas na UI');
  assert(migration.includes('company_collection_whatsapp_batches'), 'tabela batches');
  assert(migration.includes('company_collection_whatsapp_items'), 'tabela items');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), 'RLS');
  assert(migration.includes('idempotency_key'), 'idempotência no banco');
  assert(migration.includes('Não reutiliza saas_billing_reminder_logs'), 'migration declara não reutilizar log SaaS');
  assert(!migration.includes('REFERENCES public.saas_charges'), 'sem FK para saas_charges');
  console.log('OK testSourceIsolationAndUi');
}

function main() {
  testGroupingSameCustomerOneMessage();
  testThreeCustomersThreeMessages();
  testTenantIsolation();
  testOwnerDenied();
  testInvalidPhonePaidCancelledNoCharge();
  testIdempotencyAndPartialRetry();
  testPreviewSummaryAndCap();
  testTemplateDoesNotLookLikeSaasInvoice();
  testParseIdsDedupesAndCaps();
  testSourceIsolationAndUi();
  console.log('OK charges-whatsapp-batch');
}

main();
