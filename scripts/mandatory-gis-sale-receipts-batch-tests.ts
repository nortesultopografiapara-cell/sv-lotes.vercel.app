/**
 * Etapa 10.1 — persistência em lote de finance_receipts na criação GIS.
 * npx tsx scripts/mandatory-gis-sale-receipts-batch-tests.ts
 */

import fs from 'node:fs';
import {
  estimateFinanceReceiptsPayloadBytes,
  insertRowsWithColumnFallback,
} from '../lib/gisSaleCreateService';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import { validateInstallmentsCount } from '../lib/installmentsCount';
import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

type MockCall = {
  table: string;
  rows: Record<string, unknown>[];
};

function createMockSupabase(options?: {
  /** Falha na N-ésima operação insert (1-based). */
  failOnOperation?: number;
  failMessage?: string;
  /** Simula coluna ausente na 1ª tentativa de cada chunk. */
  missingColumnOnce?: string;
}) {
  const calls: MockCall[] = [];
  let op = 0;
  const missingSeen = new Set<string>();

  const supabase = {
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>[]) {
          return {
            select(_sel?: string) {
              return (async () => {
                op += 1;
                calls.push({ table, rows: rows.map((r) => ({ ...r })) });

                const missing = options?.missingColumnOnce;
                if (
                  missing &&
                  !missingSeen.has(`${op}:${missing}`) &&
                  rows.some((r) => missing in r)
                ) {
                  missingSeen.add(`${op}:${missing}`);
                  return {
                    data: null,
                    error: {
                      message: `Could not find the '${missing}' column of '${table}' in the schema cache`,
                    },
                  };
                }

                if (options?.failOnOperation && op === options.failOnOperation) {
                  return {
                    data: null,
                    error: {
                      message:
                        options.failMessage ||
                        'simulated insert failure',
                    },
                  };
                }

                const data = rows.map((r, i) => ({
                  id: `rcpt-${calls.length}-${i + 1}`,
                  amount: r.amount,
                  due_date: r.due_date,
                  status: r.status,
                  installment_number: r.installment_number,
                }));
                return { data, error: null };
              })();
            },
          };
        },
      };
    },
  };

  return { supabase: supabase as never, calls, getOperations: () => op };
}

function baseForm(count: number): LotFormConfirmPayload {
  return {
    payment_type: 'Parcelado',
    installments_count: String(count),
    final_value: 300_000,
    down_payment: '0',
    down_payment_due_date: '',
    first_installment_due_date: '2026-09-01',
    installment_correction_type: 'IGPM',
  } as LotFormConfirmPayload;
}

function buildPayloads(count: number) {
  return buildSaleEditFinancePayloads(
    'tenant-t',
    'sale-s',
    'cust-c',
    null,
    { id: 'lot-l', project_id: 'proj-p' },
    baseForm(count),
    { contractModel: 'ARAGUAIA' },
  );
}

async function assertBatchPersist(count: number) {
  const payloads = buildPayloads(count);
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === count, `${count}: payloads mensais`);

  const bytes = estimateFinanceReceiptsPayloadBytes(payloads);
  const { supabase, calls, getOperations } = createMockSupabase();
  const t0 = Date.now();
  const result = await insertRowsWithColumnFallback(
    supabase,
    'finance_receipts',
    payloads,
    'id, amount, due_date, status, installment_number',
  );
  const ms = Date.now() - t0;

  assert(!result.error, `${count}: sem erro (${result.error?.message})`);
  assert(result.data.length === payloads.length, `${count}: rows retornadas`);
  assert(result.operations === 1, `${count}: 1 operação (era ${count} 1-a-1)`);
  assert(getOperations() === 1, `${count}: 1 call mock`);
  assert(calls.length === 1, `${count}: 1 insert call`);
  assert(calls[0].rows.length === payloads.length, `${count}: lote completo`);

  const nums = result.data.map((r) => Number(r.installment_number));
  assert(nums[0] === 1, `${count}: primeira = 1`);
  assert(nums[count - 1] === count, `${count}: última = ${count}`);
  assert(new Set(nums).size === count, `${count}: sem duplicatas`);

  const sum =
    Math.round(
      result.data.reduce((acc, r) => acc + Number(r.amount || 0), 0) * 100,
    ) / 100;
  assert(sum === 300_000, `${count}: soma ${sum}`);

  console.log(
    `OK batch ${count}: ops=${result.operations} (antes=${count}), ${ms}ms, ~${bytes} bytes, 1ª/última ok, soma=${sum}`,
  );
  return { bytes, operations: result.operations, before: count };
}

function testSourceUsesBatchNotLoop() {
  const src = fs.readFileSync('lib/gisSaleCreateService.ts', 'utf8');
  assert(src.includes('insertRowsWithColumnFallback'), 'helper lote');
  assert(src.includes('create_receipts_batch'), 'log batch');
  assert(
    !src.includes('for (const financePayload of financePayloads)'),
    'loop 1-a-1 removido',
  );
  assert(src.includes('rollbackPartialSale'), 'rollback compensatório mantido');
  // Importação já usava array — alinhamento intencional
  const importSrc = fs.readFileSync(
    'lib/imports/modules/sales/executeSaleRow.ts',
    'utf8',
  );
  assert(
    importSrc.includes(".insert(financePayloads)"),
    'import também usa insert(array)',
  );
  console.log('OK testSourceUsesBatchNotLoop');
}

async function testColumnFallbackOnce() {
  const payloads = buildPayloads(5);
  const { supabase, calls } = createMockSupabase({
    missingColumnOnce: 'financial_account_id',
  });
  // Garante que payloads tenham a coluna “fantasma”
  const withGhost = payloads.map((p) => ({
    ...p,
    financial_account_id: 'acc-x',
  }));
  const result = await insertRowsWithColumnFallback(
    supabase,
    'finance_receipts',
    withGhost,
    'id',
  );
  assert(!result.error, 'fallback ok');
  assert(result.data.length === 5, '5 rows');
  assert(result.operations === 2, '1 fail coluna + 1 sucesso');
  assert(
    !calls[1].rows[0].financial_account_id,
    'coluna removida no retry',
  );
  console.log('OK testColumnFallbackOnce');
}

async function testSimulatedFailureSafeBehavior() {
  const payloads = buildPayloads(220);
  const { supabase, calls } = createMockSupabase({
    failOnOperation: 1,
    failMessage: 'simulated failure at batch',
  });
  const result = await insertRowsWithColumnFallback(
    supabase,
    'finance_receipts',
    payloads,
    'id',
  );
  assert(Boolean(result.error), 'erro presente');
  assert(result.data.length === 0, 'lote único: zero rows se falhou');
  assert(calls.length === 1, 'uma tentativa');
  // Comportamento conhecido: venda já criada ficaria órfã até rollbackPartialSale
  // no catch de executeGisSaleCreate — sem parcial 1..179.
  console.log(
    'OK testSimulatedFailureSafeBehavior — falha = 0 parcelas gravadas no lote (rollback externo limpa a venda)',
  );
}

async function testChunkPartialThenFailDocumentsRisk() {
  // Se alguém forçar chunkSize < N e o 2º chunk falhar, há parcial até o catch.
  const payloads = buildPayloads(10);
  const { supabase } = createMockSupabase({ failOnOperation: 2 });
  const result = await insertRowsWithColumnFallback(
    supabase,
    'finance_receipts',
    payloads,
    'id',
    { chunkSize: 5 },
  );
  assert(Boolean(result.error), '2º chunk falhou');
  assert(result.data.length === 5, 'parcial: 5 do 1º chunk (limitação conhecida)');
  assert(
    fs.readFileSync('lib/gisSaleCreateService.ts', 'utf8').includes('rollbackPartialSale'),
    'rollback ainda cobre o caso',
  );
  console.log(
    'OK testChunkPartialThenFailDocumentsRisk — default não usa chunks; se chunked, parcial até rollback',
  );
}

function test301StillRejected() {
  const r = validateInstallmentsCount('301');
  assert(!r.valid, '301 rejeitado');
  console.log('OK test301StillRejected');
}

async function main() {
  testSourceUsesBatchNotLoop();
  test301StillRejected();
  await assertBatchPersist(160);
  await assertBatchPersist(220);
  await assertBatchPersist(300);
  await testColumnFallbackOnce();
  await testSimulatedFailureSafeBehavior();
  await testChunkPartialThenFailDocumentsRisk();
  console.log('mandatory-gis-sale-receipts-batch-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
