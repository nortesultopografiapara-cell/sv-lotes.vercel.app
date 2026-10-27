/**
 * Segurança do POST Liberar lote — etapas bancárias, lock, acerto e retomada.
 * npx tsx scripts/mandatory-release-lot-bank-cancel-safety-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BANK_CANCEL_IN_PROGRESS_CODE,
  MIN_BANK_CANCEL_CALL_MS,
  RELEASE_BANK_CANCEL_BUDGET_MS,
  isAsaasAlreadyGoneMessage,
  isAsaasNetworkOrTimeoutMessage,
  isAsaasPaidForbiddenMessage,
  remainingBankCancelBudgetMs,
  shouldYieldBankCancel,
} from '../lib/finance/releaseLotBankCancelBudget';
import {
  RELEASE_IN_PROGRESS_CODE,
  buildReleaseExecLock,
  isReleaseExecLockHeld,
  readReleaseExecLock,
  withReleaseExecLock,
  withoutReleaseExecLock,
} from '../lib/finance/releaseLotExecutionLock';
import { assertReusableCalculatedSettlement } from '../lib/finance/saleReleaseSettlement';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testBudgetYieldsBeforeVercelTimeout() {
  assert(RELEASE_BANK_CANCEL_BUDGET_MS === 40_000, 'orçamento 40s');
  assert(MIN_BANK_CANCEL_CALL_MS === 3_000, 'reserva 3s por chamada');
  assert(shouldYieldBankCancel(0, 37_001) === true, 'yield com menos de 3s');
  assert(shouldYieldBankCancel(0, 10_000) === false, 'não yield com 30s');
  assert(remainingBankCancelBudgetMs(0, 40_000) === 0, 'esgotado em 40s');
  assert(remainingBankCancelBudgetMs(0, 40_000) < 20_000, 'abaixo do timeout 60s');
}

function testNeverPresumeCancelOnTimeout() {
  assert(isAsaasNetworkOrTimeoutMessage('fetch failed') === true, 'fetch failed é rede');
  assert(isAsaasNetworkOrTimeoutMessage('Task timed out after 60 seconds') === true, 'timeout');
  assert(isAsaasNetworkOrTimeoutMessage('ECONNRESET') === true, 'reset');
  assert(isAsaasNetworkOrTimeoutMessage('Cobrança não pode ser removida') === false, 'recusa não é rede');
  assert(isAsaasAlreadyGoneMessage('404 not found') === true, 'inexistente');
  assert(isAsaasAlreadyGoneMessage('already deleted') === true, 'já removida');
  assert(isAsaasPaidForbiddenMessage('Cobrança já paga — cancelamento não permitido.') === true, 'paga');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('isAsaasNetworkOrTimeoutMessage'), 'rede vira remaining, não cancelled');
  assert(svc.includes('yield_network_or_limit'), 'não presume cancel após timeout');
  assert(svc.includes('already_gone'), '404 conciliado como já encerrada');
  assert(svc.includes('preserve_paid_delete_rejected'), 'paga não é cancelada');
}

function testSaleAndCompanyGuardBeforeDelete() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes("'id, status, asaas_payment_id, company_id, sale_id'"), 'SELECT Asaas com empresa e venda');
  assert(svc.includes('não pertence à empresa do lote'), 'bloqueia empresa divergente');
  assert(svc.includes('não pertence à venda do lote'), 'bloqueia venda divergente');
  assert(svc.includes('saleId: preview.saleId'), 'passa saleId ao cancel');
  const inter = read('lib/banking/inter/interChargeCancelForRelease.ts');
  assert(inter.includes('company_id, sale_id'), 'Inter lê empresa e venda');
  assert(inter.includes('não pertence à venda do lote'), 'Inter bloqueia venda divergente');
}

function testConcurrencyLock() {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  const lock = buildReleaseExecLock({
    token: 'tok-a',
    ownerUserId: 'user-1',
    nowMs: now,
  });
  const snap = withReleaseExecLock({ totalPaid: 100 }, lock);
  assert(isReleaseExecLockHeld(readReleaseExecLock(snap), now + 1_000) === true, 'lock ativo bloqueia outro');
  assert(isReleaseExecLockHeld(readReleaseExecLock(snap), now + 1_000, 'tok-a') === false, 'mesmo token não bloqueia');
  assert(isReleaseExecLockHeld(readReleaseExecLock(snap), now + 80_000) === false, 'TTL libera lock órfão');
  const released = withoutReleaseExecLock(snap);
  assert(readReleaseExecLock(released) === null, 'release remove lock');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('RELEASE_IN_PROGRESS'), '409 concorrente distinto do yield bancário');
  assert(svc.includes('releaseLotExecutionLock'), 'finally libera a trava');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('BANK_CANCEL_IN_PROGRESS_CODE'), 'UI retoma só yield bancário');
  assert(!modal.includes('RELEASE_IN_PROGRESS_CODE'), 'UI não retoma concorrência automaticamente');
}

function testSettlementReuseFreshValues() {
  const prepared = {
    operationType: 'desistencia' as const,
    settlement: { totalPaid: 1500 },
  };
  const ok = assertReusableCalculatedSettlement({
    existing: {
      id: 's1',
      sale_id: 'sale-1',
      status: 'CALCULATED',
      calculation_status: 'CALCULATED',
      operation_type: 'desistencia',
      total_paid: 1000,
    },
    prepared: prepared as any,
  });
  assert(ok.ok === true && ok.staleAmounts === true, 'acerto desatualizado é recalculado, não reaplicado cego');
  const mismatch = assertReusableCalculatedSettlement({
    existing: {
      id: 's1',
      sale_id: 'sale-1',
      status: 'CALCULATED',
      calculation_status: 'CALCULATED',
      operation_type: 'distrato',
    },
    prepared: prepared as any,
  });
  assert(mismatch.ok === false, 'não reutiliza acerto de outra operação');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('assertReusableCalculatedSettlement'), 'POST valida acerto antes do upsert');
  assert(svc.includes('settlement_stale_recalculated'), 'loga recálculo de valores');
}

function testNoLocalReleaseWithOpenBankCharges() {
  const svc = read('lib/finance/releaseLotService.ts');
  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  const leftoverIdx = execFn.indexOf('leftoverAsaas');
  const localIdx = execFn.indexOf('applyLocalRelease');
  assert(leftoverIdx > 0, 'recarrega cobranças antes do local');
  assert(leftoverIdx < localIdx, 'não aplica local com boleto ainda aberto');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'preserva parcela paga');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'cancela só não pagas');
  assert(svc.includes('isPaidBrokerCommission'), 'não cancela comissão paga');
}

function testPartialResumeIdempotency() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('isAlreadyCancelledAsaasChargeStatus(localBefore)'), 'não recancela Asaas CANCELLED');
  assert(svc.includes('missing_local'), 'inexistente local é explícito');
  assert(svc.includes(BANK_CANCEL_IN_PROGRESS_CODE), 'retomada só com código explícito');
  assert(svc.includes(RELEASE_IN_PROGRESS_CODE), 'concorrência tem código próprio');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(
    modal.includes('if (json.code === BANK_CANCEL_IN_PROGRESS_CODE)'),
    'retry automático só com BANK_CANCEL_IN_PROGRESS',
  );
}

function main() {
  testBudgetYieldsBeforeVercelTimeout();
  testNeverPresumeCancelOnTimeout();
  testSaleAndCompanyGuardBeforeDelete();
  testConcurrencyLock();
  testSettlementReuseFreshValues();
  testNoLocalReleaseWithOpenBankCharges();
  testPartialResumeIdempotency();
  console.log('\nALL mandatory-release-lot-bank-cancel-safety-tests PASSED');
}

main();
