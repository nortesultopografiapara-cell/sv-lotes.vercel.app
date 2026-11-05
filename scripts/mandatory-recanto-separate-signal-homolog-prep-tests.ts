/**
 * Preparação da homologação do sinal separado. Só análise estática e memória local.
 * Não abre conexão com Supabase Develop nem Production.
 * O roteiro de banco descartável fica documentado e não é executado nesta fase.
 * npx tsx scripts/mandatory-recanto-separate-signal-homolog-prep-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertSeparateScheduleChargeAllowed,
  assertSeparateScheduleRecalcSupported,
  assertSeparateScheduleReleaseSupported,
  cashFlowFromSeparateSale,
  distratoScheduleBalances,
} from '../lib/finance/recantoReceiptSchedule';
import { resolveRecantoSignalPlan } from '../lib/recantoSignalRemaining';
import { RECANTO_SEPARATE_SIGNAL_ENABLED, canOfferRecantoSeparateSignal } from '../lib/recantoSeparateSignalForm';
import {
  RECANTO_SEPARATE_SIGNAL_ACTIVATION_STEPS,
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
  RecantoSeparateSignalPersistenceError,
  classifyExistingReceipt,
  classifySeparateSignalSchemaProbe,
  emptySeparateSignalMemory,
  planRecantoSeparateSignalPersistence,
  simulateSeparateSignalPersistence,
  type SeparateSignalPersistenceInput,
  type SeparateSignalPersistencePlan,
} from '../lib/recantoSeparateSignalPersistence';

export const DEVELOP_HOMOLOG_DATABASE_TEST = {
  status: 'PREPARED_NOT_EXECUTED',
  reason: 'A Fase 3B-2A não consulta nem altera banco. A execução fica para a Fase 3B-2B, somente no Supabase Develop.',
} as const;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, fragment: string) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(fragment), message);
    return;
  }
  throw new Error(`deveria falhar: ${fragment}`);
}

function example(overrides: Partial<SeparateSignalPersistenceInput> = {}): SeparateSignalPersistenceInput {
  return {
    featureEnabled: true,
    contractModel: 'RECANTO_PRIMAVERA',
    saleId: 'sale-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    financialAccountId: 'conta-ivanilde',
    lotPrice: 70933.85,
    signalContract: 3500,
    paidAtAct: 1000,
    signalInstallmentCount: 5,
    actDate: '2026-01-10',
    signalFirstDueDate: '2026-02-10',
    lotInstallmentCount: 10,
    lotStartMode: 'AFTER_BROKERAGE',
    ...overrides,
  };
}

function plan(overrides: Partial<SeparateSignalPersistenceInput> = {}) {
  return planRecantoSeparateSignalPersistence(example(overrides));
}

function sum(rows: Array<{ amountCents: number }>) {
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

function main() {
  assert(DEVELOP_HOMOLOG_DATABASE_TEST.status === 'PREPARED_NOT_EXECUTED', 'teste de banco executado');
  assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'schema ligado');
  assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'gravação ligada');
  assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, 'formulário ligado');
  assert(canOfferRecantoSeparateSignal({ contractModel: 'RECANTO_PRIMAVERA' }) === false, 'opção visível');
  assert(RECANTO_SEPARATE_SIGNAL_ACTIVATION_STEPS.length === 7, 'roteiro incompleto');

  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261105143000_recanto_separate_signal_schedule.sql'),
    'utf8',
  );
  for (const column of [
    'signal_schedule_mode',
    'signal_installment_count',
    'signal_first_due_date',
    'lot_schedule_start_mode',
    'lot_schedule_first_due_date',
    'hold_lot_charges_until_signal_settled',
    'separate_signal_request_key',
    'schedule_group',
  ]) {
    assert(sql.includes(column), `coluna ausente: ${column}`);
  }
  assert(sql.includes('ADD COLUMN IF NOT EXISTS'), 'migration não é repetível nas colunas');
  assert(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS finance_receipts_sale_group_installment_uidx'), 'índice do grupo ausente');
  assert(sql.includes('WHERE schedule_group IS NOT NULL'), 'grupo nulo ficaria preso no índice');
  assert(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS sales_separate_signal_request_key_uidx'), 'índice da confirmação ausente');
  assert(sql.includes("conrelid = 'public.sales'::regclass"), 'constraint de sales sem schema');
  assert(sql.includes("conrelid = 'public.finance_receipts'::regclass"), 'constraint de recebíveis sem schema');
  assert(sql.includes('tenant_id IS NOT NULL'), 'SEPARATE sem empresa');
  assert(sql.includes('company_id IS NOT DISTINCT FROM tenant_id'), 'empresa diferente da autenticada');
  assert(sql.includes('separate_signal_request_key IS NOT NULL'), 'SEPARATE sem chave');
  assert(sql.includes('finance_receipts_separate_signal_without_addon_check'), 'sinal com acréscimo embutido');
  assert(sql.includes('Não aplicar'), 'arquivo perdeu o aviso de não aplicar');
  assert(!/DELETE\s+FROM/i.test(sql), 'migration apaga dados');
  assert(!/UPDATE\s+public\.(sales|finance_receipts)/i.test(sql), 'migration reescreve vendas');
  assert(!sql.includes('ON public.finance_receipts (sale_id, installment_number)'), 'índice antigo de parcela');
  assert(!/CREATE\s+POLICY/i.test(sql), 'migration recria RLS');

  const created = plan({
    clientSchedule: [{ scheduleGroup: 'LOT', amountCents: 1 }],
  });
  const untouched = plan();
  assert(JSON.stringify(created.receipts) === JSON.stringify(untouched.receipts), 'navegador definiu valores');
  assert(created.sale.companyId === created.sale.tenantId, 'empresa da venda divergente');
  assert(created.receipts.every((row) => row.tenantId === created.sale.tenantId), 'recebível em outra empresa');
  assert(created.receipts.every((row) => row.financialAccountId === 'conta-ivanilde'), 'conta financeira trocada');
  assert(created.charges.length === 0 && created.brokerCommissions.length === 0, 'repasse ou cobrança gerados');
  const signal = created.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
  const lot = created.receipts.filter((row) => row.scheduleGroup === 'LOT');
  assert(signal.some((row) => row.installmentNumber === 1) && lot.some((row) => row.installmentNumber === 1), 'parcela 1 repetida entre grupos');
  assert(sum(lot) === 7093385, 'lote absorveu o sinal');
  assert(sum(signal) + sum(lot) === 7093385 + 350000, 'total financeiro incorreto');
  assert(lot.every((row) => row.signalAddonAmountCents === 0), 'acréscimo antigo no lote');

  assertThrows(() => plan({ companyId: 'outra-empresa' }), 'não pode ser escolhida');

  const state = emptySeparateSignalMemory();
  const options = { schemaApplied: true, persistEnabled: true } as const;
  const first = simulateSeparateSignalPersistence(state, created, options);
  const replay = simulateSeparateSignalPersistence(state, created, options);
  assert(first.created === true && replay.created === false, 'confirmação repetida gravou de novo');
  assert(state.sales.size === 1 && state.receipts.size === 1, 'duplicidade financeira');

  const tampered: SeparateSignalPersistencePlan = {
    ...created,
    receipts: created.receipts.map((row, index) => index === 0 ? { ...row, amountCents: row.amountCents + 1 } : row),
  };
  assertThrows(
    () => simulateSeparateSignalPersistence(state, tampered, options),
    'outros valores',
  );

  const otherCompany = plan({ tenantId: 'tenant-2', saleId: 'sale-2' });
  simulateSeparateSignalPersistence(state, otherCompany, options);
  assert(state.sales.size === 2, 'empresas isoladas não puderam gravar');

  const beforeFailure = emptySeparateSignalMemory();
  assertThrows(
    () => simulateSeparateSignalPersistence(beforeFailure, created, { ...options, failAt: 'receipts' }),
    'Nenhuma venda foi mantida',
  );
  assert(beforeFailure.sales.size === 0 && beforeFailure.receipts.size === 0, 'rollback incompleto');

  assert(classifyExistingReceipt({}) === 'LEGACY', 'venda antiga reclassificada');
  const legacy = resolveRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'ALL_INSTALLMENTS',
    remainingInstallments: 10,
    totalInstallments: 10,
  });
  assert(legacy.remainingValue === 2500, 'saldo antigo do sinal mudou');

  assertThrows(() => assertSeparateScheduleChargeAllowed({ scheduleGroup: 'SIGNAL' }), 'bloquead');
  assertThrows(() => assertSeparateScheduleChargeAllowed({ scheduleGroup: 'LOT' }), 'bloquead');
  assertThrows(() => assertSeparateScheduleRecalcSupported([{ scheduleGroup: 'SIGNAL' }]), 'não está disponível');
  assertThrows(() => assertSeparateScheduleReleaseSupported([{ scheduleGroup: 'LOT' }]), 'bloquead');
  assert(distratoScheduleBalances([{ scheduleGroup: 'SIGNAL', amountCents: 50000, status: 'pendente' }]).blocked, 'distrato liberado');

  const flow = cashFlowFromSeparateSale({
    receipts: [{ scheduleGroup: 'SIGNAL', amountCents: 100000, paidAmountCents: 100000, status: 'pago' }],
    manualOutflowsCents: [100000],
    paidCommissionCents: [100000],
  });
  assert(flow.entriesCents === 100000 && flow.exitsCents === 100000 && flow.commissionEntries === 0, 'receita duplicada');

  assert(classifySeparateSignalSchemaProbe({
    error: { code: '42703', message: 'column "schedule_group" does not exist' },
  }).status === 'NOT_MIGRATED', 'schema antigo tratado como falha');
  assert(classifySeparateSignalSchemaProbe({ columnSeen: true }).status === 'UNEXPECTED', 'coluna isolada virou schema compatível');
  const unexpected = classifySeparateSignalSchemaProbe({
    error: {
      code: '28000',
      message: 'jwt eyJabcdefghijklmnop rejected for maria@example.com id 11111111-2222-4333-8444-555555555555',
    },
  });
  assert(unexpected.status === 'UNEXPECTED', 'erro inesperado virou schema antigo');
  if (unexpected.status === 'UNEXPECTED') {
    assert(!unexpected.safeMessage.includes('maria@'), 'e-mail exposto');
    assert(!unexpected.safeMessage.includes('eyJ'), 'token exposto');
    assert(!unexpected.safeMessage.includes('11111111'), 'identificador exposto');
  }

  const service = readFileSync(resolve(process.cwd(), 'lib/gisSaleCreateService.ts'), 'utf8');
  const createStart = service.indexOf('export async function executeGisSaleCreate');
  const createBody = service.slice(createStart);
  const rejectAt = createBody.indexOf('rejectUnpersistedSeparateSignalRequest(customerData)');
  const queryAt = createBody.indexOf(".from('blocks')");
  assert(rejectAt > 0 && queryAt > rejectAt, 'gravação real consulta o banco antes de recusar o sinal');

  console.log('Homologação local do sinal separado: ok. Teste de banco não executado.');
}

main();
