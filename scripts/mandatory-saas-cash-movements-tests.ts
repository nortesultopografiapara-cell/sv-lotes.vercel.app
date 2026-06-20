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
} from '../lib/saasCashMovements';

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
    companies: [],
  };

  class Query {
    private filters: Array<(row: MockRow) => boolean> = [];
    private insertPayload: MockRow | null = null;
    private limitCount: number | null = null;

    constructor(private table: string) {}

    select() {
      return this;
    }

    eq(col: string, val: unknown) {
      this.filters.push((row) => row[col] === val);
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
      if (this.limitCount != null) {
        rows = rows.slice(0, this.limitCount);
      }
      return rows;
    }

    then(resolve: (value: { data: MockRow | MockRow[] | null; error: { code?: string; message: string } | null }) => void) {
      if (this.insertPayload) {
        const duplicate =
          this.table === 'saas_cash_movements' &&
          this.insertPayload.asaas_payment_id &&
          tables.saas_cash_movements.some(
            (row) =>
              row.asaas_payment_id === this.insertPayload!.asaas_payment_id &&
              row.source === 'asaas_webhook' &&
              row.type === 'income',
          );

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
  } as unknown as SupabaseClient & { _tables: typeof tables };
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
  console.log('OK testMigrationStructure');
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

  const guard = read('components/admin/SuperAdminOnlyGuard.tsx');
  assert(guard.includes("SUPER_ADMIN"), 'guard super admin');

  const cashPage = read('app/saas-finance/cash/page.tsx');
  assert(cashPage.includes('SuperAdminOnlyGuard'), 'rota cash protegida');
  assert(cashPage.includes('SaasCashPanel'), 'painel caixa');
  console.log('OK testApiAndSecurity');
}

function testUiLoadsWithoutMovements() {
  const panel = read('components/master/saas/SaasCashPanel.tsx');
  assert(panel.includes('Nenhuma movimentação no período selecionado'), 'estado vazio');
  assert(panel.includes('saasCashSourceLabel'), 'badge origem');
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
  testApiAndSecurity();
  testUiLoadsWithoutMovements();
  console.log('mandatory-saas-cash-movements-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
