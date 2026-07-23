/**
 * Testes — liquidação Asaas corporativo (evidência, sync, rolagem shell).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-settle-fix-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  hasCorporateAsaasPaymentEvidence,
  shouldSettleCorporateAsaasPayment,
  isCorporateAsaasPaidRemoteStatus,
  mapAsaasRemoteStatusToLocal,
} from '../lib/master/corporateFinance/asaas/client';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testPaidStatusSettlesWithoutDate() {
  const payment = { id: 'pay_1', status: 'RECEIVED', value: 15 };
  assert(isCorporateAsaasPaidRemoteStatus('RECEIVED'), 'RECEIVED paid');
  assert(isCorporateAsaasPaidRemoteStatus('CONFIRMED'), 'CONFIRMED paid');
  assert(isCorporateAsaasPaidRemoteStatus('RECEIVED_IN_CASH'), 'CASH paid');
  assert(hasCorporateAsaasPaymentEvidence(payment), 'status pago liquida sem data');
  assert(
    shouldSettleCorporateAsaasPayment({ payment }),
    'should settle paid status',
  );
}

function testPaidEventSettles() {
  const payment = { id: 'pay_2', status: 'PENDING', value: 15 };
  assert(
    hasCorporateAsaasPaymentEvidence(payment, 'PAYMENT_RECEIVED'),
    'evento RECEIVED é evidência',
  );
  assert(
    shouldSettleCorporateAsaasPayment({ payment, eventType: 'PAYMENT_RECEIVED' }),
    'PAYMENT_RECEIVED liquida',
  );
  assert(
    shouldSettleCorporateAsaasPayment({ payment, eventType: 'PAYMENT_CONFIRMED' }),
    'PAYMENT_CONFIRMED liquida',
  );
}

function testPaymentCreatedNeverSettles() {
  const payment = {
    id: 'pay_3',
    status: 'RECEIVED',
    value: 15,
    paymentDate: '2026-07-23',
  };
  assert(
    !shouldSettleCorporateAsaasPayment({ payment, eventType: 'PAYMENT_CREATED' }),
    'PAYMENT_CREATED não liquida',
  );
  assert(
    !hasCorporateAsaasPaymentEvidence(payment, 'PAYMENT_CREATED'),
    'CREATED sem evidência',
  );
}

function testPendingWithoutPaidEvent() {
  const payment = { id: 'pay_4', status: 'PENDING', value: 15 };
  assert(!shouldSettleCorporateAsaasPayment({ payment }), 'PENDING sem evento não liquida');
  assert(
    !shouldSettleCorporateAsaasPayment({ payment, eventType: 'PAYMENT_UPDATED' }),
    'PAYMENT_UPDATED+PENDING não liquida',
  );
  assert(
    shouldSettleCorporateAsaasPayment({
      payment: { ...payment, status: 'RECEIVED' },
      eventType: 'PAYMENT_UPDATED',
    }),
    'PAYMENT_UPDATED+RECEIVED liquida',
  );
}

function testIdempotencyAndRetryWiring() {
  const settle = read('lib/master/corporateFinance/asaas/webhookSettlement.ts');
  assert(settle.includes('ASAAS_CORP:'), 'idempotency ASAAS_CORP');
  assert(settle.includes('duplicate event ignored'), 'log duplicate');
  assert(settle.includes('payment evidence accepted'), 'log evidence');
  assert(settle.includes('receivable settled'), 'log settled');
  assert(settle.includes('event received'), 'log received');
  assert(settle.includes('charge found'), 'log charge found');
  assert(settle.includes('duplicate event retry'), 'retry FAILED/PENDING');
  assert(settle.includes('shouldSettleCorporateAsaasPayment'), 'usa helper settle');
  assert(!settle.includes('ASAAS_API_KEY'), 'sem API key em logs');
}

function testSyncRecoversLostPayment() {
  const sync = read('lib/master/corporateFinance/asaas/chargesService.ts');
  assert(sync.includes('shouldSettleCorporateAsaasPayment'), 'sync usa settle helper');
  assert(sync.includes('settleCorporateAsaasChargeFromRemote'), 'sync liquida');
  assert(
    !sync.includes('Status Asaas sem evidência de pagamento — AR não liquidada'),
    'sync não força AWAITING ao perder data',
  );
}

function testShellScrollNotBlocked() {
  const css = read('components/master/layout/masterExecutiveLayout.module.css');
  const shellMatch = css.match(/\.shell\s*\{([^}]+)\}/);
  assert(shellMatch, 'shell rule');
  assert(shellMatch![1].includes('overflow: hidden'), 'shell overflow hidden (main strategy)');
  assert(/height:\s*100dvh/.test(shellMatch![1]), 'shell height 100dvh');
  const contentMatch = css.match(/\.content\s*\{([^}]+)\}/);
  assert(contentMatch, 'content rule');
  assert(contentMatch![1].includes('overflow-y: scroll') || contentMatch![1].includes('overflow-y: auto'), 'content overflow-y');
  assert(contentMatch![1].includes('min-height: 0'), 'content min-height 0');
  assert(
    read('components/master/layout/MasterExecutiveLayout.tsx').includes(
      'master-executive-scroll-container',
    ),
    'scroll container id',
  );
}

function testTableHorizontalWrappers() {
  const cf = read('components/master/corporateFinance/corporateFinance.module.css');
  assert(cf.includes('.tableWrap'), 'tableWrap');
  assert(/\.tableWrap\s*\{[^}]*overflow-x:\s*auto/s.test(cf), 'tableWrap overflow-x');
  const audit = read('app/master/audit/page.tsx');
  assert(audit.includes('overflow-x-auto'), 'audit horizontal');
  const reports = read('app/master/reports/page.tsx');
  assert(reports.includes('overflow-x-auto'), 'reports horizontal');
}

function testMapStatuses() {
  assert(mapAsaasRemoteStatusToLocal('RECEIVED') === 'RECEIVED', 'map received');
  assert(mapAsaasRemoteStatusToLocal('CONFIRMED') === 'CONFIRMED', 'map confirmed');
  assert(mapAsaasRemoteStatusToLocal('RECEIVED_IN_CASH') === 'RECEIVED', 'map cash');
  assert(mapAsaasRemoteStatusToLocal('PENDING') === 'AWAITING_PAYMENT', 'map pending');
}

function main() {
  console.log('=== Asaas settle + scroll fix tests ===');
  testPaidStatusSettlesWithoutDate();
  console.log('OK paid status');
  testPaidEventSettles();
  console.log('OK paid event');
  testPaymentCreatedNeverSettles();
  console.log('OK payment created');
  testPendingWithoutPaidEvent();
  console.log('OK pending');
  testIdempotencyAndRetryWiring();
  console.log('OK idempotency wiring');
  testSyncRecoversLostPayment();
  console.log('OK sync');
  testShellScrollNotBlocked();
  console.log('OK shell scroll');
  testTableHorizontalWrappers();
  console.log('OK tables');
  testMapStatuses();
  console.log('OK map');
  console.log('ALL PASS');
}

main();
