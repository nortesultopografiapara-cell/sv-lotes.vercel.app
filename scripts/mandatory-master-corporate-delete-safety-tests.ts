/**
 * Testes obrigatórios — exclusão segura corporativa / topografia Master.
 * npx tsx scripts/mandatory-master-corporate-delete-safety-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  assertCanExecuteCorporateSecureDelete,
  assertSecureDeleteConfirmWord,
  canExecuteCorporateSecureDelete,
  CORPORATE_SECURE_DELETE_CONFIRM_WORD,
  CORPORATE_SECURE_DELETE_SCOPE_NOTICE,
  corporateCashDerivedDeleteBlockMessage,
  formatProjectDeleteLinks,
  isManualCorporateCashOrigin,
  normalizeSecureDeleteConfirmWord,
  projectDeleteHasLinks,
  assertCorporateTableName,
} from '../lib/master/corporateFinance/secureDeletePolicy';
import { canPermanentlyDeleteTopographyQuote } from '../lib/master/topography/quoteDeletePolicy';

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

function testRoleGate() {
  assert(canExecuteCorporateSecureDelete('SUPER_ADMIN'), 'SUPER_ADMIN pode');
  assert(!canExecuteCorporateSecureDelete('ADMIN'), 'ADMIN não');
  assert(!canExecuteCorporateSecureDelete('OWNER'), 'OWNER não');
  assert(!canExecuteCorporateSecureDelete('BROKER'), 'BROKER não');
  assert(!canExecuteCorporateSecureDelete('CUSTOMER'), 'CUSTOMER não');
  assert(!canExecuteCorporateSecureDelete('MASTER_ADMIN'), 'MASTER_ADMIN não (só SUPER_ADMIN)');
  try {
    assertCanExecuteCorporateSecureDelete('ADMIN');
    assert(false, 'deveria lançar');
  } catch (e) {
    assert(e instanceof Error && /SUPER_ADMIN/.test(e.message), 'erro papel');
  }
}

function testConfirmWord() {
  assert(normalizeSecureDeleteConfirmWord(' excluir ') === 'EXCLUIR', 'normalize');
  assertSecureDeleteConfirmWord(CORPORATE_SECURE_DELETE_CONFIRM_WORD);
  try {
    assertSecureDeleteConfirmWord('APAGAR');
    assert(false, 'deveria falhar');
  } catch (e) {
    assert(e instanceof Error && /EXCLUIR/.test(e.message), 'mensagem confirmação');
  }
}

function testCashOrigins() {
  assert(isManualCorporateCashOrigin('MANUAL_INCOME'), 'manual income');
  assert(isManualCorporateCashOrigin('MANUAL_EXPENSE'), 'manual expense');
  assert(!isManualCorporateCashOrigin('RECEIVABLE_PAYMENT'), 'AR derived');
  assert(!isManualCorporateCashOrigin('PAYABLE_PAYMENT'), 'AP derived');
  assert(!isManualCorporateCashOrigin('ASAAS'), 'asaas derived');
  const msg = corporateCashDerivedDeleteBlockMessage('RECEIVABLE_PAYMENT');
  assert(/Conta a Receber/.test(msg), 'msg AR');
  assert(/registro de origem/.test(msg), 'msg origem');
}

function testProjectLinks() {
  const empty = {
    receivables: 0,
    payables: 0,
    quotes: 0,
    cashMovements: 0,
    costCenters: 0,
    asaasCharges: 0,
  };
  assert(!projectDeleteHasLinks(empty), 'sem vínculos');
  assert(
    projectDeleteHasLinks({ ...empty, receivables: 2 }),
    'com AR',
  );
  const lines = formatProjectDeleteLinks({
    ...empty,
    receivables: 2,
    quotes: 1,
    cashMovements: 3,
  });
  assert(lines.some((l) => /2 conta/.test(l)), 'linha AR');
  assert(lines.some((l) => /1 orçamento/.test(l)), 'linha quote');
  assert(lines.some((l) => /3 moviment/.test(l)), 'linha caixa');
}

function testForbiddenTables() {
  assertCorporateTableName('master_corporate_receivables');
  assertCorporateTableName('master_topography_projects');
  try {
    assertCorporateTableName('master_saas_charges');
    assert(false, 'saas bloqueado');
  } catch (e) {
    assert(e instanceof Error, 'erro saas');
  }
  try {
    assertCorporateTableName('finance_receipts');
    assert(false, 'tenant bloqueado');
  } catch (e) {
    assert(e instanceof Error, 'erro tenant');
  }
  try {
    assertCorporateTableName('company_users');
    assert(false, 'company bloqueado');
  } catch (e) {
    assert(e instanceof Error, 'erro company');
  }
}

function testQuotePolicyStillBlocksConverted() {
  const blocked = canPermanentlyDeleteTopographyQuote({
    status: 'CONVERTIDO',
    converted_project_id: 'x',
    approved_at: null,
  });
  assert(!blocked.ok, 'convertido bloqueado');
  const draft = canPermanentlyDeleteTopographyQuote({
    status: 'RASCUNHO',
    converted_project_id: null,
    approved_at: null,
  });
  assert(draft.ok, 'rascunho ok');
}

function testFilesAndApis() {
  assert(exists('lib/master/corporateFinance/secureDeletePolicy.ts'), 'policy');
  assert(exists('lib/master/corporateFinance/secureDeleteService.ts'), 'service');
  assert(exists('lib/master/topography/projectDeleteService.ts'), 'project delete');
  assert(exists('components/master/MasterSecureDeleteModal.tsx'), 'modal');

  const routes = [
    'app/api/master/corporate-finance/receivables/[id]/delete/route.ts',
    'app/api/master/corporate-finance/payables/[id]/delete/route.ts',
    'app/api/master/corporate-finance/cash-movements/[id]/delete/route.ts',
    'app/api/master/corporate-finance/asaas/charges/[id]/delete/route.ts',
    'app/api/master/topography/projects/[id]/delete/route.ts',
  ];
  for (const r of routes) assert(exists(r), r);

  const service = read('lib/master/corporateFinance/secureDeleteService.ts');
  assert(service.includes('deleteCorporateReceivableSecure'), 'AR delete');
  assert(service.includes('deleteCorporatePayableSecure'), 'AP delete');
  assert(service.includes('deleteCorporateCashMovementSecure'), 'cash delete');
  assert(service.includes('deleteCorporateAsaasChargeSecure'), 'asaas delete');
  assert(service.includes('CORPORATE_RECEIVABLE_SECURE_DELETE'), 'audit AR');
  assert(service.includes('remoteDeleted: false'), 'não apaga Asaas pago remoto');
  assert(!/\.from\(\s*['"]master_saas_/.test(service), 'sem from master_saas_');
  assert(!/\.from\(\s*['"]finance_receipts/.test(service), 'sem from finance_receipts');
  assert(service.includes("from('master_corporate_"), 'só master_corporate_');

  assert(CORPORATE_SECURE_DELETE_SCOPE_NOTICE.includes('Caixa SaaS'), 'aviso SaaS');

  const arPage = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(arPage.includes('MasterSecureDeleteModal'), 'UI AR list');
  assert(arPage.includes('/delete'), 'UI AR endpoint');

  for (const f of [
    'components/master/corporateFinance/CorporatePayablesPage.tsx',
    'components/master/corporateFinance/CorporateCashFlowPage.tsx',
    'components/master/corporateFinance/CorporateAsaasChargesPage.tsx',
    'components/master/topography/projects/TopographyProjectsPage.tsx',
  ]) {
    const src = read(f);
    assert(src.includes('MasterSecureDeleteModal') || src.includes('/delete'), `${f} delete wired`);
  }

  const quotesSvc = read('lib/master/topography/quotesService.ts');
  assert(quotesSvc.includes('EXCLUIR'), 'quote aceita EXCLUIR');

  const layout = read('components/master/layout/MasterExecutiveLayout.tsx');
  assert(layout.includes('master-executive-scroll-container'), 'scroll id preservado');
  assert(layout.includes('data-master-build='), 'data-master-build discreto');
  assert(!layout.includes('Master build:'), 'marcador temporário removido do rodapé');
}

function testPackageScript() {
  const pkg = JSON.parse(read('package.json'));
  assert(
    pkg.scripts['test:master-corporate-delete-safety'],
    'script test:master-corporate-delete-safety',
  );
}

function main() {
  console.log('=== Master corporate delete safety tests ===');
  testRoleGate();
  console.log('OK roles');
  testConfirmWord();
  console.log('OK confirm');
  testCashOrigins();
  console.log('OK cash origins');
  testProjectLinks();
  console.log('OK project links');
  testForbiddenTables();
  console.log('OK forbidden tables');
  testQuotePolicyStillBlocksConverted();
  console.log('OK quote policy');
  testFilesAndApis();
  console.log('OK files/apis');
  testPackageScript();
  console.log('OK package');
  console.log('ALL PASS');
}

main();
