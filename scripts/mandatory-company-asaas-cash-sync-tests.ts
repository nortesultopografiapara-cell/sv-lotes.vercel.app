/**
 * Testes — sincronização do extrato Asaas no fluxo de caixa das empresas.
 * Execução: npx tsx scripts/mandatory-company-asaas-cash-sync-tests.ts
 */

import {
  mapCompanyAsaasFinancialTransaction,
} from '@/lib/finance/companyAsaasFinancialTransactions';
import {
  resolveCompanyAsaasCashSyncPeriod,
  resetCompanyAsaasCashSyncLocksForTests,
  syncCompanyAsaasCashMovements,
} from '@/lib/finance/companyAsaasCashSync';
import { isCompanyAsaasIntegrationReady } from '@/lib/finance/companyAsaasChargeTypes';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

type CashRow = Record<string, unknown>;

class FakeAdmin {
  cashMovements: CashRow[] = [];
  charges: Array<Record<string, unknown>> = [];
  accounts: Array<Record<string, unknown>> = [];
  integrationMetadata: Record<string, unknown> = {
    connectionStatus: 'CONNECTED',
    accountValidated: true,
    webhook: { active: true },
    cashSync: { lastAt: null },
  };

  from(table: string) {
    const self = this;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let insertPayload: Record<string, unknown>[] | null = null;
    let updatePayload: Record<string, unknown> | null = null;

    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      in() {
        return api;
      },
      is() {
        return api;
      },
      neq() {
        return api;
      },
      filter(col: string, _op: string, val: string) {
        const key = col.replace('metadata->>', '');
        filters.push((r) => {
          const md = (r.metadata as Record<string, unknown>) || {};
          return String(md[key] ?? '') === val;
        });
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: async () => {
        if (table === 'company_financial_accounts') {
          const row = self.accounts.find((a) => filters.every((f) => f(a)));
          return { data: row ?? null, error: null };
        }
        if (table === 'cash_movements') {
          const row = self.cashMovements.find((a) => filters.every((f) => f(a)));
          return { data: row ?? null, error: null };
        }
        if (table === 'company_asaas_charges') {
          const row = self.charges.find((a) => filters.every((f) => f(a)));
          return { data: row ?? null, error: null };
        }
        if (table === 'bank_integrations') {
          return {
            data: { id: 'int-1', metadata: self.integrationMetadata, status: 'ACTIVE' },
            error: null,
          };
        }
        if (table === 'bank_credentials') {
          return {
            data: { encrypted_payload: 'enc:test-key' },
            error: null,
          };
        }
        if (table === 'companies') {
          return { data: { name: 'Meneses' }, error: null };
        }
        if (table === 'bank_charges') {
          return { data: null, error: null, count: 0 };
        }
        return { data: null, error: null };
      },
      single: async () => api.maybeSingle(),
      insert(payload: Record<string, unknown>[]) {
        op = 'insert';
        insertPayload = payload;
        return {
          select() {
            return {
              single: async () => {
                if (table === 'cash_movements' && insertPayload) {
                  const row = { id: `cm-${self.cashMovements.length + 1}`, ...insertPayload[0] };
                  self.cashMovements.push(row);
                  return { data: row, error: null };
                }
                return { data: null, error: null };
              },
            };
          },
        };
      },
      update(payload: Record<string, unknown>) {
        op = 'update';
        updatePayload = payload;
        return {
          eq() {
            return api;
          },
          then: undefined,
        };
      },
    };

    if (op === 'update' && table === 'bank_integrations' && updatePayload) {
      self.integrationMetadata = {
        ...self.integrationMetadata,
        ...(updatePayload.metadata as Record<string, unknown>),
      };
    }

    return api;
  }
}

function readyIntegration() {
  return {
    id: 'int-1',
    companyId: 'company-a',
    companyName: 'Meneses',
    environment: 'SANDBOX' as const,
    status: 'ACTIVE',
    connectionStatus: 'CONNECTED' as const,
    webhookUrl: 'https://example.com/webhook',
    hasSandboxApiKey: true,
    hasProductionApiKey: false,
    hasWebhookToken: true,
    webhookConfigured: true,
    webhookActive: true,
    accountValidated: true,
    features: {
      pix: true,
      boleto: true,
      card: true,
      paymentLink: true,
      autoSync: true,
    },
    sync: { lastAt: null, chargesCount: 0 },
    cashSync: {
      lastAt: null,
      financialAccountId: null,
      environment: null,
      periodFrom: null,
      periodTo: null,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      initiatedBy: null,
      message: null,
    },
    configuredAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastConnectionTestAt: '2026-01-01T00:00:00Z',
    lastConnectionError: null,
  };
}

function readyAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'fa-1',
    companyId: 'company-a',
    name: 'Conta Asaas',
    accountType: 'IMOBILIARIA' as const,
    beneficiaryName: null,
    document: null,
    email: null,
    phone: null,
    environment: 'SANDBOX' as const,
    bankIntegrationId: 'int-1',
    isDefault: true,
    active: true,
    notes: null,
    hasSandboxApiKey: true,
    hasProductionApiKey: false,
    hasWebhookToken: true,
    connectionStatus: 'CONNECTED' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function syncDeps(
  admin: FakeAdmin,
  extras: {
    transactions?: typeof sampleTransactions;
    account?: ReturnType<typeof readyAccount>;
    integration?: ReturnType<typeof readyIntegration>;
  } = {},
) {
  return {
    fetchTransactions: async () => extras.transactions ?? sampleTransactions.slice(0, 2),
    getIntegration: async () => extras.integration ?? readyIntegration(),
    resolveAccount: async () => extras.account ?? readyAccount(),
    loadCredentials: async () => ({
      apiKey: 'tenant-key',
      environment: 'SANDBOX' as const,
      integrationId: 'int-1',
      financialAccountId: 'fa-1',
    }),
    patchMetadata: async () => undefined,
  };
}

const sampleTransactions = [
  { id: 'tx-fee-1', type: 'PAYMENT_FEE', value: -3.5, date: '2026-03-10', description: 'Tarifa' },
  {
    id: 'tx-pix-debit-1',
    type: 'PIX_TRANSACTION_DEBIT',
    value: -500,
    date: '2026-03-11',
    description: 'Pix enviado',
    transferId: 'tr-1',
  },
  {
    id: 'tx-refund-1',
    type: 'PAYMENT_REVERSAL',
    value: -100,
    date: '2026-03-12',
    description: 'Estorno',
    paymentId: 'pay-orphan',
  },
  {
    id: 'tx-payment-1',
    type: 'PAYMENT_RECEIVED',
    value: 950,
    date: '2026-03-13',
    description: 'Recebimento cobrança',
    paymentId: 'pay-reconciled',
  },
];

async function runTests(): Promise<void> {
console.log('\n═══ TESTE 1: Mapper — tarifa ═══');
{
  const mapped = mapCompanyAsaasFinancialTransaction(sampleTransactions[0]);
  assert(!mapped.skip, 'tarifa mapeada');
  assert(mapped.type === 'saida', 'tarifa é saída');
  assert(mapped.category === 'Tarifa Asaas', `categoria tarifa (${mapped.category})`);
}

console.log('\n═══ TESTE 2: Mapper — Pix/transferência enviada ═══');
{
  const mapped = mapCompanyAsaasFinancialTransaction(sampleTransactions[1]);
  assert(mapped.type === 'saida', 'pix débito é saída');
  assert(
    mapped.category === 'Transferência/Saque Asaas',
    `categoria transferência (${mapped.category})`,
  );
}

console.log('\n═══ TESTE 3: Mapper — estorno ═══');
{
  const mapped = mapCompanyAsaasFinancialTransaction(sampleTransactions[2]);
  assert(mapped.type === 'saida', 'estorno negativo é saída');
  assert(mapped.category === 'Estorno', `categoria estorno (${mapped.category})`);
}

console.log('\n═══ TESTE 4: Período incremental com sobreposição ═══');
{
  const period = resolveCompanyAsaasCashSyncPeriod({
    lastCashSyncAt: '2026-03-10T15:00:00Z',
    requestedTo: '2026-03-15',
  });
  assert(period.fromDate === '2026-03-09', `from com overlap (${period.fromDate})`);
  assert(period.toDate === '2026-03-15', `to (${period.toDate})`);
}

console.log('\n═══ TESTE 5: Primeira sincronização limita histórico ═══');
{
  const period = resolveCompanyAsaasCashSyncPeriod({
    accountConfiguredAt: '2026-02-01T00:00:00Z',
    requestedTo: '2026-03-15',
  });
  assert(period.fromDate >= '2026-02-01', `respeita ativação (${period.fromDate})`);
  assert(period.fromDate <= '2026-03-15', 'from antes do to');
}

console.log('\n═══ TESTE 6: Integração sem API Key não está pronta ═══');
{
  assert(
    !isCompanyAsaasIntegrationReady({
      connectionStatus: 'CONNECTED',
      status: 'ACTIVE',
      environment: 'SANDBOX',
      hasSandboxApiKey: false,
      hasProductionApiKey: false,
    }),
    'sem chave = não pronta',
  );
}

console.log('\n═══ TESTE 7: Sincronização bem-sucedida (tarifa + pix) ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();

  const result = await syncCompanyAsaasCashMovements(
    admin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      userId: 'user-1',
    },
    syncDeps(admin, { transactions: sampleTransactions.slice(0, 2) }),
  );

  assert(result.created === 2, `criadas (${result.created})`);
  assert(admin.cashMovements.length === 2, `persistidas (${admin.cashMovements.length})`);
}

console.log('\n═══ TESTE 8: Recebimento já conciliado não duplica ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();
  admin.charges.push({
    id: 'chg-1',
    company_id: 'company-a',
    asaas_payment_id: 'pay-reconciled',
    cash_movement_id: 'cm-existing',
    installment_id: 'inst-1',
  });
  admin.cashMovements.push({
    id: 'cm-existing',
    company_id: 'company-a',
    type: 'entrada',
    status: 'ativo',
    metadata: { provider: 'ASAAS_COMPANY', asaas_payment_id: 'pay-reconciled' },
  });

  const result = await syncCompanyAsaasCashMovements(
    admin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    },
    {
      ...syncDeps(admin, { transactions: [sampleTransactions[3]] }),
    },
  );

  assert(result.skippedReconciledPayment >= 1, 'pagamento conciliado ignorado');
  assert(admin.cashMovements.length === 1, 'sem nova entrada duplicada');
}

console.log('\n═══ TESTE 9: Repetição idempotente (asaas_movement_id) ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();
  admin.cashMovements.push({
    id: 'cm-1',
    company_id: 'company-a',
    type: 'saida',
    status: 'ativo',
    metadata: {
      asaas_movement_id: 'tx-fee-1',
      financial_account_id: 'fa-1',
    },
  });

  const first = await syncCompanyAsaasCashMovements(
    admin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    },
    syncDeps(admin, { transactions: [sampleTransactions[0]] }),
  );
  const second = await syncCompanyAsaasCashMovements(
    admin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    },
    syncDeps(admin, { transactions: [sampleTransactions[0]] }),
  );

  assert(first.skippedDuplicate >= 1, 'primeira ignora existente');
  assert(second.skippedDuplicate >= 1, 'segunda sync ignora duplicata');
  assert(admin.cashMovements.length === 1, 'permanece 1 movimento');
}

console.log('\n═══ TESTE 10: Isolamento — conta de outra empresa ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();

  let threw = false;
  try {
    await syncCompanyAsaasCashMovements(
      admin as never,
      {
        scope: 'company',
        companyId: 'company-a',
        financialAccountId: 'fa-other',
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      },
      {
        ...syncDeps(admin),
        resolveAccount: async () => {
          throw new Error('Conta financeira não encontrada ou inativa para esta empresa.');
        },
      },
    );
  } catch (err) {
    threw = true;
    assert(
      String(err).includes('não encontrada') || String(err).includes('inativa'),
      'bloqueia conta de outra empresa',
    );
  }
  assert(threw, 'lança erro para conta alheia');
}

console.log('\n═══ TESTE 11: Empresa sem conta Asaas ativa ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();

  let threw = false;
  try {
    await syncCompanyAsaasCashMovements(
      admin as never,
      {
        scope: 'company',
        companyId: 'company-a',
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      },
      {
        ...syncDeps(admin),
        getIntegration: async () => ({
          ...readyIntegration(),
          hasSandboxApiKey: false,
          connectionStatus: 'DISCONNECTED',
        }),
      },
    );
  } catch (err) {
    threw = true;
    assert(String(err).includes('não está ativa') || String(err).includes('conta financeira'), 'erro claro sem conta');
  }
  assert(threw, 'falha sem conta');
}

console.log('\n═══ TESTE 12: Paginação — múltiplas páginas agregadas ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();

  const paged = Array.from({ length: 150 }, (_, i) => ({
    id: `tx-page-${i}`,
    type: 'PAYMENT_FEE',
    value: -1,
    date: '2026-03-10',
    description: `Tarifa ${i}`,
  }));

  const result = await syncCompanyAsaasCashMovements(
    admin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    },
    syncDeps(admin, { transactions: paged }),
  );

  assert(result.fetched === 150, `fetched paginado (${result.fetched})`);
  assert(result.created === 150, `criadas paginado (${result.created})`);
}

console.log('\n═══ TESTE 13: Falha parcial não marca tudo como criado ═══');
{
  resetCompanyAsaasCashSyncLocksForTests();
  const admin = new FakeAdmin();
  let insertCount = 0;
  const originalFrom = admin.from.bind(admin);

  const patchedAdmin = {
    from(table: string) {
      const chain = originalFrom(table);
      if (table !== 'cash_movements') return chain;
      return {
        ...chain,
        insert(payload: Record<string, unknown>[]) {
          insertCount += 1;
          if (insertCount === 2) {
            return {
              select() {
                return {
                  single: async () => ({
                    data: null,
                    error: { message: 'falha simulada', code: 'XX000' },
                  }),
                };
              },
            };
          }
          return chain.insert(payload);
        },
      };
    },
  };

  const result = await syncCompanyAsaasCashMovements(
    patchedAdmin as never,
    {
      scope: 'company',
      companyId: 'company-a',
      financialAccountId: 'fa-1',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    },
    syncDeps(admin as never, { transactions: sampleTransactions.slice(0, 2) }),
  );

  assert(result.errors >= 1, `registra falha parcial (${result.errors})`);
  assert(result.created >= 1, 'ainda cria movimentos válidos');
}

console.log('\n═══ TESTE 14: UI — botão no Fluxo de Caixa ═══');
{
  const fs = require('node:fs');
  const page = fs.readFileSync('app/finance/page.tsx', 'utf8');
  assert(page.includes('Sincronizar Asaas'), 'botão no finance page');
  assert(page.includes('/api/finance/asaas/sync-cash'), 'rota sync-cash');
  assert(page.includes('asaasCashSyncVisible'), 'gate de visibilidade');
  assert(page.includes('hasConfiguredAsaasFinancialAccount'), 'gate por conta financeira');
  assert(page.includes('[authLoading, user]'), 'contas financeiras após auth');
  assert(!page.includes('asaasCashSyncAvailable'), 'gate antigo removido');
}

console.log('\n═══ TESTE 15: Master permanece inalterado ═══');
{
  const fs = require('node:fs');
  const masterPanel = fs.readFileSync('components/master/saas/SaasCashPanel.tsx', 'utf8');
  const masterRoute = fs.readFileSync('app/api/master/saas-cash/sync-asaas/route.ts', 'utf8');
  const companySync = fs.readFileSync('lib/finance/companyAsaasCashSync.ts', 'utf8');

  assert(masterPanel.includes('/api/master/saas-cash/sync-asaas'), 'master route intacta');
  assert(!masterPanel.includes('/api/finance/asaas/sync-cash'), 'master não usa rota tenant');
  assert(masterRoute.includes('syncAsaasCashMovements'), 'master usa saas_cash_movements');
  assert(companySync.includes("scope: 'company'"), 'tenant scope explícito');
  assert(companySync.includes('cash_movements'), 'tenant grava cash_movements');
  assert(!companySync.includes('ASAAS_API_KEY'), 'tenant não usa chave master');
}

console.log('\n════════════════════════════════════════════');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  console.error('❌ TESTES FALHARAM');
  process.exit(1);
}
console.log('✅ TODOS OS TESTES PASSARAM');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
