/**
 * Testes obrigatórios — Módulo Bancário MOCK (Fase 1).
 * npm run test:banking-mock
 */

import {
  clearMockBankProviderStateForTests,
  clearWebhookEventCacheForTests,
  isBankingModuleEnabled,
  mockBankProvider,
} from '../lib/banking';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const context = {
  integrationId: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  environment: 'SANDBOX' as const,
};

async function testMockCreatesBoleto(): Promise<void> {
  const result = await mockBankProvider.createBoleto(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '33333333-3333-3333-3333-333333333333',
      amount: 1500.5,
      dueDate: '2026-07-15',
      payerName: 'Cliente Teste',
      payerDocument: '00000000000',
      idempotencyKey: 'boleto-test-1',
    },
    context,
  );

  assert(result.status === 'PENDING', 'boleto status PENDING');
  assert(result.digitableLine.includes('75691'), 'linha digitável fictícia');
  assert(result.barcode.length === 44, 'código de barras 44 dígitos');
  assert(result.paymentUrl.includes('mock.sv-lotes.local'), 'link fictício');
}

async function testMockCreatesPix(): Promise<void> {
  const result = await mockBankProvider.createPix(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '44444444-4444-4444-4444-444444444444',
      amount: 890.0,
      dueDate: '2026-07-20',
      payerName: 'Cliente Pix',
      idempotencyKey: 'pix-test-1',
    },
    context,
  );

  assert(result.status === 'PENDING', 'pix status PENDING');
  assert(result.pixCopyPaste.includes('BR.GOV.BCB.PIX'), 'QR Pix fictício EMV');
  assert(result.pixQrCode.startsWith('data:image/svg+xml,'), 'imagem QR fictícia');
  assert(result.paymentUrl.includes('/pix/'), 'link pagamento pix');
}

function testParseWebhookNoDuplicate(): void {
  const payload = {
    eventId: 'evt_mock_001',
    eventType: 'payment.confirmed',
    chargeExternalId: 'mock_pix_abc',
    paidAmount: 890,
  };

  const first = mockBankProvider.parseWebhook(payload, context);
  const second = mockBankProvider.parseWebhook(payload, context);

  assert(first.duplicate === false, 'primeiro webhook não duplica');
  assert(first.event?.processingStatus === 'PENDING', 'primeiro evento PENDING');
  assert(second.duplicate === true, 'segundo webhook marcado duplicado');
  assert(second.event?.processingStatus === 'DUPLICATE', 'status DUPLICATE');
}

async function testReconcilePaymentStructure(): Promise<void> {
  const pix = await mockBankProvider.createPix(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '55555555-5555-5555-5555-555555555555',
      amount: 500,
      dueDate: '2026-08-01',
      payerName: 'Reconcile Test',
      idempotencyKey: 'pix-reconcile-1',
    },
    context,
  );

  const charge = await mockBankProvider.getCharge(pix.externalId, context);
  assert(charge, 'cobrança recuperada');

  const parsed = mockBankProvider.parseWebhook(
    {
      eventId: 'evt_reconcile_001',
      eventType: 'payment.confirmed',
      paidAmount: 500,
      paidAt: '2026-08-02T12:00:00.000Z',
      feeAmount: 2.5,
    },
    context,
  );

  assert(parsed.event && !parsed.duplicate, 'evento reconcile válido');
  const result = mockBankProvider.reconcilePayment(parsed.event!, charge!);

  assert(result.newStatus === 'PAID', 'parcela baixada PAID');
  assert(result.cashMovement.type === 'entrada', 'entrada no caixa');
  assert(result.cashMovement.category === 'parcela', 'categoria parcela');
  assert(result.feeMovement?.category === 'tarifa_bancaria', 'tarifa registrada');
  assert(result.financeReceiptId === charge!.financeReceiptId, 'vínculo parcela');
}

function testFeatureFlagDefaultOff(): void {
  const original = process.env.BANKING_MODULE_ENABLED;
  delete process.env.BANKING_MODULE_ENABLED;
  assert(isBankingModuleEnabled() === false, 'flag desligada por padrão');
  process.env.BANKING_MODULE_ENABLED = 'true';
  assert(isBankingModuleEnabled() === true, 'flag liga com true');
  if (original === undefined) delete process.env.BANKING_MODULE_ENABLED;
  else process.env.BANKING_MODULE_ENABLED = original;
}

async function main(): Promise<void> {
  clearMockBankProviderStateForTests();
  clearWebhookEventCacheForTests();

  await testMockCreatesBoleto();
  await testMockCreatesPix();
  testParseWebhookNoDuplicate();
  await testReconcilePaymentStructure();
  testFeatureFlagDefaultOff();

  console.log('OK — mandatory banking mock tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
