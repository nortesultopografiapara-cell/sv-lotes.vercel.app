/**
 * Liberar lote e encerrar venda — testes obrigatórios (helpers + wiring).
 * npx tsx scripts/mandatory-release-lot-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildReleaseLotIdempotencyKey,
  classifyAsaasChargeForRelease,
  classifyFinanceReceiptForRelease,
  isActiveUnpaidFinanceReceipt,
  isCanceledSaleStatus,
  isPaidFinanceReceiptStatus,
  isSoldOrReservedLotStatus,
  RELEASE_LOT_MOTIVE_OPTIONS,
  summarizeReleaseCharges,
  summarizeReleaseReceipts,
  validateReleaseLotMotive,
} from '../lib/finance/releaseLotShared';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testMotiveValidation() {
  assert(validateReleaseLotMotive({ motiveCode: '' }).ok === false, 'motivo vazio');
  assert(validateReleaseLotMotive({ motiveCode: 'distrato' }).ok === true, 'distrato ok');
  const outro = validateReleaseLotMotive({ motiveCode: 'outro', motiveDetail: 'ab' });
  assert(outro.ok === false, 'outro curto');
  const outroOk = validateReleaseLotMotive({
    motiveCode: 'outro',
    motiveDetail: 'Troca administrativa',
  });
  assert(outroOk.ok === true, 'outro ok');
  assert(RELEASE_LOT_MOTIVE_OPTIONS.length >= 7, 'opções de motivo');
  console.log('OK testMotiveValidation');
}

function testReceiptClassification() {
  assert(isPaidFinanceReceiptStatus({ status: 'pago' }), 'pago');
  assert(isPaidFinanceReceiptStatus({ status: 'paid' }), 'paid');
  assert(isPaidFinanceReceiptStatus({ status: 'pendente', paid_at: '2026-01-01' }), 'paid_at');
  assert(!isPaidFinanceReceiptStatus({ status: 'pendente' }), 'pendente not paid');
  assert(classifyFinanceReceiptForRelease({ status: 'atrasado' }) === 'overdue', 'atrasado');
  assert(classifyFinanceReceiptForRelease({ status: 'cancelado' }) === 'canceled', 'cancelado');
  assert(isActiveUnpaidFinanceReceipt({ status: 'pendente' }), 'active unpaid');
  assert(!isActiveUnpaidFinanceReceipt({ status: 'pago' }), 'paid not unpaid');
  assert(!isActiveUnpaidFinanceReceipt({ status: 'cancelado' }), 'canceled not unpaid');

  const summary = summarizeReleaseReceipts([
    { status: 'pago', amount: 1000, paid_at: '2026-01-10' },
    { status: 'pago', amount: 500.555, paid_at: '2026-02-01' },
    { status: 'pendente', amount: 200 },
    { status: 'atrasado', amount: 300 },
    { status: 'cancelado', amount: 50 },
    { status: 'erro', amount: 10 },
  ]);
  assert(summary.paidReceipts === 2, '2 pagas');
  assert(summary.pendingReceipts === 1, '1 pendente');
  assert(summary.overdueReceipts === 1, '1 atrasada');
  assert(summary.otherUnpaidReceipts === 1, '1 other unpaid');
  assert(summary.unpaidToCancel === 3, '3 a cancelar');
  assert(summary.hasPreservedPayments === true, 'has preserved');
  assert(summary.totalPaidAmount === 1500.56, `total pago=${summary.totalPaidAmount}`);
  assert(summary.lastPaidAt === '2026-02-01', 'last paid');
  console.log('OK testReceiptClassification');
}

function testAsaasClassification() {
  assert(classifyAsaasChargeForRelease('PENDING') === 'open', 'PENDING');
  assert(classifyAsaasChargeForRelease('OVERDUE') === 'open', 'OVERDUE');
  assert(classifyAsaasChargeForRelease('REGISTERED') === 'open', 'REGISTERED');
  assert(classifyAsaasChargeForRelease('PAID') === 'paid', 'PAID');
  assert(classifyAsaasChargeForRelease('RECEIVED') === 'paid', 'RECEIVED');
  assert(classifyAsaasChargeForRelease('CONFIRMED') === 'paid', 'CONFIRMED');
  assert(classifyAsaasChargeForRelease('CANCELLED') === 'cancelled', 'CANCELLED');
  assert(classifyAsaasChargeForRelease('REFUNDED') === 'other', 'REFUNDED other');
  const s = summarizeReleaseCharges([
    { status: 'PENDING' },
    { status: 'OVERDUE' },
    { status: 'PAID' },
    { status: 'CANCELLED' },
  ]);
  assert(s.openAsaasCharges === 2, '2 open');
  assert(s.paidAsaasCharges === 1, '1 paid');
  assert(s.alreadyCanceledAsaasCharges === 1, '1 cancelled');
  console.log('OK testAsaasClassification');
}

function testSaleAndLotStatusHelpers() {
  assert(isCanceledSaleStatus('CANCELLED'), 'CANCELLED');
  assert(isCanceledSaleStatus('cancelada'), 'cancelada');
  assert(!isCanceledSaleStatus('ACTIVE'), 'ACTIVE not canceled');
  assert(isSoldOrReservedLotStatus('Vendido'), 'Vendido');
  assert(isSoldOrReservedLotStatus('Reservado'), 'Reservado');
  assert(!isSoldOrReservedLotStatus('Disponível'), 'Disponível');
  assert(
    buildReleaseLotIdempotencyKey('lot-1', 'sale-1') === 'release-lot:lot-1:sale-1',
    'idempotency key',
  );
  console.log('OK testSaleAndLotStatusHelpers');
}

function testServiceOrchestrationSource() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('cancelCompanyCharge'), 'cancela Asaas via serviço oficial');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'cancela parcelas unpaid');
  assert(svc.includes("status: SALE_CANCELLED_STATUS"), 'encerra venda CANCELLED');
  assert(svc.includes("status: CONTRACT_CANCELLED_STATUS"), 'cancela contrato');
  assert(svc.includes("status: LOT_AVAILABLE_STATUS"), 'lote Disponível');
  assert(svc.includes("sale_id: null"), 'limpa sale_id do lote');
  assert(svc.includes("customer_id: null"), 'limpa customer_id');
  assert(svc.includes("action: preview.saleId ? 'sale_cancelled'"), 'audit sale_cancelled');
  assert(svc.includes('ASAAS_CANCEL_FAILED'), 'falha Asaas bloqueia local');
  assert(svc.includes('alreadyReleased'), 'idempotência alreadyReleased');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'preserva pagas');
  assert(svc.includes('isTenantEnterpriseAdminRole'), 'admin only');
  assert(svc.includes('CROSS_TENANT'), 'bloqueia cross-tenant');
  assert(!svc.includes('.delete().eq(\'sale_id\''), 'não hard-delete venda');
  assert(!svc.includes("from('finance_receipts').delete"), 'não hard-delete parcelas');
  console.log('OK testServiceOrchestrationSource');
}

function testApiRoute() {
  const route = read('app/api/lots/[lotId]/release/route.ts');
  assert(route.includes('getReleaseLotPreview'), 'GET preview');
  assert(route.includes('executeReleaseLot'), 'POST execute');
  assert(route.includes('getRequestAuthUser'), 'auth');
  assert(route.includes('createAdminSupabase'), 'admin supabase');
  assert(route.includes('acknowledged'), 'exige acknowledged');
  console.log('OK testApiRoute');
}

function testGisWiring() {
  const gis = read('components/map/GISMap.tsx');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(gis.includes('ReleaseLotConfirmModal'), 'modal importado no GIS');
  assert(gis.includes('lotNeedsReleaseConfirm'), 'helper de gatilho');
  assert(modal.includes('/api/lots/'), 'API no modal');
  assert(modal.includes('Liberar lote e encerrar venda?'), 'título modal');
  assert(modal.includes('Liberar lote e encerrar venda'), 'botão destrutivo');
  assert(modal.includes('Estou ciente de que o lote será liberado'), 'checkbox');
  assert(modal.includes('Motivo da liberação'), 'motivo obrigatório');
  assert(modal.includes('pagamentos preservados'), 'alerta pagamentos');
  assert(modal.includes('submittingRef'), 'anti double-click');
  assert(modal.includes('form-input-light'), 'contraste inputs GIS');
  assert(modal.includes('createPortal'), 'portal no body');
  assert(modal.includes('WebkitTextFillColor'), 'senha com cor forçada');
  assert(gis.includes('Liberação comercial'), 'handleLotAction bloqueia bypass');
  assert(!gis.includes('Confirmar limpeza do lote'), 'modal antigo removido');
  console.log('OK testGisWiring');
}

function testApiErrorShape() {
  const route = read('app/api/lots/[lotId]/release/route.ts');
  assert(route.includes('success: false'), 'success false');
  assert(route.includes('RELEASE_LOT_FAILED'), 'code padrão');
  assert(route.includes('stage:'), 'stage no payload');
  assert(route.includes('[lots/release POST]'), 'log estruturado');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('ReleaseLotStage'), 'stages tipados');
  assert(svc.includes('cancel_asaas'), 'stage asaas');
  assert(svc.includes('clear_lot'), 'stage clear_lot');
  console.log('OK testApiErrorShape');
}

function testPaidNeverDeletedGuards() {
  const zeroPaid = summarizeReleaseReceipts([
    { status: 'pendente', amount: 100 },
    { status: 'atrasado', amount: 200 },
  ]);
  assert(zeroPaid.paidReceipts === 0, 'zero paid');
  assert(zeroPaid.unpaidToCancel === 2, '2 cancel');

  const mixed = summarizeReleaseReceipts([
    { status: 'pago', amount: 1000, paid_at: '2026-03-01' },
    { status: 'pendente', amount: 100 },
    { status: 'atrasado', amount: 100 },
    { status: 'pendente', amount: 100 },
  ]);
  assert(mixed.paidReceipts === 1, 'entrada paga permanece contada');
  assert(mixed.pendingReceipts === 2, '2 pendentes');
  assert(mixed.overdueReceipts === 1, '1 atrasada');
  assert(mixed.totalPaidAmount === 1000, 'total pago 1000');
  console.log('OK testPaidNeverDeletedGuards');
}

function main() {
  testMotiveValidation();
  testReceiptClassification();
  testAsaasClassification();
  testSaleAndLotStatusHelpers();
  testServiceOrchestrationSource();
  testApiRoute();
  testGisWiring();
  testApiErrorShape();
  testPaidNeverDeletedGuards();
  console.log('\nALL mandatory-release-lot-tests PASSED');
}

main();
