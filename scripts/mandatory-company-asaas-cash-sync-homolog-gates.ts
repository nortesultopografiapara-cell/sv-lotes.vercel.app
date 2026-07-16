/**
 * Evidências de isolamento/permissões/idempotência para sync-cash (sem secrets).
 * npx tsx scripts/mandatory-company-asaas-cash-sync-homolog-gates.ts
 */
import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log('  ✅', label);
    passed++;
  } else {
    console.error('  ❌', label);
    failed++;
  }
}

console.log('\n═══ GATE 1: Rota ignora companyId do body ═══');
{
  const route = fs.readFileSync('app/api/finance/asaas/sync-cash/route.ts', 'utf8');
  assert(route.includes('auth.tenantId'), 'companyId vem de auth.tenantId');
  assert(!/companyId:\s*body/i.test(route), 'não lê companyId do body');
  assert(route.includes('authorizeCompanyAsaasRoute'), 'usa authorizeCompanyAsaasRoute');
  assert(route.includes("scope: 'company'"), 'scope company explícito');
}

console.log('\n═══ GATE 2: Auth retorna 403 sem permissão ═══');
{
  const auth = fs.readFileSync('lib/tenantBillingAuth.ts', 'utf8');
  const guard = fs.readFileSync('lib/banking/bankingRouteGuard.ts', 'utf8');
  assert(auth.includes("status: 403"), 'tenantBillingAuth 403');
  assert(auth.includes('Permissão negada'), 'mensagem permissão');
  assert(guard.includes('authorizeCompanyAsaasRoute'), 'guard company asaas');
  assert(guard.includes('assertCompanyAsaasTenantEnabled'), 'whitelist tenant');
}

console.log('\n═══ GATE 3: UI esconde botão sem Asaas ═══');
{
  const page = fs.readFileSync('app/finance/page.tsx', 'utf8');
  assert(page.includes('asaasCashSyncAvailable'), 'gate asaasCashSyncAvailable');
  assert(page.includes('companyAsaasActive'), 'exige companyAsaasActive');
  assert(page.includes('hasSandboxApiKey') || page.includes('hasProductionApiKey'), 'exige API key');
  assert(page.includes('asaasCashSyncAvailable && !ownerReadOnly'), 'owner readonly oculto');
}

console.log('\n═══ GATE 4: Conta de outra empresa bloqueada ═══');
{
  const sync = fs.readFileSync('lib/finance/companyAsaasCashSync.ts', 'utf8');
  assert(sync.includes('getCompanyFinancialAccountById'), 'valida conta por companyId');
  assert(
    sync.includes('não encontrada ou inativa para esta empresa') ||
      sync.includes('Conta financeira não encontrada'),
    'erro isolamento conta',
  );
  assert(!sync.includes('ASAAS_API_KEY'), 'não usa chave Master');
  assert(sync.includes('cash_movements'), 'grava cash_movements');
  assert(!sync.includes('saas_cash_movements'), 'não grava saas_cash_movements');
}

console.log('\n═══ GATE 5: Master isolado ═══');
{
  const masterRoute = fs.readFileSync('app/api/master/saas-cash/sync-asaas/route.ts', 'utf8');
  const masterSvc = fs.readFileSync('lib/saasCashMovements.ts', 'utf8');
  const migration = fs
    .readdirSync('supabase/migrations')
    .find((f) => f.includes('company_cash_movements_asaas_movement_unique'));
  assert(Boolean(migration), 'migration company existe');
  assert(!String(migration).includes('20260830'), 'timestamp 20260830 removido');
  assert(masterRoute.includes('syncAsaasCashMovements'), 'master sync intacto');
  assert(masterSvc.includes('saas_cash_movements'), 'master grava saas_cash_movements');
  const migSql = fs.readFileSync(`supabase/migrations/${migration}`, 'utf8');
  assert(migSql.includes('cash_movements'), 'migration só em cash_movements');
  assert(!migSql.includes('saas_cash_movements'), 'migration não toca Master');
  assert(migSql.includes('UNIQUE INDEX'), 'índice único');
  assert(migSql.includes('WHERE'), 'índice parcial');
}

console.log('\n═══ GATE 6: Anti-duplicação parcela ═══');
{
  const sync = fs.readFileSync('lib/finance/companyAsaasCashSync.ts', 'utf8');
  assert(sync.includes('skippedReconciledPayment') || sync.includes('isPaymentAlreadyReconciled'), 'skip pagamento conciliado');
  assert(sync.includes('company_asaas_charges'), 'checa company_asaas_charges');
  assert(sync.includes('asaas_payment_id'), 'checa asaas_payment_id');
}

console.log('\n════════════════════════════════════════════');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
if (failed > 0) process.exit(1);
console.log('✅ GATES DE HOMOLOGAÇÃO (código) PASSARAM');
