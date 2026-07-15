/**
 * Mandatory tests — Asaas client-side gate removal
 *
 * Validates that:
 * 1. ChargesPageClient no longer uses isCompanyAsaasEnabled()
 * 2. Dashboard page no longer uses isCompanyAsaasEnabled()
 * 3. Finance page no longer uses isCompanyAsaasEnabled()
 * 4. Server-side guards remain intact
 * 5. ChargeInstallmentActions still receives companyAsaasEnabled prop
 * 6. chargeOperationsHelpers logic is unchanged
 * 7. No NEXT_PUBLIC_* dependency in gate decisions
 * 8. API routes maintain authorizeCompanyAsaasRoute
 * 9. 403/404 handling exists in client components
 * 10. No sensitive credentials exposed
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

function assertNot(content: string, pattern: string | RegExp, label: string): void {
  const found = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
  if (found) throw new Error(`FAIL (should not contain): ${label}`);
  console.log(`  ✓ ${label}`);
}

function assertContains(content: string, pattern: string | RegExp, label: string): void {
  const found = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
  if (!found) throw new Error(`FAIL (should contain): ${label}`);
  console.log(`  ✓ ${label}`);
}

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void): void {
  console.log(`\n▸ ${name}`);
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── TEST 1: ChargesPageClient no longer gates on whitelist ──────────

runTest('ChargesPageClient removes isCompanyAsaasEnabled import and usage', () => {
  const src = readFile('components/charges/ChargesPageClient.tsx');
  assertNot(src, "import { isCompanyAsaasEnabled }", 'no isCompanyAsaasEnabled import');
  assertNot(src, /isCompanyAsaasEnabled\(/, 'no isCompanyAsaasEnabled() call');
  assertNot(src, /const companyAsaasEnabled\s*=\s*isCompanyAsaasEnabled/, 'no whitelist variable');
  assertContains(src, 'asaasAccessAvailable', 'uses server-derived asaasAccessAvailable state');
  assertContains(src, "setAsaasAccessAvailable(false)", 'sets unavailable on 403/404');
  assertContains(src, "setAsaasAccessAvailable(true)", 'sets available on success');
});

// ─── TEST 2: Dashboard no longer gates on whitelist ──────────────────

runTest('Dashboard removes isCompanyAsaasEnabled import and usage', () => {
  const src = readFile('app/dashboard/page.tsx');
  assertNot(src, "import { isCompanyAsaasEnabled }", 'no isCompanyAsaasEnabled import');
  assertNot(src, /isCompanyAsaasEnabled\(/, 'no isCompanyAsaasEnabled() call');
  assertNot(src, /const companyAsaasEnabled\s*=\s*isCompanyAsaasEnabled/, 'no whitelist variable');
  assertContains(src, 'asaasAccessAvailable', 'uses server-derived state');
  assertContains(src, "setAsaasAccessAvailable(false)", 'sets unavailable on 403/404');
});

// ─── TEST 3: Finance page no longer gates on whitelist ───────────────

runTest('Finance page removes isCompanyAsaasEnabled import and usage', () => {
  const src = readFile('app/finance/page.tsx');
  assertNot(src, "import { isCompanyAsaasEnabled }", 'no isCompanyAsaasEnabled import');
  assertNot(src, /isCompanyAsaasEnabled\(/, 'no isCompanyAsaasEnabled() call');
  assertNot(src, /const companyAsaasEnabled\s*=\s*isCompanyAsaasEnabled/, 'no whitelist variable');
  assertContains(src, 'asaasAccessAvailable', 'uses server-derived state');
  assertContains(src, "setAsaasAccessAvailable(false)", 'sets unavailable on 403/404');
  assertContains(src, "setAsaasAccessAvailable(true)", 'sets available on success');
});

// ─── TEST 4: Server-side guards remain intact ────────────────────────

runTest('Server-side authorizeCompanyAsaasRoute guard is intact', () => {
  const guard = readFile('lib/banking/bankingRouteGuard.ts');
  assertContains(guard, 'authorizeCompanyAsaasRoute', 'authorizeCompanyAsaasRoute exists');
  assertContains(guard, 'assertCompanyAsaasTenantEnabled', 'tenant validation exists');
  assertContains(guard, 'isCompanyAsaasEnabled(tenantId)', 'whitelist check on server');
  assertContains(guard, '403', 'returns 403 for denied');
});

// ─── TEST 5: API routes still use authorizeCompanyAsaasRoute ─────────

runTest('API routes maintain server-side authorization', () => {
  const routes = [
    'app/api/finance/asaas/integration/route.ts',
    'app/api/finance/asaas/charges/route.ts',
    'app/api/finance/asaas/create-charge/route.ts',
    'app/api/finance/financial-accounts/route.ts',
    'app/api/finance/asaas/charge-status/route.ts',
  ];
  for (const route of routes) {
    const src = readFile(route);
    assertContains(src, 'authorizeCompanyAsaasRoute', `${route} uses authorizeCompanyAsaasRoute`);
  }
});

// ─── TEST 6: ChargeInstallmentActions still shows "Asaas indisponível" ─

runTest('ChargeInstallmentActions renders unavailable from server-derived prop', () => {
  const src = readFile('components/charges/ChargeInstallmentActions.tsx');
  assertContains(src, 'companyAsaasEnabled', 'accepts companyAsaasEnabled prop');
  assertContains(src, 'Asaas indisponível', 'renders unavailable message');
  assertContains(src, 'if (!companyAsaasEnabled)', 'guards on prop value');
  assertNot(src, /isCompanyAsaasEnabled/, 'does NOT import isCompanyAsaasEnabled');
});

// ─── TEST 7: chargeOperationsHelpers unchanged ───────────────────────

runTest('chargeOperationsHelpers logic unchanged', () => {
  const src = readFile('lib/charges/chargeOperationsHelpers.ts');
  assertContains(src, 'canPerformMutableAsaasActions', 'canPerformMutableAsaasActions exists');
  assertContains(src, 'canGenerateAsaasCharge', 'canGenerateAsaasCharge exists');
  assertContains(src, 'params.companyAsaasEnabled', 'checks companyAsaasEnabled param');
  assertContains(src, 'params.integrationActive', 'checks integrationActive param');
  assertContains(src, '!params.ownerReadOnly', 'checks ownerReadOnly param');
  assertNot(src, /isCompanyAsaasEnabled/, 'does NOT import whitelist function');
});

// ─── TEST 8: No NEXT_PUBLIC dependency in gate decisions ─────────────

runTest('No NEXT_PUBLIC_* dependency in client gate decisions', () => {
  const charges = readFile('components/charges/ChargesPageClient.tsx');
  const dashboard = readFile('app/dashboard/page.tsx');
  const finance = readFile('app/finance/page.tsx');

  assertNot(charges, 'NEXT_PUBLIC_ASAAS', 'charges: no NEXT_PUBLIC reference');
  assertNot(dashboard, 'NEXT_PUBLIC_ASAAS', 'dashboard: no NEXT_PUBLIC reference');
  assertNot(finance, 'NEXT_PUBLIC_ASAAS', 'finance: no NEXT_PUBLIC reference');
});

// ─── TEST 9: 403/404 handling in client components ───────────────────

runTest('Client components handle 403/404 from API', () => {
  const charges = readFile('components/charges/ChargesPageClient.tsx');
  assertContains(charges, 'res.status === 403', 'charges: handles 403');
  assertContains(charges, 'res.status === 404', 'charges: handles 404');

  const dashboard = readFile('app/dashboard/page.tsx');
  assertContains(dashboard, 'res.status === 403', 'dashboard: handles 403');
  assertContains(dashboard, 'res.status === 404', 'dashboard: handles 404');

  const finance = readFile('app/finance/page.tsx');
  assertContains(finance, 'integrationRes.status === 403', 'finance: handles 403');
  assertContains(finance, 'integrationRes.status === 404', 'finance: handles 404');
});

// ─── TEST 10: No sensitive credentials exposed ──────────────────────

runTest('No sensitive credentials in client responses', () => {
  const financialAccountsRoute = readFile('app/api/finance/financial-accounts/route.ts');
  assertContains(
    financialAccountsRoute,
    'assertCompanyFinancialAccountResponseSafe',
    'response sanitized before return',
  );

  const chargesRoute = readFile('app/api/finance/asaas/charges/route.ts');
  assertContains(
    chargesRoute,
    'assertCompanyAsaasChargeResponseSafe',
    'charge response sanitized before return',
  );

  const sanitizer = readFile('lib/finance/companyFinancialAccountTypes.ts');
  assertContains(sanitizer, 'assertCompanyFinancialAccountResponseSafe', 'sanitizer function defined');
});

// ─── TEST 11: CustomerLotFormModal still clean (prior fix) ───────────

runTest('CustomerLotFormModal prior fix intact', () => {
  const src = readFile('components/map/CustomerLotFormModal.tsx');
  assertNot(src, /isCompanyAsaasEnabled/, 'no isCompanyAsaasEnabled');
  assertContains(src, 'financialAccountsUnavailable', 'unavailable state present');
  assertContains(src, "credentials: 'include'", 'direct API call');
});

// ─── TEST 12: Tenant isolation on server ─────────────────────────────

runTest('Tenant isolation enforced on server', () => {
  const financialAccountsRoute = readFile('app/api/finance/financial-accounts/route.ts');
  assertContains(financialAccountsRoute, 'auth.tenantId', 'filters by tenant');
  assertNot(financialAccountsRoute, 'company_id', 'no client-supplied company_id');

  const guard = readFile('lib/banking/bankingRouteGuard.ts');
  assertContains(guard, 'authorizeTenantBilling', 'tenant auth from session');
});

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
