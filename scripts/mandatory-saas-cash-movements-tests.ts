/**
 * Testes obrigatórios — Caixa SaaS automático.
 * npx tsx scripts/mandatory-saas-cash-movements-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeSaasCashSummaryFromRows,
  createSaasCashIncomeFromChargePaid,
  saasCashSourceLabel,
  syncAsaasCashMovements,
} from '../lib/saasCashMovements';
import {
  mapAsaasFinancialTransaction,
  isAsaasCashSyncExpenseMapping,
} from '../lib/asaasFinancialTransactions';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  const full = path.join(ROOT, rel);
  assert(fs.existsSync(full), `arquivo ausente: ${rel}`);
  return fs.readFileSync(full, 'utf8');
}

type MockRow = Record<string, unknown>;

function createMockSupabase(initial: { saas_cash_movements?: MockRow[] } = {}) {
  const tables: Record<string, MockRow[]> = {
    saas_cash_movements: [...(initial.saas_cash_movements || [])],
    saas_charges: [],
    companies: [],
  };

  class Query {
    private filters: Array<(row: MockRow) => boolean> = [];
    private insertPayload: MockRow | null = null;
    private containsFilter: Record<string, unknown> | null = null;
    private limitCount: number | null = null;

    constructor(private table: string) {}

    select() {
      return this;
    }

    eq(col: string, val: unknown) {
      this.filters.push((row) => row[col] === val);
      return this;
    }

    contains(_col: string, value: Record<string, unknown>) {
      this.containsFilter = value;
      return this;
    }

    is() {
      return this;
    }

    gte() {
      return this;
    }

    lte() {
      return this;
    }

    order() {
      return this;
    }

    limit(n: number) {
      this.limitCount = n;
      return this;
    }

    in() {
      return this;
    }

    insert(payload: MockRow) {
      this.insertPayload = payload;
      return this;
    }

    single() {
      return this;
    }

    maybeSingle() {
      return this;
    }

    private runSelect(): MockRow[] {
      let rows = [...(tables[this.table] || [])];
      for (const filter of this.filters) {
        rows = rows.filter(filter);
      }
      if (this.containsFilter) {
        rows = rows.filter((row) => {
          const metadata = row.metadata as Record<string, unknown> | undefined;
          if (!metadata || typeof metadata !== 'object') return false;
          return Object.entries(this.containsFilter!).every(
            ([key, value]) => metadata[key] === value,
          );
        });
      }
      if (this.limitCount != null) {
        rows = rows.slice(0, this.limitCount);
      }
      return rows;
    }

    then(resolve: (value: { data: MockRow | MockRow[] | null; error: { code?: string; message: string } | null }) => void) {
      if (this.insertPayload) {
        const movementId = String(
          (this.insertPayload.metadata as Record<string, unknown> | undefined)?.asaas_movement_id || '',
        );
        const duplicate =
          this.table === 'saas_cash_movements' &&
          movementId &&
          tables.saas_cash_movements.some((row) => {
            const metadata = row.metadata as Record<string, unknown> | undefined;
            return metadata?.asaas_movement_id === movementId;
          });

        if (duplicate) {
          resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          });
          return;
        }

        const row = {
          id: `mov-${tables.saas_cash_movements.length + 1}`,
          created_at: new Date().toISOString(),
          metadata: {},
          ...this.insertPayload,
        };
        tables.saas_cash_movements.push(row);
        resolve({ data: row, error: null });
        return;
      }

      const rows = this.runSelect();
      const data = rows.length === 1 ? rows[0] : rows.length > 1 ? rows : null;
      resolve({ data, error: null });
    }
  }

  return {
    from(table: string) {
      return new Query(table);
    },
    _tables: tables,
  } as unknown as import('@supabase/supabase-js').SupabaseClient & { _tables: typeof tables };
}

async function testPaidChargeCreatesIncome() {
  const supabase = createMockSupabase();
  const result = await createSaasCashIncomeFromChargePaid(supabase, {
    charge: {
      id: 'ch-1',
      company_id: 'co-1',
      amount: 549.99,
      payment_id: 'pay_asaas_1',
      paid_at: '2026-06-20',
    },
    paidAt: '2026-06-20',
  });

  assert(result.created, 'movimento criado');
  assert(result.movement?.type === 'income', 'tipo income');
  assert(result.movement?.category === 'Assinatura SaaS', 'categoria');
  assert(result.movement?.source === 'asaas_webhook', 'source webhook');
  assert(result.movement?.amount === 549.99, 'valor');
  assert(result.movement?.company_id === 'co-1', 'empresa');
  assert(result.movement?.saas_charge_id === 'ch-1', 'charge link');
  assert(supabase._tables.saas_cash_movements.length === 1, 'uma linha no caixa');
  console.log('OK testPaidChargeCreatesIncome');
}

async function testDuplicateWebhookDoesNotDuplicate() {
  const supabase = createMockSupabase();
  const input = {
    charge: {
      id: 'ch-1',
      company_id: 'co-1',
      amount: 100,
      payment_id: 'pay_dup',
      paid_at: '2026-06-20',
    },
    paidAt: '2026-06-20',
  };

  const first = await createSaasCashIncomeFromChargePaid(supabase, input);
  const second = await createSaasCashIncomeFromChargePaid(supabase, input);

  assert(first.created, 'primeira cria');
  assert(!second.created, 'segunda não cria');
  assert(first.movement?.id === second.movement?.id, 'mesmo movimento');
  assert(supabase._tables.saas_cash_movements.length === 1, 'sem duplicata');
  console.log('OK testDuplicateWebhookDoesNotDuplicate');
}

async function testChargeWithoutCompanyDoesNotBreak() {
  const supabase = createMockSupabase();
  const result = await createSaasCashIncomeFromChargePaid(supabase, {
    charge: {
      id: 'ch-orphan',
      company_id: '',
      amount: 50,
      payment_id: 'pay_no_company',
      paid_at: null,
    },
  });

  assert(result.created, 'cria mesmo sem empresa');
  assert(result.movement?.company_id === null, 'company_id null');
  assert(supabase._tables.saas_cash_movements.length === 1, 'persistiu');
  console.log('OK testChargeWithoutCompanyDoesNotBreak');
}

function testSummaryCalculatesCorrectly() {
  const summary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 500 },
    { type: 'income', amount: 49.99 },
    { type: 'expense', amount: 10 },
  ]);

  assert(summary.periodIncome === 549.99, 'entradas');
  assert(summary.periodExpense === 10, 'saídas');
  assert(summary.netResult === 539.99, 'líquido');
  assert(summary.movementCount === 3, 'contagem');
  console.log('OK testSummaryCalculatesCorrectly');
}

function testMigrationStructure() {
  const migration = read('supabase/migrations/20260810120000_saas_cash_movements.sql');
  assert(migration.includes('saas_cash_movements'), 'tabela');
  for (const col of [
    'company_id',
    'saas_charge_id',
    'asaas_payment_id',
    'movement_date',
    'metadata',
    'created_by',
  ]) {
    assert(migration.includes(col), `coluna ${col}`);
  }
  assert(migration.includes("'income', 'expense'"), 'check type');
  assert(migration.includes('asaas_webhook'), 'check source');
  assert(migration.includes('idx_saas_cash_movements_asaas_webhook_income_unique'), 'unique asaas');
  assert(!migration.includes('DELETE FROM'), 'sem apagar dados');
  assert(!migration.includes('TRUNCATE'), 'sem truncate');

  const syncMigration = read('supabase/migrations/20260811120000_saas_cash_asaas_movement_unique.sql');
  assert(
    syncMigration.includes('idx_saas_cash_movements_asaas_movement_id_unique'),
    'unique asaas_movement_id',
  );
  console.log('OK testMigrationStructure');
}

function testAsaasMovementMapping() {
  const transfer = mapAsaasFinancialTransaction({
    id: 'ft_transfer',
    type: 'TRANSFER',
    value: -5,
    date: '2026-06-20',
    description: 'Transferência bancária',
  });
  assert(!transfer.skip, 'transfer mapeado');
  assert(transfer.type === 'expense', 'transfer expense');
  assert(transfer.source === 'asaas_transfer', 'transfer source');
  assert(transfer.category === 'Saque', 'transfer categoria saque');
  assert(transfer.amount === 5, 'transfer valor absoluto');

  const fee = mapAsaasFinancialTransaction({
    id: 'ft_fee',
    type: 'PAYMENT_FEE',
    value: -2.99,
    date: '2026-06-20',
  });
  assert(isAsaasCashSyncExpenseMapping(fee), 'tarifa expense');
  assert(fee.category === 'Tarifa Asaas', 'tarifa categoria');

  const internal = mapAsaasFinancialTransaction({
    id: 'ft_internal',
    type: 'INTERNAL_TRANSFER_DEBIT',
    value: -10,
    date: '2026-06-20',
  });
  assert(internal.category === 'Transferência', 'transferência interna');

  const refund = mapAsaasFinancialTransaction({
    id: 'ft_refund',
    type: 'PAYMENT_REVERSAL',
    value: -150,
    date: '2026-06-20',
  });
  assert(refund.source === 'asaas_refund', 'estorno source');
  assert(refund.category === 'Estorno', 'estorno categoria');

  const incomeSkip = mapAsaasFinancialTransaction({
    id: 'ft_income',
    type: 'PAYMENT_RECEIVED',
    value: 150,
    date: '2026-06-20',
  });
  assert(incomeSkip.skip && incomeSkip.skipReason === 'webhook_income', 'recebimento ignorado');

  const unknown = mapAsaasFinancialTransaction({
    id: 'ft_unknown',
    type: 'BRAND_NEW_TYPE',
    value: -1,
    date: '2026-06-20',
  });
  assert(unknown.skip && unknown.skipReason === 'unknown_type', 'tipo desconhecido ignorado');
  console.log('OK testAsaasMovementMapping');
}

async function testSyncAsaasCreatesExpenses() {
  const supabase = createMockSupabase();
  const result = await syncAsaasCashMovements(
    supabase,
    { fromDate: '2026-06-01', toDate: '2026-06-30' },
    {
      fetchTransactions: async () => [
        { id: 'ft1', type: 'TRANSFER', value: -5, date: '2026-06-20' },
        { id: 'ft2', type: 'PAYMENT_FEE', value: -2.99, date: '2026-06-20' },
        { id: 'ft3', type: 'PAYMENT_RECEIVED', value: 10, date: '2026-06-20' },
      ],
    },
  );

  assert(result.created === 2, 'duas saídas criadas');
  assert(result.skipped >= 1, 'recebimento ignorado');
  assert(supabase._tables.saas_cash_movements.length === 2, 'duas linhas');
  console.log('OK testSyncAsaasCreatesExpenses');
}

async function testSyncAsaasDoesNotDuplicate() {
  const supabase = createMockSupabase();
  const deps = {
    fetchTransactions: async () => [
      { id: 'ft_dup', type: 'TRANSFER', value: -5, date: '2026-06-20' },
    ],
  };
  const first = await syncAsaasCashMovements(
    supabase,
    { fromDate: '2026-06-01', toDate: '2026-06-30' },
    deps,
  );
  const second = await syncAsaasCashMovements(
    supabase,
    { fromDate: '2026-06-01', toDate: '2026-06-30' },
    deps,
  );
  assert(first.created === 1, 'primeira sync cria');
  assert(second.created === 0, 'segunda sync não cria');
  assert(supabase._tables.saas_cash_movements.length === 1, 'sem duplicata');
  console.log('OK testSyncAsaasDoesNotDuplicate');
}

function testKpisAfterWithdrawalScenario() {
  const summary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 10 },
    { type: 'expense', amount: 5 },
  ]);
  assert(summary.periodIncome === 10, 'entrada 10');
  assert(summary.periodExpense === 5, 'saída 5');
  assert(summary.netResult === 5, 'saldo 5');
  console.log('OK testKpisAfterWithdrawalScenario');
}

function testWebhookIntegration() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(
    saasCharges.includes('createSaasCashIncomeFromChargePaid'),
    'processSaasChargePaid integra caixa',
  );
  assert(saasCharges.includes("charge.status === 'PAID' && charge.master_payment_id"), 'idempotente caixa');
  console.log('OK testWebhookIntegration');
}

function testApiAndSecurity() {
  const api = read('app/api/master/saas-cash/route.ts');
  assert(api.includes('assertSuperAdmin'), 'API super admin');
  assert(api.includes('listSaasCashMovements'), 'lista movimentos');
  assert(api.includes('getSaasCashSummary'), 'resumo');

  const syncApi = read('app/api/master/saas-cash/sync-asaas/route.ts');
  assert(syncApi.includes('assertSuperAdmin'), 'sync API super admin');
  assert(syncApi.includes('syncAsaasCashMovements'), 'sync handler');

  const guard = read('components/admin/SuperAdminOnlyGuard.tsx');
  assert(guard.includes('SUPER_ADMIN'), 'guard super admin');

  const cashPage = read('app/saas-finance/cash/page.tsx');
  assert(cashPage.includes('SuperAdminOnlyGuard'), 'rota cash protegida');
  assert(cashPage.includes('SaasCashPanel'), 'painel caixa');
  console.log('OK testApiAndSecurity');
}

function testUiLoadsWithoutMovements() {
  const panel = read('components/master/saas/SaasCashPanel.tsx');
  assert(panel.includes('Nenhuma movimentação no período selecionado'), 'estado vazio');
  assert(panel.includes('saasCashSourceLabel'), 'badge origem');
  assert(panel.includes('Sincronizar Asaas'), 'botão sync');
  assert(panel.includes('isSuperAdmin'), 'botão restrito super admin');
  assert(saasCashSourceLabel('asaas_webhook') === 'Asaas', 'label Asaas');
  assert(saasCashSourceLabel('asaas_fee') === 'Tarifa', 'label Tarifa');

  const nav = read('components/master/saas/SaasPanelUi.tsx');
  assert(nav.includes("'caixa'"), 'aba caixa');
  assert(nav.includes('superAdminOnly'), 'aba restrita');
  console.log('OK testUiLoadsWithoutMovements');
}

async function main() {
  await testPaidChargeCreatesIncome();
  await testDuplicateWebhookDoesNotDuplicate();
  await testChargeWithoutCompanyDoesNotBreak();
  testSummaryCalculatesCorrectly();
  testMigrationStructure();
  testWebhookIntegration();
  testAsaasMovementMapping();
  await testSyncAsaasCreatesExpenses();
  await testSyncAsaasDoesNotDuplicate();
  testKpisAfterWithdrawalScenario();
  testApiAndSecurity();
  testUiLoadsWithoutMovements();
  console.log('mandatory-saas-cash-movements-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
