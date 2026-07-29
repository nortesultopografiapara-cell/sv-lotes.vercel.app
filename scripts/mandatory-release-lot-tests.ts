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
  classifyRemoteAsaasStatusForRelease,
  isActiveUnpaidFinanceReceipt,
  isAsaasRemoteCancelableStatus,
  isCanceledSaleStatus,
  isLocalAsaasCancelCandidateStatus,
  isPaidFinanceReceiptStatus,
  isSoldOrReservedLotStatus,
  RELEASE_LOT_MOTIVE_OPTIONS,
  resolveBlockLotLabel,
  resolveBlockQuadraLabel,
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
  // REGISTERED local ≠ cancelável: exige sync remoto (não entra na contagem "aberta")
  assert(classifyAsaasChargeForRelease('REGISTERED') === 'other', 'REGISTERED other');
  assert(classifyAsaasChargeForRelease('PAID') === 'paid', 'PAID');
  assert(classifyAsaasChargeForRelease('RECEIVED') === 'paid', 'RECEIVED');
  assert(classifyAsaasChargeForRelease('CONFIRMED') === 'paid', 'CONFIRMED');
  assert(classifyAsaasChargeForRelease('CANCELLED') === 'cancelled', 'CANCELLED');
  assert(classifyAsaasChargeForRelease('REFUNDED') === 'refunded', 'REFUNDED');
  assert(isLocalAsaasCancelCandidateStatus('REGISTERED'), 'REGISTERED é candidata a sync');
  assert(isLocalAsaasCancelCandidateStatus('PENDING'), 'PENDING candidata');
  assert(!isLocalAsaasCancelCandidateStatus('PAID'), 'PAID não candidata');
  assert(isAsaasRemoteCancelableStatus('PENDING'), 'remoto PENDING cancelável');
  assert(isAsaasRemoteCancelableStatus('OVERDUE'), 'remoto OVERDUE cancelável');
  assert(!isAsaasRemoteCancelableStatus('RECEIVED'), 'RECEIVED não cancelável');
  assert(!isAsaasRemoteCancelableStatus('REGISTERED'), 'REGISTERED remoto não DELETE');

  assert(classifyRemoteAsaasStatusForRelease('PENDING') === 'cancel', 'disp PENDING');
  assert(classifyRemoteAsaasStatusForRelease('OVERDUE') === 'cancel', 'disp OVERDUE');
  assert(classifyRemoteAsaasStatusForRelease('RECEIVED') === 'preserve_paid', 'disp RECEIVED');
  assert(classifyRemoteAsaasStatusForRelease('CONFIRMED') === 'preserve_paid', 'disp CONFIRMED');
  assert(classifyRemoteAsaasStatusForRelease('REFUNDED') === 'preserve_refunded', 'disp REFUNDED');
  assert(classifyRemoteAsaasStatusForRelease('DELETED') === 'already_cancelled', 'disp DELETED');
  assert(classifyRemoteAsaasStatusForRelease('CANCELLED') === 'already_cancelled', 'disp CANCELLED');
  assert(
    classifyRemoteAsaasStatusForRelease('AWAITING_RISK_ANALYSIS') === 'block_non_removable',
    'disp outros bloqueia',
  );

  const s = summarizeReleaseCharges([
    { status: 'PENDING' },
    { status: 'OVERDUE' },
    { status: 'REGISTERED' },
    { status: 'PAID' },
    { status: 'CANCELLED' },
  ]);
  assert(s.openAsaasCharges === 2, '2 open canceláveis locais (sem REGISTERED)');
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

function testBlocksColumnMapping() {
  assert(
    resolveBlockQuadraLabel({ block_name: '12', name: 'Ignorado' }) === '12',
    'quadra via block_name',
  );
  assert(
    resolveBlockQuadraLabel({ block_name: null, name: 'A' }) === 'A',
    'quadra via name',
  );
  assert(resolveBlockLotLabel({ number: '05', lot_number: '99' }) === '05', 'lote via number');
  assert(
    resolveBlockLotLabel({ number: null, lot_number: '26' }) === '26',
    'lote via lot_number',
  );

  const svc = read('lib/finance/releaseLotService.ts');
  // SELECT principal: nunca incluir a coluna inexistente `block`
  assert(
    svc.includes(
      "'id, status, price, customer_id, sale_id, contract_id, broker_id, project_id, tenant_id, company_id, block_name, name, number, lot_number'",
    ),
    'select usa block_name/name/number/lot_number',
  );
  assert(!svc.includes(', block, number'), 'não seleciona coluna block');
  assert(!svc.includes('company_id, block,'), 'não seleciona block após company_id');
  assert(svc.includes('resolveBlockQuadraLabel'), 'mapeia quadra');
  assert(svc.includes('resolveBlockLotLabel'), 'mapeia lote');
  assert(svc.includes('LOT_CONTEXT_LOAD_FAILED'), 'código LOT_CONTEXT_LOAD_FAILED');
  assert(svc.includes("'load_lot'"), 'stage load_lot');
  assert(
    svc.includes('Não foi possível carregar os dados do lote.'),
    'mensagem amigável sem SQL',
  );
  // Sem fallback que tenta primeiro a query inválida com `block`
  assert(!svc.includes("'id, status, price, customer_id, sale_id, contract_id, broker_id, project_id, tenant_id, block, number'"), 'sem fallback com coluna block');
  console.log('OK testBlocksColumnMapping');
}

function testServiceOrchestrationSource() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('cancelCompanyCharge'), 'cancela Asaas via serviço oficial');
  assert(svc.includes('getCompanyChargeStatus'), 'consulta status Asaas antes de cancelar');
  assert(svc.includes('resolveAsaasChargesForRelease'), 'resolve com sync remoto');
  assert(svc.includes('classifyRemoteAsaasStatusForRelease'), 'classifica status remoto');
  assert(svc.includes('executeCancel: false'), 'preview só sync sem DELETE cego');
  assert(svc.includes('executeCancel: true'), 'execute cancela após sync');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'cancela parcelas unpaid');
  assert(svc.includes("status: SALE_CANCELLED_STATUS"), 'encerra venda CANCELLED');
  assert(svc.includes("status: CONTRACT_CANCELLED_STATUS"), 'cancela contrato');
  assert(svc.includes("status: LOT_AVAILABLE_STATUS"), 'lote Disponível');
  assert(svc.includes("sale_id: null"), 'limpa sale_id do lote');
  assert(svc.includes("customer_id: null"), 'limpa customer_id');
  assert(svc.includes("action: preview.saleId ? 'sale_cancelled'"), 'audit sale_cancelled');
  assert(svc.includes('ASAAS_CANCEL_FAILED'), 'falha Asaas bloqueia local');
  assert(svc.includes('asaasBlockedCharges'), 'preview expõe bloqueadas');
  assert(svc.includes('delete_rejected_reclassified'), 'reclassifica se DELETE recusado');
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
  assert(modal.includes('Cobranças Asaas canceláveis'), 'conta só canceláveis');
  assert(modal.includes('asaasBlockedCharges'), 'bloqueia submit se Asaas bloqueado');
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
  testBlocksColumnMapping();
  testServiceOrchestrationSource();
  testApiRoute();
  testGisWiring();
  testApiErrorShape();
  testPaidNeverDeletedGuards();
  console.log('\nALL mandatory-release-lot-tests PASSED');
}

main();
