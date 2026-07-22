/**
 * Testes obrigatórios — Financeiro Corporativo Master (Fase 6.1 — fundação).
 * npx tsx scripts/mandatory-master-corporate-finance-foundation-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  assertCorporateFinanceAccess,
} from '../lib/master/corporateFinance/service';
import {
  validateCorporateAccountInput,
  validateCorporateCategoryInput,
  validateCorporateCostCenterInput,
} from '../lib/master/corporateFinance/validation';

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

function testFilesAndIsolation() {
  assert(
    exists('supabase/migrations/20260722170000_master_corporate_finance_foundation.sql'),
    'migration foundation',
  );
  assert(exists('lib/master/corporateFinance/types.ts'), 'types');
  assert(exists('lib/master/corporateFinance/validation.ts'), 'validation');
  assert(exists('lib/master/corporateFinance/service.ts'), 'service');
  assert(exists('lib/master/corporateFinance/apiAuth.ts'), 'apiAuth');

  assert(exists('app/api/master/corporate-finance/accounts/route.ts'), 'accounts API');
  assert(exists('app/api/master/corporate-finance/accounts/[id]/route.ts'), 'accounts id API');
  assert(exists('app/api/master/corporate-finance/categories/route.ts'), 'categories API');
  assert(exists('app/api/master/corporate-finance/categories/[id]/route.ts'), 'categories id API');
  assert(exists('app/api/master/corporate-finance/cost-centers/route.ts'), 'cost centers API');
  assert(
    exists('app/api/master/corporate-finance/cost-centers/[id]/route.ts'),
    'cost centers id API',
  );
  assert(exists('app/api/master/corporate-finance/summary/route.ts'), 'summary API');

  assert(exists('app/master/topography/finance/page.tsx'), 'hub page');
  assert(exists('app/master/corporate-finance/accounts/page.tsx'), 'accounts page');
  assert(exists('app/master/corporate-finance/categories/page.tsx'), 'categories page');
  assert(exists('app/master/corporate-finance/cost-centers/page.tsx'), 'cost centers page');

  assert(exists('components/master/corporateFinance/CorporateFinanceHubPage.tsx'), 'hub UI');
  assert(exists('components/master/corporateFinance/CorporateAccountsPage.tsx'), 'accounts UI');
  assert(exists('components/master/corporateFinance/CorporateCategoriesPage.tsx'), 'categories UI');
  assert(
    exists('components/master/corporateFinance/CorporateCostCentersPage.tsx'),
    'cost centers UI',
  );
  assert(exists('components/master/corporateFinance/CorporateFinanceGuard.tsx'), 'guard');

  // Isolamento absoluto — sem APIs tenant /finance
  assert(!exists('app/api/corporate-finance/accounts/route.ts'), 'sem API fora do master');
  assert(!exists('app/api/finance/corporate/route.ts'), 'sem API finance tenant');

  const migration = read(
    'supabase/migrations/20260722170000_master_corporate_finance_foundation.sql',
  );
  assert(migration.includes('master_corporate_financial_accounts'), 'tabela contas');
  assert(migration.includes('opening_balance'), 'opening_balance');
  assert(migration.includes('opening_balance_date'), 'opening_balance_date');
  assert(migration.includes('master_corporate_financial_categories'), 'tabela categorias');
  assert(migration.includes('parent_id'), 'parent_id');
  assert(migration.includes("'INCOME'") && migration.includes("'EXPENSE'"), 'tipos categoria');
  assert(migration.includes('master_corporate_cost_centers'), 'tabela centros');
  assert(migration.includes('generate_next_corporate_cost_center_code'), 'RPC código');
  assert(migration.includes('is_super_admin()'), 'RLS super admin');
  const migrationNoComments = migration.replace(/--[^\n]*/g, '');
  assert(!migrationNoComments.includes('cash_movements'), 'sem cash_movements tenant/saas');
  assert(!migrationNoComments.toLowerCase().includes('saas_cash'), 'sem saas cash');
  assert(!migrationNoComments.includes('current_balance'), 'sem saldo atual armazenado');
  assert(!/receivables?/i.test(migrationNoComments), 'sem AR nesta fase');
  assert(!/payables?/i.test(migrationNoComments), 'sem AP nesta fase');

  const hub = read('app/master/topography/finance/page.tsx');
  assert(!hub.includes('MasterModulePlaceholder'), 'hub sem placeholder');
  assert(hub.includes('CorporateFinanceHubPage'), 'hub funcional');

  const nav = read('lib/master/executiveNav.ts');
  const financeBlock = nav.slice(
    nav.indexOf("name: 'Financeiro'"),
    nav.indexOf("name: 'Operação'"),
  );
  assert(financeBlock.includes("href: '/master/topography/finance'"), 'nav finance');
  assert(!financeBlock.includes('comingSoon: true'), 'Financeiro sem Em breve');
  assert(nav.includes("href: '/master/corporate-finance/accounts'"), 'nav contas');
  assert(nav.includes("href: '/master/corporate-finance/categories'"), 'nav categorias');
  assert(nav.includes("href: '/master/corporate-finance/cost-centers'"), 'nav centros');

  const cashFlowBlock = nav.slice(
    nav.indexOf("name: 'Fluxo de Caixa'"),
    nav.indexOf("name: 'Contas a Pagar'"),
  );
  // Fase 6.3 liberou o fluxo — detalhado em mandatory-master-corporate-finance-cash-tests
  assert(cashFlowBlock.includes("href: '/master/corporate-finance/cash-flow'"), 'nav fluxo');

  // Fase 6.2 AR/AP + 6.3 cash; 6.4 bridge não nesta migration
  assert(exists('app/api/master/corporate-finance/receivables/route.ts'), '6.2 AR existe');
  assert(exists('app/api/master/corporate-finance/payables/route.ts'), '6.2 AP existe');
  assert(exists('lib/master/corporateFinance/cashMovementsService.ts'), '6.3 cash existe');
  assert(
    !migration.includes('valor_recebido') || migration.includes('COMMENT'),
    'sem bridge valor_recebido na 6.1',
  );
}

function testValidation() {
  const account = validateCorporateAccountInput({
    name: ' Conta Principal ',
    account_type: 'CHECKING',
    opening_balance: 1500.5,
    opening_balance_date: '2026-01-01',
    is_default: true,
  });
  assert(account.name === 'Conta Principal', 'account name trim');
  assert(account.opening_balance === 1500.5, 'opening balance');
  assert(account.opening_balance_date === '2026-01-01', 'opening date');

  let threw = false;
  try {
    validateCorporateAccountInput({
      name: 'X',
      opening_balance: 10,
      opening_balance_date: null,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'saldo inicial exige data');

  const cat = validateCorporateCategoryInput({
    name: 'Combustível campo',
    type: 'EXPENSE',
    parent_id: null,
  });
  assert(cat.type === 'EXPENSE', 'category type');

  const center = validateCorporateCostCenterInput({
    name: 'Obra A',
    code: null,
    project_id: null,
  });
  assert(center.name === 'Obra A', 'center name');
  assert(center.code == null || center.code === '', 'code optional');
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok === true, 'access ok');
  assert(
    assertCorporateFinanceAccess({ userId: null }).ok === false,
    'sem userId',
  );
  const blocked = assertCorporateFinanceAccess({
    userId: 'u1',
    impersonatingTenantId: 'tenant-x',
  });
  assert(blocked.ok === false, 'impersonation bloqueada');
}

function testAuditActionsPresent() {
  const accountsRoute = read('app/api/master/corporate-finance/accounts/route.ts');
  const accountsId = read('app/api/master/corporate-finance/accounts/[id]/route.ts');
  assert(accountsRoute.includes('CORPORATE_ACCOUNT_CREATED'), 'audit create account');
  assert(accountsId.includes('CORPORATE_ACCOUNT_UPDATED'), 'audit update account');
  assert(accountsId.includes('CORPORATE_ACCOUNT_ACTIVATED'), 'audit activate account');
  assert(accountsId.includes('CORPORATE_ACCOUNT_DEACTIVATED'), 'audit deactivate account');

  const catRoute = read('app/api/master/corporate-finance/categories/route.ts');
  const catId = read('app/api/master/corporate-finance/categories/[id]/route.ts');
  assert(catRoute.includes('CORPORATE_CATEGORY_CREATED'), 'audit create category');
  assert(catId.includes('CORPORATE_CATEGORY_UPDATED'), 'audit update category');
  assert(catId.includes('CORPORATE_CATEGORY_ACTIVATED'), 'audit activate category');
  assert(catId.includes('CORPORATE_CATEGORY_DEACTIVATED'), 'audit deactivate category');

  const ccRoute = read('app/api/master/corporate-finance/cost-centers/route.ts');
  const ccId = read('app/api/master/corporate-finance/cost-centers/[id]/route.ts');
  assert(ccRoute.includes('CORPORATE_COST_CENTER_CREATED'), 'audit create center');
  assert(ccId.includes('CORPORATE_COST_CENTER_UPDATED'), 'audit update center');
  assert(ccId.includes('CORPORATE_COST_CENTER_ACTIVATED'), 'audit activate center');
  assert(ccId.includes('CORPORATE_COST_CENTER_DEACTIVATED'), 'audit deactivate center');

  const guard = read('components/master/corporateFinance/CorporateFinanceGuard.tsx');
  assert(guard.includes("role !== 'SUPER_ADMIN'"), 'UI só SUPER_ADMIN');
  assert(guard.includes('impersonating') || guard.includes('Impersonation'), 'UI bloqueia impersonation');

  const service = read('lib/master/corporateFinance/service.ts');
  assert(service.includes("module: 'CORPORATE_FINANCE'"), 'módulo auditoria');
}

function main() {
  testFilesAndIsolation();
  testValidation();
  testAccess();
  testAuditActionsPresent();
  console.log('OK — mandatory-master-corporate-finance-foundation-tests');
}

main();
