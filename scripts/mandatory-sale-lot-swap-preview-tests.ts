/**
 * Fase 2 — preview/simulação da Troca de lote (sem mutação).
 * npx tsx scripts/mandatory-sale-lot-swap-preview-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  showsTerminationSettlement,
} from '../lib/finance/releaseLotShared';
import { isSaleReleaseSettlementOperation } from '../lib/finance/saleReleaseSettlement';
import { isSaleLotSwapOperation } from '../lib/finance/saleLotSwap';
import {
  assertOriginBelongsToSale,
  assertSaleEligibleForLotSwapPreview,
  deriveLotSwapPreviewFinancials,
  evaluateLotSwapDestination,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
  LOT_SWAP_CROSS_PROJECT,
  LOT_SWAP_DESTINATION_HAS_CONTRACT,
  LOT_SWAP_DESTINATION_HAS_SALE,
  LOT_SWAP_DESTINATION_NOT_AVAILABLE,
  LOT_SWAP_DESTINATION_RESERVED,
  LOT_SWAP_ORIGIN_MISMATCH,
  LOT_SWAP_SALE_CANCELLED,
  LOT_SWAP_SAME_BLOCK,
  LOT_SWAP_SCHEDULE_PREVIEW_NOTICE,
  lotSwapPreviewBlockMessage,
  simulateLotSwapSchedule,
  sumLotSwapPaidAmount,
  type LotSwapBlockSnapshot,
} from '../lib/finance/saleLotSwapPreview';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function block(
  extra: Partial<LotSwapBlockSnapshot> & Pick<LotSwapBlockSnapshot, 'id'>,
): LotSwapBlockSnapshot {
  return {
    projectId: 'proj-a',
    status: 'Disponível',
    saleId: null,
    contractId: null,
    quadra: '01',
    lote: extra.lote || '02',
    area: 200,
    price: 120,
    ...extra,
  };
}

const origin: LotSwapBlockSnapshot = {
  id: 'lot-origin',
  projectId: 'proj-a',
  status: 'Vendido',
  saleId: 'sale-1',
  contractId: 'ct-1',
  quadra: '01',
  lote: '01',
  area: 180,
  price: 100,
};

function testDestinationFilters() {
  assert(evaluateLotSwapDestination(block({ id: 'lot-av' }), origin).ok, 'Disponível aparece');
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-sold', status: 'Vendido' }), origin).code ===
      LOT_SWAP_DESTINATION_NOT_AVAILABLE,
    'Vendido não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-res', status: 'Reservado' }), origin).code ===
      LOT_SWAP_DESTINATION_RESERVED,
    'Reservado não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-other', projectId: 'proj-b' }), origin).code ===
      LOT_SWAP_CROSS_PROJECT,
    'outro empreendimento não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: origin.id }), origin).code === LOT_SWAP_SAME_BLOCK,
    'origem não aparece como destino',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-sale', saleId: 'sale-x' }), origin).code ===
      LOT_SWAP_DESTINATION_HAS_SALE,
    'destino com sale_id recusado',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-ct', contractId: 'ct-x' }), origin).code ===
      LOT_SWAP_DESTINATION_HAS_CONTRACT,
    'destino com contract_id recusado',
  );
  console.log('OK testDestinationFilters');
}

function testCancelledSaleBlocks() {
  assert(
    assertSaleEligibleForLotSwapPreview({ saleStatus: 'CANCELLED' }).code ===
      LOT_SWAP_SALE_CANCELLED,
    'venda CANCELLED bloqueia',
  );
  assert(
    assertSaleEligibleForLotSwapPreview({ saleStatus: 'ACTIVE' }).ok,
    'venda ACTIVE segue',
  );
  assert(
    assertOriginBelongsToSale({
      saleId: 'sale-1',
      saleBlockId: 'lot-other',
      origin,
    }).code === LOT_SWAP_ORIGIN_MISMATCH,
    'origem de outra venda bloqueia',
  );
  console.log('OK testCancelledSaleBlocks');
}

function testFinancialScenarios() {
  const a = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 120,
    appropriatedToAcquisitionPrice: 20,
  });
  assert(a.fields.total_paid === 20, 'A total_paid');
  assert(a.fields.transferable_credit === 20, 'A crédito V1 separado');
  assert(a.fields.new_balance === 100, 'A 100→120 com 20 pagos = saldo 100');
  assert(!a.blocked, 'A não bloqueia');

  const b = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 90,
    appropriatedToAcquisitionPrice: 20,
  });
  assert(b.fields.new_balance === 70, 'B 100→90 com 20 pagos = saldo 70');
  assert(!b.blocked, 'B não bloqueia');

  const c = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 80,
    appropriatedToAcquisitionPrice: 95,
  });
  assert(c.blocked, 'C crédito > novo lote bloqueia');
  assert(c.blockCode === LOT_SWAP_CREDIT_EXCEEDS_PRICE, 'C código');
  assert(
    lotSwapPreviewBlockMessage(c.blockCode) === LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
    'C mensagem homologada',
  );
  assert(c.fields.total_paid !== undefined && c.fields.transferable_credit !== undefined, 'campos separados');
  console.log('OK testFinancialScenarios');
}

function testScheduleSimulationDoesNotCreateReceipts() {
  const paid = sumLotSwapPaidAmount([
    { installment_number: 0, status: 'pago', amount: 20 },
    { installment_number: 1, status: 'pendente', amount: 10, due_date: '2026-10-10' },
    { installment_number: 2, status: 'pendente', amount: 10, due_date: '2026-11-10' },
  ]);
  assert(paid.totalPaid === 20 && paid.paidCount === 1, 'pago preservado na soma');
  const schedule = simulateLotSwapSchedule({
    newBalance: 100,
    futureReceipts: [
      { installment_number: 1, status: 'pendente', amount: 10, due_date: '2026-10-10' },
      { installment_number: 2, status: 'pendente', amount: 10, due_date: '2026-11-10' },
    ],
    balloons: [{ installment_number: 12, additional_amount: 500, due_date: '2027-09-10' }],
    correctionLabel: 'IPCA',
  });
  assert(schedule.futureInstallmentCount === 2, 'parcelas futuras atuais');
  assert(schedule.estimatedAverageAmount === 50, 'média 100/2');
  assert(schedule.firstFutureDueDate === '2026-10-10', 'primeira data futura');
  assert(schedule.balloons.length === 1, 'balão existente');
  assert(schedule.notice === LOT_SWAP_SCHEDULE_PREVIEW_NOTICE, 'aviso da próxima fase');
  console.log('OK testScheduleSimulationDoesNotCreateReceipts');
}

function testNoMutationAndNoSettlement() {
  const preview = read('lib/finance/saleLotSwapPreview.ts');
  const svc = read('lib/finance/saleLotSwapPreviewService.ts');
  const route = read('app/api/sales/[saleId]/lot-swap/route.ts');
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  for (const [name, src] of [
    ['preview', preview],
    ['svc', svc],
    ['route', route],
    ['ui', ui],
  ] as const) {
    assert(!src.includes('retention_percent'), `${name} sem retenção`);
    assert(!src.includes('calculateTerminationSettlement'), `${name} sem settlement`);
    assert(!src.includes('saleReleaseSettlement'), `${name} sem settlement persistido`);
    assert(!src.includes('releaseLotService'), `${name} sem ReleaseLot`);
  }
  assert(!/\.insert\(/.test(svc), 'serviço sem INSERT');
  assert(!/\.update\(/.test(svc), 'serviço sem UPDATE');
  assert(!/\.delete\(/.test(svc), 'serviço sem DELETE');
  assert(!svc.includes(".from('sale_lot_swaps')"), 'serviço não lê/grava sale_lot_swaps');
  assert(svc.includes('FOR UPDATE'), 'lock da Fase 4 documentado');
  assert(route.includes('mutation: false'), 'API declara sem mutação');
  assert(route.includes('export async function GET'), 'GET preview');
  assert(route.includes('export async function POST'), 'POST preview sem execute');
  assert(!route.includes('executeLotSwap'), 'sem executor');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const handleSubmit = modal.slice(
    modal.indexOf('const handleSubmit'),
    modal.indexOf('if (!mounted)'),
  );
  assert(handleSubmit.includes('isLotReleaseSaleOperation(motiveCode)'), 'submit não executa troca');
  assert(!handleSubmit.includes('/lot-swap'), 'submit não posta execução de troca');
  assert(isSaleLotSwapOperation('troca_lote'), 'código da operação');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'não é release');
  assert(!showsTerminationSettlement('troca_lote'), 'sem acerto de rescisão');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'sem settlement');
  assert(!isDeferredSaleOperation('troca_lote'), 'não fica só diferida');
  console.log('OK testNoMutationAndNoSettlement');
}

function testProtectedFlowsIntact() {
  assert(isLotReleaseSaleOperation('desistencia'), 'Desistência intacta');
  assert(isLotReleaseSaleOperation('distrato'), 'Distrato intacto');
  assert(isLotReleaseSaleOperation('inadimplencia'), 'Inadimplência intacta');
  assert(showsTerminationSettlement('desistencia'), 'settlement Desistência');
  assert(showsTerminationSettlement('distrato'), 'settlement Distrato');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement Inadimplência');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('resolveMundoNovoPromitenteVendors'), 'Mundo Novo intacto');
  assert(mundo.includes('seller_parties_json') || read('lib/project-form.ts').includes('seller_parties_json'), 'seller_parties_json permanece no projeto');
  assert(!mundo.includes('saleLotSwapPreview'), 'Mundo Novo sem preview de troca');
  const release = read('lib/finance/releaseLotService.ts');
  assert(!release.includes('saleLotSwapPreview'), 'ReleaseLot não chama a troca');
  assert(!release.includes(".from('sale_lot_swaps')"), 'ReleaseLot não grava swap');
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  console.log('OK testProtectedFlowsIntact');
}

testDestinationFilters();
testCancelledSaleBlocks();
testFinancialScenarios();
testScheduleSimulationDoesNotCreateReceipts();
testNoMutationAndNoSettlement();
testProtectedFlowsIntact();
console.log('OK mandatory-sale-lot-swap-preview-tests');
