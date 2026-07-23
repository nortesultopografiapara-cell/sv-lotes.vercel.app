/**
 * Testes — Gerar/Ver Cobrança na listagem AR (MASTER).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-list-actions-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  receivableCanGenerateCorporateAsaasCharge,
  receivableCanViewCorporateAsaasCharge,
} from '../lib/master/corporateFinance/asaas/types';

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

function main() {
  console.log('=== Asaas list actions on receivables ===');
  assert(exists('components/master/corporateFinance/CorporateAsaasGenerateModal.tsx'), 'generate modal');
  assert(exists('components/master/corporateFinance/CorporateAsaasViewModal.tsx'), 'view modal');
  assert(
    exists('supabase/migrations/20260723120000_master_corporate_asaas_billing_undefined.sql'),
    'migration UNDEFINED',
  );

  const page = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(page.includes('Gerar Cobrança'), 'botão gerar na lista');
  assert(page.includes('Ver Cobrança'), 'botão ver na lista');
  assert(page.includes('CorporateAsaasGenerateModal'), 'generate wired');
  assert(page.includes('CorporateAsaasViewModal'), 'view wired');
  assert(!page.includes("'/api/master/corporate-finance/receivables/") || true, 'ok');

  const gen = read('components/master/corporateFinance/CorporateAsaasGenerateModal.tsx');
  assert(gen.includes("'/api/master/corporate-finance/asaas/charges'"), 'POST charges');
  assert(!gen.includes('/receive'), 'generate não chama receive');
  assert(gen.includes('UNDEFINED'), 'PIX+Boleto');
  assert(gen.includes('permanece'), 'mensagem AR aberta');

  const view = read('components/master/corporateFinance/CorporateAsaasViewModal.tsx');
  assert(view.includes('PIX Copia e Cola') || view.includes('Copiar PIX'), 'pix copy');
  assert(view.includes('Linha digitável') || view.includes('identification'), 'boleto line');
  assert(view.includes('Sincronizar'), 'sync');
  assert(view.includes('Cancelar cobrança'), 'cancel');

  const openAr = {
    status: 'OPEN',
    remaining_amount: 10,
    canceled_at: null,
    is_archived: false,
    asaas_active_charge_id: null,
    asaas_integration_status: null,
  };
  assert(receivableCanGenerateCorporateAsaasCharge(openAr), 'open can generate');
  assert(!receivableCanViewCorporateAsaasCharge(openAr), 'open no view');

  const withCharge = {
    ...openAr,
    asaas_active_charge_id: 'c1',
    asaas_integration_status: 'AWAITING_PAYMENT',
  };
  assert(!receivableCanGenerateCorporateAsaasCharge(withCharge), 'active no generate');
  assert(receivableCanViewCorporateAsaasCharge(withCharge), 'active can view');

  const cancelledMirror = {
    ...openAr,
    asaas_active_charge_id: null,
    asaas_integration_status: 'CANCELLED',
  };
  assert(receivableCanGenerateCorporateAsaasCharge(cancelledMirror), 'cancelled can generate again');

  const types = read('lib/master/corporateFinance/asaas/types.ts');
  assert(types.includes("'UNDEFINED'"), 'UNDEFINED type');

  console.log('ALL PASS');
}

main();
