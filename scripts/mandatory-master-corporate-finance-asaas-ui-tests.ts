/**
 * Testes — UI Asaas Corporativo MASTER (Fase 7.4).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-ui-tests.ts
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
  console.log('=== Fase 7.4 corporate Asaas UI tests ===');
  assert(exists('components/master/corporateFinance/CorporateAsaasChargeSection.tsx'), 'section');
  assert(exists('components/master/corporateFinance/CorporateAsaasChargesPage.tsx'), 'list page');
  assert(exists('app/master/corporate-finance/asaas/page.tsx'), 'route');

  const section = read('components/master/corporateFinance/CorporateAsaasChargeSection.tsx');
  assert(section.includes('Cobrança Asaas'), 'title');
  assert(section.includes('Gerar cobrança'), 'create');
  assert(section.includes("billingType"), 'pix/boleto');
  assert(section.includes('maskCpfCnpj'), 'mask doc');
  assert(section.includes("'sync'"), 'sync action');
  assert(section.includes("'reprocess'"), 'reprocess');
  assert(section.includes("'cancel'"), 'cancel');
  assert(section.includes('bodyAuth()'), 'auth fn');
  assert(section.includes('qs()'), 'qs fn');
  assert(!section.includes('NEXT_PUBLIC_ASAAS'), 'sem key client');
  assert(!section.includes('ASAAS_API_KEY'), 'sem api key client');

  const detail = read('components/master/corporateFinance/CorporateReceivableDetailPage.tsx');
  assert(detail.includes('CorporateAsaasChargeSection'), 'wired in AR detail');

  const hub = read('components/master/corporateFinance/CorporateFinanceHubPage.tsx');
  assert(hub.includes('/master/corporate-finance/asaas'), 'hub shortcut');

  const sem = read('lib/master/corporateFinance/semantic.ts');
  assert(sem.includes('semanticToneForAsaasStatus'), 'semantic asaas');
  assert(sem.includes('semanticToneForReceivableStatus'), 'receivable tone preserved');

  console.log('ALL PASS');
}

main();
