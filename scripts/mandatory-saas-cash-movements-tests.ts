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
import {
  buildSaasCashExportFilename,
  mapMovementsToExportRows,
} from '../lib/saasCashExport';
import {
  applySaasFinanceStartAtFilter,
  filterMovementsByCashStartAt,
  effectiveSaasCashFromDate,
  isSaasFinancialRecordAfterStartAt,
  sumSaasReceivedRevenue,
} from '../lib/saasFinanceSettings';
import { computeSaasBillingMetrics } from '../lib/saasBilling';
import { sumReceivedRevenue } from '../lib/masterSaasPayments';
import { calculateMrrFromCompanies } from '../lib/companyPricing';

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

  const settingsMigration = read('supabase/migrations/20260812120000_saas_finance_settings.sql');
  assert(settingsMigration.includes('saas_finance_settings'), 'settings table');
  assert(settingsMigration.includes('is_super_admin()'), 'settings RLS');
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
  assert(transfer.description === 'Transferência bancária', 'descrição original Asaas');

  const pixDebit = mapAsaasFinancialTransaction({
    id: 'ft_pix_debit',
    type: 'PIX_TRANSACTION_DEBIT',
    value: -15,
    date: '2026-06-20',
    description: 'Transação via Pix com chave +55 94...',
  });
  assert(!pixDebit.skip, 'pix debit mapeado');
  assert(pixDebit.type === 'expense', 'pix debit expense');
  assert(pixDebit.category === 'Transferência Pix', 'pix debit categoria');
  assert(pixDebit.description?.includes('Transação via Pix'), 'descrição pix original');

  const fee = mapAsaasFinancialTransaction({
    id: 'ft_fee',
    type: 'PAYMENT_FEE',
    value: -2.99,
    date: '2026-06-20',
    description: 'Taxa do Pix',
  });
  assert(isAsaasCashSyncExpenseMapping(fee), 'tarifa expense');
  assert(fee.category === 'Tarifa Asaas', 'tarifa categoria');
  assert(fee.description === 'Taxa do Pix', 'descrição tarifa original');

  const feeDiscount = mapAsaasFinancialTransaction({
    id: 'ft_fee_rev',
    type: 'PAYMENT_FEE_REVERSAL',
    value: 1.99,
    date: '2026-06-20',
    description: 'Desconto na tarifa',
  });
  assert(!feeDiscount.skip, 'desconto tarifa mapeado');
  assert(feeDiscount.type === 'income', 'desconto tarifa income');
  assert(feeDiscount.category === 'Ajuste positivo', 'desconto categoria');
  assert(feeDiscount.description === 'Desconto na tarifa', 'descrição desconto original');

  const messagingFee = mapAsaasFinancialTransaction({
    id: 'ft_msg_fee',
    type: 'PAYMENT_MESSAGING_NOTIFICATION_FEE',
    value: -0.99,
    date: '2026-06-20',
    description: 'Taxa de mensageria',
  });
  assert(messagingFee.type === 'expense', 'taxa mensageria expense');

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
        {
          id: 'ft4',
          type: 'PIX_TRANSACTION_DEBIT',
          value: -15,
          date: '2026-06-20',
          description: 'Transação via Pix com chave',
        },
        {
          id: 'ft5',
          type: 'PAYMENT_FEE_REVERSAL',
          value: 1.99,
          date: '2026-06-20',
          description: 'Desconto na tarifa',
        },
      ],
    },
  );

  assert(result.created === 4, 'quatro movimentos criados');
  assert(result.expenseCreated === 3, 'três saídas');
  assert(result.incomeCreated === 1, 'um ajuste positivo');
  assert(result.skippedWebhookIncome === 1, 'recebimento webhook ignorado');
  assert(supabase._tables.saas_cash_movements.length === 4, 'quatro linhas');
  console.log('OK testSyncAsaasCreatesExpenses');
}

async function testSyncAsaasRespectsCashStartAt() {
  const supabase = createMockSupabase();
  const result = await syncAsaasCashMovements(
    supabase,
    {
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      cashStartAt: '2026-06-20T09:00:00.000Z',
    },
    {
      fetchTransactions: async () => [
        { id: 'old', type: 'TRANSFER', value: -5, date: '2026-06-01' },
        { id: 'new', type: 'TRANSFER', value: -5, date: '2026-06-20' },
      ],
    },
  );

  assert(result.created === 1, 'somente após marco');
  assert(result.skippedBeforeStartAt === 1, 'ignora anterior ao marco');
  assert(supabase._tables.saas_cash_movements.length === 1, 'uma linha');
  console.log('OK testSyncAsaasRespectsCashStartAt');
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

function testExportRespectsFilteredMovements() {
  const movements = [
    {
      id: '1',
      company_id: 'c1',
      saas_charge_id: null,
      asaas_payment_id: null,
      type: 'income' as const,
      category: 'Assinatura SaaS',
      description: 'Entrada',
      amount: 10,
      movement_date: '2026-06-20',
      source: 'asaas_webhook' as const,
      metadata: {},
      created_at: '2026-06-20T10:00:00Z',
      created_by: null,
      company_name: 'Empresa A',
    },
    {
      id: '2',
      company_id: 'c2',
      saas_charge_id: null,
      asaas_payment_id: null,
      type: 'expense' as const,
      category: 'Saque',
      description: 'Saque',
      amount: 5,
      movement_date: '2026-06-20',
      source: 'asaas_transfer' as const,
      metadata: {},
      created_at: '2026-06-20T11:00:00Z',
      created_by: null,
      company_name: 'Empresa B',
    },
  ];

  const rows = mapMovementsToExportRows(movements);
  assert(rows.length === 2, 'exporta movimentos filtrados');
  assert(rows[0].company === 'Empresa A', 'empresa A');
  assert(rows[1].amount === -5, 'saída negativa no excel');
  assert(
    buildSaasCashExportFilename('xlsx', new Date('2026-06-20T12:00:00Z')) ===
      'caixa-saas-2026-06-20.xlsx',
    'nome arquivo excel',
  );
  assert(
    buildSaasCashExportFilename('pdf', new Date('2026-06-20T12:00:00Z')) ===
      'caixa-saas-2026-06-20.pdf',
    'nome arquivo pdf',
  );

  const exportLib = read('lib/saasCashExport.ts');
  assert(exportLib.includes('Livro Caixa SaaS'), 'cabeçalho export');
  assert(exportLib.includes('Entradas'), 'pdf resumo entradas');
  assert(exportLib.includes('SV_LOTES_BRAND'), 'marca SV LOTES no export');
  assert(exportLib.includes('loadSvLotesLogoDataUrlClient'), 'pdf tenta carregar logo');
  assert(exportLib.includes('Financeiro contabilizado a partir de'), 'marco no export');
  assert(exportLib.includes('Nenhuma movimentação no período selecionado'), 'pdf vazio');
  assert(exportLib.includes('Relatório gerado automaticamente'), 'rodapé pdf');
  console.log('OK testExportRespectsFilteredMovements');
}

function testCashStartAtFiltersWithoutDeleting() {
  const all = [
    {
      id: 'old',
      movement_date: '2026-01-01',
      created_at: '2026-01-01T10:00:00Z',
      type: 'expense' as const,
      amount: 100,
    },
    {
      id: 'new',
      movement_date: '2026-06-20',
      created_at: '2026-06-20T10:00:00Z',
      type: 'income' as const,
      amount: 10,
    },
  ];

  const startAt = '2026-06-20T09:00:00.000Z';
  const filtered = filterMovementsByCashStartAt(all, startAt);
  assert(filtered.length === 1, 'remove antigos dos KPIs');
  assert(filtered[0].id === 'new', 'mantém novos');
  assert(all.length === 2, 'não apaga registros originais');

  const summary = computeSaasCashSummaryFromRows(filtered);
  assert(summary.periodIncome === 10, 'KPI entrada após marco');
  assert(summary.periodExpense === 0, 'KPI saída após marco');
  assert(summary.netResult === 10, 'saldo após marco');

  assert(
    effectiveSaasCashFromDate('2026-01-01', startAt) === '2026-06-20',
    'fromDate efetivo respeita marco',
  );
  console.log('OK testCashStartAtFiltersWithoutDeleting');
}

function testDashboardFinanceStartAtFilters() {
  const startAt = '2026-06-20T16:01:00.000Z';

  const payments = [
    {
      id: 'p-old',
      company_id: 'c1',
      amount: 500,
      paid_at: '2026-05-10T12:00:00Z',
      payment_method: 'pix',
      reference_month: '2026-05',
      status: 'paid',
    },
    {
      id: 'p-new',
      company_id: 'c1',
      amount: 200,
      paid_at: '2026-06-21T10:00:00Z',
      payment_method: 'pix',
      reference_month: '2026-06',
      status: 'paid',
    },
  ];

  const invoices = [
    {
      id: 'i-old',
      company_id: 'c1',
      invoice_number: 'F-1',
      reference_month: '2026-05',
      amount: 500,
      discount_amount: 0,
      final_amount: 500,
      due_date: '2026-05-15',
      issued_at: '2026-05-01',
      status: 'PENDENTE' as const,
    },
    {
      id: 'i-new',
      company_id: 'c1',
      invoice_number: 'F-2',
      reference_month: '2026-06',
      amount: 300,
      discount_amount: 0,
      final_amount: 300,
      due_date: '2026-06-25',
      issued_at: '2026-06-01',
      status: 'PENDENTE' as const,
    },
  ];

  const filteredPayments = applySaasFinanceStartAtFilter(payments, startAt);
  const filteredInvoices = applySaasFinanceStartAtFilter(invoices, startAt);

  assert(filteredPayments.length === 1, 'pagamento antigo excluído');
  assert(filteredPayments[0].id === 'p-new', 'pagamento novo mantido');
  assert(sumSaasReceivedRevenue(payments, startAt) === 200, 'receita recebida após marco');

  const metrics = computeSaasBillingMetrics(filteredInvoices, 0, sumSaasReceivedRevenue(payments, startAt));
  assert(metrics.receivedRevenue === 200, 'dashboard receita recebida');
  assert(metrics.revenueToReceive === 300, 'fatura pendente após marco');
  assert(metrics.pendingCount === 1, 'contagem faturas pendentes');

  assert(!isSaasFinancialRecordAfterStartAt({ paid_at: '2026-01-01' }, startAt), 'registro antigo');
  assert(isSaasFinancialRecordAfterStartAt({ paid_at: '2026-06-21' }, startAt), 'registro novo');

  const dashboard = read('lib/masterDashboardData.ts');
  assert(dashboard.includes('applySaasFinanceStartAtFilter'), 'master dashboard filtra');
  assert(dashboard.includes('getSaasCashStartAt'), 'master dashboard lê marco');
  assert(dashboard.includes('sumSaasReceivedRevenue'), 'master dashboard receita central');

  const financePage = read('app/saas-finance/page.tsx');
  assert(financePage.includes('applySaasFinanceStartAtFilter'), 'financeiro SaaS filtra');
  assert(financePage.includes('SaasFinanceStartAtBanner'), 'financeiro SaaS aviso marco');
  assert(financePage.includes('sumSaasReceivedRevenue'), 'financeiro receita central');

  console.log('OK testDashboardFinanceStartAtFilters');
}

function testSubscriptionsReceivedRevenueRespectsStartAt() {
  const startAt = '2026-06-20T16:01:00.000Z';
  const payments = [
    {
      id: 'p-old',
      company_id: 'c1',
      amount: 890,
      paid_at: '2026-05-10T12:00:00Z',
      payment_method: 'pix',
      reference_month: '2026-05',
      status: 'paid',
    },
    {
      id: 'p-new',
      company_id: 'c1',
      amount: 150,
      paid_at: '2026-06-21T10:00:00Z',
      payment_method: 'pix',
      reference_month: '2026-06',
      status: 'paid',
    },
  ];
  const invoices = [
    {
      id: 'i-open',
      company_id: 'c1',
      invoice_number: 'F-1',
      reference_month: '2026-06',
      amount: 849.99,
      discount_amount: 0,
      final_amount: 849.99,
      due_date: '2026-06-25',
      issued_at: '2026-06-01',
      status: 'PENDENTE' as const,
    },
  ];
  const companies = [
    {
      id: 'c1',
      name: 'Empresa Teste',
      active: true,
      status_operacional: 'Ativa',
      plan: 'basic',
      custom_price_enabled: true,
      custom_monthly_price: 850,
    },
  ];

  const paymentsReceived = sumSaasReceivedRevenue(payments, startAt);
  assert(paymentsReceived === 150, 'assinaturas ignora pagamento anterior ao marco');

  const mrr = calculateMrrFromCompanies(companies);
  assert(mrr === 850, 'MRR inalterado');
  assert(mrr * 12 === 10200, 'ARR inalterado');

  const metrics = computeSaasBillingMetrics(invoices, mrr, paymentsReceived);
  assert(metrics.revenueToReceive === 849.99, 'receita em aberto inalterada');

  const oldOnlyPayments = [
    {
      id: 'p-old-only',
      company_id: 'c1',
      amount: 340,
      paid_at: '2026-05-10T12:00:00Z',
      payment_method: 'pix',
      reference_month: '2026-05',
      status: 'paid',
    },
  ];
  const oldInvoices = [
    {
      id: 'i-paid-old',
      company_id: 'c1',
      invoice_number: 'F-0',
      reference_month: '2026-05',
      amount: 340,
      discount_amount: 0,
      final_amount: 340,
      due_date: '2026-05-15',
      issued_at: '2026-05-01',
      paid_at: '2026-05-10T12:00:00Z',
      status: 'PAGO' as const,
    },
  ];
  assert(sumSaasReceivedRevenue(oldOnlyPayments, startAt) === 0, 'marco zera receita recebida');
  const legacyMetrics = computeSaasBillingMetrics(oldInvoices, mrr, 0);
  assert(legacyMetrics.receivedRevenue === 340, 'fallback legado usaria fatura paga');

  const plansPage = read('app/plans/page.tsx');
  assert(plansPage.includes('sumSaasReceivedRevenue'), 'assinaturas usa receita central');
  assert(plansPage.includes('SaasFinanceStartAtBanner'), 'assinaturas banner marco');
  assert(!plansPage.includes('billingMetrics.receivedRevenue'), 'assinaturas não usa fallback de fatura');

  const cashPanel = read('components/master/saas/SaasCashPanel.tsx');
  assert(cashPanel.includes('cashStartAt'), 'export pdf recebe marco');
  assert(cashPanel.includes('issuedBy'), 'export pdf recebe emissor');

  console.log('OK testSubscriptionsReceivedRevenueRespectsStartAt');
}

function testApiAndSecurity() {
  const api = read('app/api/master/saas-cash/route.ts');
  assert(api.includes('assertSuperAdmin'), 'API super admin');
  assert(api.includes('loadSaasCashView'), 'lista movimentos via view');
  assert(api.includes('getSaasCashStartAt'), 'GET respeita marco');

  const syncApi = read('app/api/master/saas-cash/sync-asaas/route.ts');
  assert(syncApi.includes('assertSuperAdmin'), 'sync API super admin');
  assert(syncApi.includes('syncAsaasCashMovements'), 'sync handler');
  assert(syncApi.includes('getSaasCashStartAt'), 'sync respeita marco');

  const syncLib = read('lib/saasCashMovements.ts');
  assert(syncLib.includes('listAsaasFinancialTransactions'), 'sync usa extrato financeiro');
  assert(syncLib.includes('[saas-cash-sync-result]'), 'log diagnóstico sync');

  const mappingLib = read('lib/asaasFinancialTransactions.ts');
  assert(mappingLib.includes('PIX_TRANSACTION_DEBIT'), 'mapeia pix debit');
  assert(mappingLib.includes('PAYMENT_FEE_REVERSAL'), 'mapeia desconto tarifa');

  const startAtApi = read('app/api/master/saas-cash/start-at/route.ts');
  assert(startAtApi.includes('assertSuperAdmin'), 'start-at super admin');
  assert(startAtApi.includes('setSaasCashStartAt'), 'start-at salva marco');

  const exportLib = read('lib/saasCashExport.ts');
  assert(exportLib.includes('exportSaasCashExcel'), 'export excel');
  assert(exportLib.includes('exportSaasCashPdf'), 'export pdf');

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
  assert(panel.includes('Exportar Excel'), 'botão excel');
  assert(panel.includes('Exportar PDF'), 'botão pdf');
  assert(panel.includes('Definir marco financeiro'), 'botão marco');
  assert(panel.includes('ZERAR CAIXA'), 'confirmação digitada');
  assert(panel.includes('startAtConfirmText'), 'campo confirmação');
  assert(panel.includes('canConfirmStartAt'), 'botão confirmar condicional');
  assert(panel.includes('SaasFinanceStartAtBanner'), 'aviso marco');
  assert(panel.includes('isSuperAdmin'), 'botão restrito super admin');
  assert(saasCashSourceLabel('asaas_webhook') === 'Asaas', 'label Asaas');
  assert(saasCashSourceLabel('asaas_fee') === 'Tarifa', 'label Tarifa');

  const nav = read('components/master/saas/SaasPanelUi.tsx');
  assert(nav.includes("'caixa'"), 'aba caixa');
  assert(nav.includes('superAdminOnly'), 'aba restrita');
  assert(nav.includes('SaasFinanceStartAtBanner'), 'banner compartilhado');
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
  await testSyncAsaasRespectsCashStartAt();
  await testSyncAsaasDoesNotDuplicate();
  testKpisAfterWithdrawalScenario();
  testExportRespectsFilteredMovements();
  testCashStartAtFiltersWithoutDeleting();
  testDashboardFinanceStartAtFilters();
  testSubscriptionsReceivedRevenueRespectsStartAt();
  testApiAndSecurity();
  testUiLoadsWithoutMovements();
  console.log('mandatory-saas-cash-movements-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
