/**
 * Testes — Asaas Corporativo MASTER cobranças (Fase 7.2).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-charges-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import { mapAsaasRemoteStatusToLocal } from '../lib/master/corporateFinance/asaas/client';
import { canDowngradeCorporateAsaasStatus } from '../lib/master/corporateFinance/asaas/types';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testFiles() {
  assert(exists('lib/master/corporateFinance/asaas/client.ts'), 'client');
  assert(exists('lib/master/corporateFinance/asaas/chargesService.ts'), 'chargesService');
  assert(exists('app/api/master/corporate-finance/asaas/charges/route.ts'), 'charges API');
  assert(exists('app/api/master/corporate-finance/asaas/charges/[id]/sync/route.ts'), 'sync');
  assert(exists('app/api/master/corporate-finance/asaas/charges/[id]/cancel/route.ts'), 'cancel');
  assert(exists('app/api/master/corporate-finance/asaas/charges/[id]/pix/route.ts'), 'pix');
  assert(!exists('app/api/master/corporate-finance/asaas/webhook/route.ts'), 'webhook ainda 7.3');
}

function testIsolation() {
  const svc = read('lib/master/corporateFinance/asaas/chargesService.ts');
  assert(!svc.includes("from('company_asaas"), 'sem company_asaas table');
  assert(!svc.includes("from('saas_charges')"), 'sem query saas_charges');
  assert(!svc.includes('finance_receipts'), 'sem finance_receipts');
  assert(!svc.includes('receiveReceivable'), 'criar cobrança não recebe');
  assert(!svc.includes('createMovementFromReceivablePayment'), 'criar não gera caixa');
  assert(svc.includes('CORPORATE_ASAAS_CHARGE_CREATED'), 'audit create');

  const client = read('lib/master/corporateFinance/asaas/client.ts');
  assert(client.includes('ASAAS_API_KEY'), 'usa API key env');
  assert(!client.includes('NEXT_PUBLIC'), 'sem NEXT_PUBLIC');
  assert(!client.includes('bank_credentials'), 'sem credentials tenant');
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'ok');
  assert(
    !assertCorporateFinanceAccess({ userId: 'u1', impersonatingTenantId: 't' }).ok,
    'impersonation',
  );
}

function testStatusMap() {
  assert(mapAsaasRemoteStatusToLocal('RECEIVED') === 'RECEIVED', 'received');
  assert(mapAsaasRemoteStatusToLocal('CONFIRMED') === 'CONFIRMED', 'confirmed');
  assert(mapAsaasRemoteStatusToLocal('PENDING') === 'AWAITING_PAYMENT', 'pending');
  assert(!canDowngradeCorporateAsaasStatus('RECEIVED', 'OVERDUE'), 'no downgrade');
}

function main() {
  console.log('=== Fase 7.2 corporate Asaas charges tests ===');
  testFiles();
  console.log('OK files');
  testIsolation();
  console.log('OK isolation');
  testAccess();
  console.log('OK access');
  testStatusMap();
  console.log('OK status');
  console.log('ALL PASS');
}

main();
