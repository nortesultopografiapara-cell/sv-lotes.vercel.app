/**
 * Regressão: gerar cobrança NUNCA liquida AR / caixa.
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-create-no-settle-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  buildCorporateAsaasExternalReference,
  parseCorporateAsaasExternalReference,
  MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX,
} from '../lib/master/corporateFinance/asaas/domain';
import { hasCorporateAsaasPaymentEvidence } from '../lib/master/corporateFinance/asaas/client';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  console.log('=== Asaas create must not settle AR ===');
  const svc = read('lib/master/corporateFinance/asaas/chargesService.ts');
  const createStart = svc.indexOf('export async function createCorporateAsaasCharge');
  const syncStart = svc.indexOf('export async function syncCorporateAsaasCharge');
  assert(createStart >= 0 && syncStart > createStart, 'create/sync bounds');
  const createBody = svc.slice(createStart, syncStart);
  assert(!createBody.includes('receiveReceivable'), 'create sem receiveReceivable');
  assert(!createBody.includes('createMovementFromReceivablePayment'), 'create sem caixa');
  assert(!createBody.includes('settleCorporateAsaasChargeFromRemote'), 'create sem settle');
  assert(createBody.includes("local_status: 'AWAITING_PAYMENT'"), 'força AWAITING');
  assert(createBody.includes('ASAAS_CORP_AR:') || createBody.includes('buildCorporateAsaasExternalReference'), 'prefixo');
  assert(createBody.includes('receivable_payment_id: null'), 'sem payment id');
  assert(createBody.includes('settled: false'), 'audit settled false');

  assert(MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX === 'ASAAS_CORP_AR:', 'prefix const');
  const ref = buildCorporateAsaasExternalReference('rid-1', 'cid-1');
  assert(ref === 'ASAAS_CORP_AR:rid-1:cid-1', `ref=${ref}`);
  assert(parseCorporateAsaasExternalReference(ref)?.receivableId === 'rid-1', 'parse new');
  assert(parseCorporateAsaasExternalReference('MCF:rid-2')?.receivableId === 'rid-2', 'parse legacy');
  assert(parseCorporateAsaasExternalReference('SAAS:x') === null, 'reject saas');

  assert(
    !hasCorporateAsaasPaymentEvidence({ status: 'RECEIVED' }),
    'RECEIVED sem data não liquida',
  );
  assert(
    hasCorporateAsaasPaymentEvidence({ status: 'RECEIVED', paymentDate: '2026-07-23' }),
    'RECEIVED com data liquida',
  );
  assert(
    !hasCorporateAsaasPaymentEvidence({ status: 'PENDING', paymentDate: '2026-07-23' }),
    'PENDING não liquida',
  );

  const ui = read('components/master/corporateFinance/CorporateAsaasChargeSection.tsx');
  assert(ui.includes('onChargeChanged'), 'callback rename');
  assert(!ui.includes('onSettled'), 'sem onSettled');
  assert(ui.includes("'/api/master/corporate-finance/asaas/charges'"), 'create endpoint');
  assert(!ui.includes('/receive'), 'UI asaas não chama receive');

  const reopen = read('app/api/master/corporate-finance/receivables/reopen-code/route.ts');
  assert(reopen.includes('reverseReceivablePayment'), 'reopen estorna');

  console.log('ALL PASS');
}

main();
