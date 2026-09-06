/**
 * Fase 4 — execução atômica da Troca de lote.
 * npx tsx scripts/mandatory-sale-lot-swap-execute-tests.ts
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
import { buildLotSwapFinancialPlan } from '../lib/finance/saleLotSwapPlan';
import { LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES } from '../lib/finance/saleLotSwapPlanService';
import {
  assertContractNumberNotReused,
  buildLotSwapExecuteReceiptMutations,
  buildSyntheticContractReceipts,
  isLotSwapExecuteOperation,
  LOT_SWAP_EXECUTE_RPC,
  lotSwapExecutePreservesNegotiation,
  nextLotSwapExecuteStatus,
  parseLotSwapExecuteRpcError,
} from '../lib/finance/saleLotSwapExecute';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testStateMachineAndIdempotency() {
  assert(nextLotSwapExecuteStatus('CALCULATED', 'start') === 'EXECUTING', 'start');
  assert(nextLotSwapExecuteStatus('EXECUTING', 'succeed') === 'EXECUTED', 'succeed');
  assert(nextLotSwapExecuteStatus('EXECUTED', 'succeed') === 'EXECUTED', 'idempotente');
  assert(nextLotSwapExecuteStatus('CALCULATED', 'fail') === 'FAILED', 'fail calculated');
  assert(nextLotSwapExecuteStatus('EXECUTING', 'fail') === 'FAILED', 'fail executing');
  console.log('OK testStateMachineAndIdempotency');
}

function testReceiptMutationsPreservePaidAndReplaceFuture() {
  const plan = buildLotSwapFinancialPlan({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    receipts: [
      {
        id: 'r-paid',
        installment_number: 0,
        status: 'pago',
        amount: 20000,
        paid_amount: 20000,
        due_date: '2026-01-10',
      },
      {
        id: 'r-future',
        installment_number: 1,
        status: 'pendente',
        amount: 5000,
        due_date: '2026-10-10',
      },
    ],
    financialAccountId: 'acc-1',
    asOf: '2026-09-06',
  });
  const mut = buildLotSwapExecuteReceiptMutations(plan);
  assert(mut.preserveIds.join() === 'r-paid', 'preserva pago');
  assert(mut.cancelIds.join() === 'r-future', 'cancela futura');
  assert(mut.create.length === 1, 'cria nova');
  assert(mut.create[0].amount === 100000, 'novo saldo');
  assert(mut.create[0].financial_account_id === 'acc-1', 'conta financeira');
  const synthetic = buildSyntheticContractReceipts(plan);
  assert(synthetic[0].status === 'pago', 'HTML vê pago histórico');
  assert(synthetic[1].status === 'pendente', 'HTML vê nova pendente');
  console.log('OK testReceiptMutationsPreservePaidAndReplaceFuture');
}

function testContractNumberNotReused() {
  assertContractNumberNotReused('000000001/2026', '000000002/2026');
  let reused = false;
  try {
    assertContractNumberNotReused('000000009/2026', '000000009/2026');
  } catch (err) {
    reused = err instanceof Error && err.message === 'CONTRACT_NUMBER_REUSED';
  }
  assert(reused, 'recusa reuso do número');
  let invalid = false;
  try {
    assertContractNumberNotReused('000000001/2026', 'CTR-9');
  } catch (err) {
    invalid = err instanceof Error && err.message === 'CONTRACT_NUMBER_INVALID';
  }
  assert(invalid, 'recusa número fora do formato oficial');
  console.log('OK testContractNumberNotReused');
}

function testRpcErrorParserAndSaleIdentity() {
  const parsed = parseLotSwapExecuteRpcError(
    'LOT_SWAP_EXECUTE:DESTINATION_NOT_AVAILABLE:O lote destino precisa estar Disponível, sem venda e sem contrato.',
  );
  assert(parsed.code === 'DESTINATION_NOT_AVAILABLE', 'código RPC');
  assert(
    lotSwapExecutePreservesNegotiation({
      saleIdBefore: 'sale-1',
      saleIdAfter: 'sale-1',
      sourceStatus: 'Disponível',
      destinationStatus: 'Vendido',
    }),
    'mesma sale_id e status dos lotes',
  );
  assert(
    !lotSwapExecutePreservesNegotiation({
      saleIdBefore: 'sale-1',
      saleIdAfter: 'sale-2',
      sourceStatus: 'Disponível',
      destinationStatus: 'Vendido',
    }),
    'não troca a identidade da venda',
  );
  assert(isLotSwapExecuteOperation('troca_lote'), 'código da operação');
  console.log('OK testRpcErrorParserAndSaleIdentity');
}

function testSqlAtomicRpc() {
  const sql = read('supabase/migrations/20261014120000_execute_sale_lot_swap.sql');
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap'), 'função');
  assert(sql.includes('SECURITY DEFINER'), 'SECURITY DEFINER');
  assert(sql.includes('FOR UPDATE'), 'locks');
  assert(sql.includes("status = 'EXECUTING'"), 'CALCULATED → EXECUTING');
  assert(sql.includes("status = 'EXECUTED'"), 'EXECUTING → EXECUTED');
  assert(sql.includes("status = 'Disponível'"), 'origem Disponível');
  assert(sql.includes("status = 'Vendido'"), 'destino Vendido');
  assert(sql.includes("status = 'superseded'"), 'contrato anterior superseded');
  assert(sql.includes('sale_id_unchanged'), 'preserva sale_id');
  assert(sql.includes("status = 'cancelado'"), 'cancela futuras');
  assert(!/\bDELETE FROM\s+public\.finance_receipts/i.test(sql), 'não apaga parcelas');
  assert(!/\bDELETE FROM\s+public\.contracts/i.test(sql), 'não apaga contratos');
  assert(!sql.includes('company_asaas_charges'), 'sem Asaas');
  assert(!sql.includes('bank_charges'), 'sem Inter');
  assert(!/from\s+public\.sale_release_settlements/i.test(sql), 'sem settlement');
  assert(!sql.includes('retention_percent'), 'sem retenção');
  assert(!sql.includes('seller_parties_json'), 'não toca vendedores Mundo Novo');
  assert(sql.includes('CONTRACT_NUMBER_REUSED'), 'bloqueia reuso de número');
  assert(sql.includes('OLD_CONTRACT_HTML_CHANGED'), 'protege HTML antigo');
  assert(sql.includes('charges_untouched'), 'cobranças intocadas');
  const apply = read('scripts/develop/apply-execute-sale-lot-swap.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('ABORT: DATABASE_URL aponta para Production'), 'recusa Production');
  assert(apply.includes('executesLotSwap: false'), 'apply não executa troca');
  console.log('OK testSqlAtomicRpc');
}

function testExecuteServiceContractCompatibility() {
  const svc = read('lib/finance/saleLotSwapExecuteService.ts');
  assert(svc.includes('getNextContractNumber'), 'numeração oficial');
  assert(svc.includes('generateContractHTML'), 'geradores oficiais');
  assert(svc.includes('resolveSaleContractModelFromContext'), 'PADRAO/ARAGUAIA/RECANTO/MUNDO_NOVO');
  assert(svc.includes('loadFreshRegenerationEntities'), 'dados vigentes da venda');
  assert(svc.includes("balloonAddons: []"), 'não regrava balões');
  assert(!svc.includes('regenerateSaleContract('), 'não reusa regeneração que mantém número');
  assert(!svc.includes('seller_parties_json'), 'não lê/grava seller_parties_json aqui');
  assert(!svc.includes('mundoNovoContractSellers'), 'não altera Mundo Novo sellers');
  assert(!svc.includes('releaseLotService'), 'sem ReleaseLot');
  assert(!svc.includes('company_asaas_charges'), 'sem Asaas');
  assert(!svc.includes('bank_charges'), 'sem Inter');
  assert(svc.includes(`rpc(LOT_SWAP_EXECUTE_RPC`) || svc.includes(`rpc('${LOT_SWAP_EXECUTE_RPC}'`), 'chama RPC');
  assert(svc.includes("status === 'EXECUTED'"), 'idempotência EXECUTED');
  const route = read('app/api/sales/[saleId]/lot-swap/execute/route.ts');
  assert(route.includes('executeSaleLotSwap'), 'rota de execução');
  assert(route.includes('persistCharges: false'), 'Fase 5 não entra');
  console.log('OK testExecuteServiceContractCompatibility');
}

function testUiExecuteAfterCalculated() {
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(ui.includes('Confirmar plano (sem executar)'), 'ainda confirma plano');
  assert(ui.includes('/lot-swap/execute'), 'POST execute separado');
  assert(ui.includes('Executar troca de lote'), 'botão de execução');
  assert(!ui.includes('/release'), 'não chama ReleaseLot');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const handleSubmit = modal.slice(
    modal.indexOf('const handleSubmit'),
    modal.indexOf('if (!mounted)'),
  );
  assert(!handleSubmit.includes('/lot-swap/execute'), 'submit do modal não executa troca');
  assert(!handleSubmit.includes('/lot-swap'), 'submit do modal não posta troca');
  console.log('OK testUiExecuteAfterCalculated');
}

function testRegressionReleaseAndDocuments() {
  assert(isLotReleaseSaleOperation('desistencia'), 'Desistência intacta');
  assert(isLotReleaseSaleOperation('distrato'), 'Distrato intacto');
  assert(isLotReleaseSaleOperation('inadimplencia'), 'Inadimplência intacta');
  assert(showsTerminationSettlement('desistencia'), 'settlement Desistência');
  assert(showsTerminationSettlement('distrato'), 'settlement Distrato');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement Inadimplência');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'troca não é release');
  assert(!showsTerminationSettlement('troca_lote'), 'troca sem settlement');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'sem persistência de rescisão');
  assert(!isDeferredSaleOperation('troca_lote'), 'fluxo próprio');
  assert(isSaleLotSwapOperation('troca_lote'), 'código troca');
  const release = read('lib/finance/releaseLotService.ts');
  assert(!release.includes('executeSaleLotSwap'), 'ReleaseLot não executa troca');
  assert(!release.includes('execute_sale_lot_swap'), 'ReleaseLot não chama RPC de troca');
  const desist = read('lib/termination-documents/persist.ts');
  assert(!desist.includes('execute_sale_lot_swap'), 'termo TD/DT/IN não usa RPC de troca');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('resolveMundoNovoPromitenteVendors'), 'Mundo Novo intacto');
  assert(
    mundo.includes('seller_parties_json') ||
      read('lib/project-form.ts').includes('seller_parties_json'),
    'seller_parties_json permanece no projeto',
  );
  const planSvc = read('lib/finance/saleLotSwapPlanService.ts');
  assert(!/\.from\('sales'\)[\s\S]{0,80}\.update\(/.test(planSvc), 'plano ainda não muta sales');
  for (const table of LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES) {
    assert(
      planSvc.includes(`'${table}'`) || table === 'sale_balloon_installments',
      `plano documenta ${table}`,
    );
  }
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  console.log('OK testRegressionReleaseAndDocuments');
}

testStateMachineAndIdempotency();
testReceiptMutationsPreservePaidAndReplaceFuture();
testContractNumberNotReused();
testRpcErrorParserAndSaleIdentity();
testSqlAtomicRpc();
testExecuteServiceContractCompatibility();
testUiExecuteAfterCalculated();
testRegressionReleaseAndDocuments();
console.log('OK mandatory-sale-lot-swap-execute-tests');
