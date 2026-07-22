/**
 * Testes — Fase 6.2.1 autofill Conta a Receber por projeto.
 * npx tsx scripts/mandatory-master-corporate-finance-arap-autofill-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  computeUnprovisionedBalance,
} from '../lib/master/corporateFinance/projectContextService';
import {
  incomeCategoryHintsForTopography,
  mapProjectPaymentMethod,
} from '../lib/master/corporateFinance/incomeCategoryHints';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import { computeNetAmount } from '../lib/master/corporateFinance/arApMath';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function testFiles() {
  assert(exists('lib/master/corporateFinance/projectContextService.ts'), 'context service');
  assert(exists('lib/master/corporateFinance/incomeCategoryHints.ts'), 'income hints');
  assert(
    exists('app/api/master/corporate-finance/receivables/project-context/route.ts'),
    'project-context API',
  );
  assert(
    exists('app/api/master/corporate-finance/receivables/client-suggestions/route.ts'),
    'client-suggestions API',
  );
  assert(exists('components/master/corporateFinance/ReceivableFormModal.tsx'), 'form modal');

  const ctxApi = read('app/api/master/corporate-finance/receivables/project-context/route.ts');
  assert(ctxApi.includes('authorizeCorporateFinance'), 'context auth');
  assert(ctxApi.includes('getReceivableProjectContext'), 'context service call');
  assert(!ctxApi.includes("from('cash_movements')"), 'sem caixa');

  const svc = read('lib/master/corporateFinance/projectContextService.ts');
  assert(svc.includes('unprovisioned_balance'), 'unprovisioned');
  assert(svc.includes('provisioned_total'), 'provisioned');
  assert(svc.includes('assertReceivableProvisionLimit'), 'provision limit');
  assert(!svc.includes('.update(') || svc.includes('from('), 'read-mostly');
  assert(!svc.includes("from('cash_movements')"), 'sem cash_movements');
  assert(!svc.includes("from('finance_receipts')"), 'sem finance_receipts');

  const create = read('lib/master/corporateFinance/receivablesService.ts');
  assert(create.includes('assertReceivableProvisionLimit'), 'create uses limit');
  assert(!create.includes("valor_recebido:"), 'não grava valor_recebido');

  const modal = read('components/master/corporateFinance/ReceivableFormModal.tsx');
  assert(modal.includes('Origem da cobrança') || modal.includes('origin'), 'origem');
  assert(modal.includes('project-context'), 'loads context');
  assert(modal.includes('client-suggestions'), 'client search');
  assert(modal.includes('Trocar o projeto') || modal.includes('substituirá'), 'confirm swap');
  assert(modal.includes('allow_over_provision'), 'over provision flag');
  assert(modal.includes('Nova conta a receber'), 'title');

  const list = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(list.includes('Nova conta a receber'), 'botão listagem');
  assert(list.includes('ReceivableFormModal'), 'usa modal');
  assert(list.includes('new=1') || list.includes("get('new')"), 'deep link new');

  const detail = read(
    'components/master/topography/projects/TopographyProjectDetailPage.tsx',
  );
  assert(detail.includes('Nova conta a receber'), 'ação projeto');

  assert(detail.includes('new=1'), 'deep link new');
  assert(detail.includes('valor_recebido'), 'valor_recebido preservado na UI');

  // 6.3 cash pode existir; bridge valor_recebido não
  assert(
    !exists('app/api/master/corporate-finance/asaas/route.ts'),
    'Asaas corporativo não',
  );
  const cashSvc = exists('lib/master/corporateFinance/cashMovementsService.ts')
    ? read('lib/master/corporateFinance/cashMovementsService.ts')
    : '';
  assert(!cashSvc.includes('valor_recebido'), 'sem bridge valor_recebido no cash');
}

function testUnprovisionedMath() {
  assert(
    computeUnprovisionedBalance({
      contractValue: 10000,
      valorRecebido: 2000,
      provisionedTotal: 3000,
    }) === 5000,
    'saldo não provisionado 5000',
  );
  assert(
    computeUnprovisionedBalance({
      contractValue: 1000,
      valorRecebido: 800,
      provisionedTotal: 500,
    }) === 0,
    'não negativo',
  );
  assert(
    computeUnprovisionedBalance({
      contractValue: 8000,
      valorRecebido: 0,
      provisionedTotal: 8000,
    }) === 0,
    'totalmente provisionado',
  );
}

function testHintsAndPaymentMap() {
  const hints = incomeCategoryHintsForTopography('TOPOGRAFIA');
  assert(hints.some((h) => h.toLowerCase().includes('topografia')), 'hint topografia');
  assert(incomeCategoryHintsForTopography('DRONE')[0] === 'Drone', 'hint drone');
  assert(mapProjectPaymentMethod('PIX 30 dias') === 'PIX', 'map pix');
  assert(mapProjectPaymentMethod('TED') === 'TED', 'map ted');
  assert(mapProjectPaymentMethod(null) == null, 'map null');
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'access ok');
  assert(
    !assertCorporateFinanceAccess({ userId: 'u1', impersonatingTenantId: 't' }).ok,
    'impersonation',
  );
  const guard = read('components/master/corporateFinance/CorporateFinanceGuard.tsx');
  assert(guard.includes("role !== 'SUPER_ADMIN'"), 'SUPER_ADMIN only');
}

function testNetStillWorks() {
  assert(
    computeNetAmount({
      original_amount: 1000,
      discount_amount: 0,
      interest_amount: 0,
      fine_amount: 0,
    }) === 1000,
    'net',
  );
}

function testIsolationDiffSurface() {
  const files = [
    'lib/master/corporateFinance/projectContextService.ts',
    'lib/master/corporateFinance/incomeCategoryHints.ts',
    'app/api/master/corporate-finance/receivables/project-context/route.ts',
    'app/api/master/corporate-finance/receivables/client-suggestions/route.ts',
    'components/master/corporateFinance/ReceivableFormModal.tsx',
  ];
  for (const f of files) {
    const c = read(f);
    assert(!c.includes("from('sales')"), `${f} sem sales`);
    assert(!c.includes("from('contracts')"), `${f} sem contracts`);
    assert(!c.includes('/api/finance/'), `${f} sem api finance tenant`);
  }
}

function main() {
  testFiles();
  testUnprovisionedMath();
  testHintsAndPaymentMap();
  testAccess();
  testNetStillWorks();
  testIsolationDiffSurface();
  console.log('OK — mandatory-master-corporate-finance-arap-autofill-tests');
}

main();
