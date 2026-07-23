/**
 * Testes — Conciliação operacional Asaas Corporativo (Fase 7.5).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-reconcile-tests.ts
 */
import fs from 'fs';
import path from 'path';

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

function main() {
  console.log('=== Fase 7.5 corporate Asaas reconcile tests ===');
  assert(exists('lib/master/corporateFinance/asaas/reconcileService.ts'), 'service');
  assert(exists('app/api/master/corporate-finance/asaas/reconcile/route.ts'), 'api');

  const svc = read('lib/master/corporateFinance/asaas/reconcileService.ts');
  assert(svc.includes('syncCorporateAsaasCharge'), 'usa sync');
  assert(svc.includes('CORPORATE_ASAAS_RECONCILE'), 'audit');
  assert(!svc.includes('OFX'), 'sem OFX');
  assert(!svc.includes('finance_receipts'), 'sem finance_receipts');
  assert(!svc.includes("from('saas_charges')"), 'sem query saas');

  const api = read('app/api/master/corporate-finance/asaas/reconcile/route.ts');
  assert(api.includes('authorizeCorporateFinance'), 'super admin');
  assert(api.includes('assertSuperAdmin') || api.includes('authorizeCorporateFinance'), 'auth');

  const ui = read('components/master/corporateFinance/CorporateAsaasChargesPage.tsx');
  assert(ui.includes('/asaas/reconcile'), 'UI conciliar');
  assert(ui.includes('Conciliar pagas'), 'botão');

  console.log('ALL PASS');
}

main();
