/**
 * Atualização em lote de status Asaas Company.
 * npx tsx scripts/mandatory-company-asaas-bulk-status-tests.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { bulkUpdateCompanyChargeStatuses } from '../lib/finance/companyAsaasBulkStatusUpdate';
import { listChargesNotUpdatedForAccount } from '../lib/charges/chargeBulkStatusSync';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testBulkSkipsWhenNoChargeRecord() {
  const charges: Record<string, Record<string, unknown>> = {};
  const receipts: Record<string, Record<string, unknown>> = {
    'inst-1': { id: 'inst-1', status: 'pendente' },
  };

  const admin = {
    from(table: string) {
      const ctx: {
        table: string;
        filters: Array<{ col: string; val: unknown }>;
        op: 'select';
        order?: { col: string; asc: boolean };
        limitN?: number;
      } = { table, filters: [], op: 'select' };

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.filters.push({ col, val });
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          ctx.order = { col, asc: opts?.ascending ?? true };
          return builder;
        },
        limit(n: number) {
          ctx.limitN = n;
          return builder;
        },
        maybeSingle: async () => {
          if (ctx.table === 'company_asaas_charges') {
            let rows = Object.values(charges);
            for (const f of ctx.filters) {
              rows = rows.filter((r) => r[f.col] === f.val);
            }
            if (ctx.order?.col === 'created_at') rows = [...rows].reverse();
            if (ctx.limitN) rows = rows.slice(0, ctx.limitN);
            return { data: rows[0] ?? null, error: null };
          }
          if (ctx.table === 'finance_receipts') {
            const id = String(ctx.filters.find((f) => f.col === 'id')?.val || '');
            return { data: receipts[id] ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  const result = await bulkUpdateCompanyChargeStatuses(admin, 'company-1', ['inst-1']);
  assert(result.skipped === 1, 'sem cobrança ignora');
  assert(result.items[0]?.status === 'skipped', 'item skipped');
  console.log('OK testBulkSkipsWhenNoChargeRecord');
}

function testBulkRouteAndChargesUi() {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/finance/asaas/update-charge-status-bulk/route.ts'),
    'utf8',
  );
  assert(route.includes('bulkUpdateCompanyChargeStatuses'), 'rota bulk usa serviço');
  const syncClient = fs.readFileSync(
    path.join(process.cwd(), 'lib/charges/chargeBulkStatusSync.ts'),
    'utf8',
  );
  assert(syncClient.includes('/api/finance/asaas/update-charge-status-bulk'), 'client bulk endpoint');
  assert(
    syncClient.includes('withCompanyAsaasChargeShareFieldsPreserved'),
    'bulk merge preserva URLs WhatsApp',
  );

  const page = fs.readFileSync(
    path.join(process.cwd(), 'components/charges/ChargesPageClient.tsx'),
    'utf8',
  );
  assert(page.includes('requestChargeBulkStatusSync'), 'UI usa sync bulk');
  assert(page.includes('Atualizar todas as cobranças'), 'botão atualizar todas');
  assert(page.includes('syncAsaasStatuses'), 'atualizar lista sincroniza Asaas');
  assert(
    page.includes('overviewGateAllowsPerChargeAsaasSync'),
    'consulta geral com várias contas não bloqueia o lote',
  );
  const refreshAll = page.slice(
    page.indexOf('const runRefreshAllCharges'),
    page.indexOf('const handleRefreshList'),
  );
  assert(refreshAll.indexOf('handleRefreshInter') < refreshAll.indexOf('syncAsaasChargeStatuses'), 'Inter segue mesmo se o Asaas falhar depois');
  assert(page.includes('reconcilePaidReceipts: false'), 'abertura permanece só com leitura local');
  console.log('OK testBulkRouteAndChargesUi');
}

function chargeRow(input: {
  id: string;
  installmentId: string;
  companyId: string;
  financialAccountId: string | null;
}) {
  return {
    id: input.id,
    company_id: input.companyId,
    customer_id: null,
    sale_id: null,
    installment_id: input.installmentId,
    asaas_payment_id: `pay-${input.id}`,
    billing_type: 'BOLETO',
    status: 'PENDING',
    value: 10,
    due_date: '2026-12-01',
    invoice_url: null,
    bank_slip_url: null,
    bank_slip_identification: null,
    pix_qr_code: null,
    pix_copy_paste: null,
    financial_account_id: input.financialAccountId,
    raw_payload: {},
    created_at: '2026-11-01T00:00:00.000Z',
  };
}

async function testMultiAccountSyncUsesPersistedAccountAndIsolatesFailures() {
  const charges = [
    chargeRow({ id: 'ch-a', installmentId: 'inst-a', companyId: 'company-multi', financialAccountId: 'fa-a' }),
    chargeRow({ id: 'ch-b', installmentId: 'inst-b', companyId: 'company-multi', financialAccountId: 'fa-b' }),
    chargeRow({ id: 'ch-missing', installmentId: 'inst-missing', companyId: 'company-multi', financialAccountId: null }),
    chargeRow({
      id: 'ch-foreign',
      installmentId: 'inst-foreign',
      companyId: 'company-multi',
      financialAccountId: 'fa-other-company',
    }),
    chargeRow({ id: 'ch-single', installmentId: 'inst-single', companyId: 'company-single', financialAccountId: 'fa-only' }),
  ];
  const accountLookups: Array<{ companyId: string; accountId: string }> = [];

  const admin = {
    from(table: string) {
      const ctx: {
        table: string;
        filters: Array<{ col: string; val: unknown }>;
      } = { table, filters: [] };
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.filters.push({ col, val });
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (value: { data: never[]; error: null }) => void) {
          resolve({ data: [], error: null });
        },
        limit() {
          return builder;
        },
        maybeSingle: async () => {
          if (ctx.table === 'company_asaas_charges') {
            let rows = charges.slice();
            for (const filter of ctx.filters) {
              rows = rows.filter((row) => row[filter.col as keyof typeof row] === filter.val);
            }
            return { data: rows[0] ?? null, error: null };
          }
          if (ctx.table === 'finance_receipts') {
            return { data: { id: ctx.filters.find((f) => f.col === 'id')?.val, status: 'pendente' }, error: null };
          }
          if (ctx.table === 'company_financial_accounts') {
            const companyId = String(ctx.filters.find((f) => f.col === 'company_id')?.val || '');
            const accountId = String(ctx.filters.find((f) => f.col === 'id')?.val || '');
            accountLookups.push({ companyId, accountId });
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  const multi = await bulkUpdateCompanyChargeStatuses(admin, 'company-multi', [
    'inst-a',
    'inst-b',
    'inst-missing',
    'inst-foreign',
  ]);
  assert(multi.failed === 4, 'as quatro cobranças multi-conta terminam sem atualização remota simulada');
  assert(multi.items.length === 4, 'nenhuma cobrança é abandonada no meio do lote');
  const looked = accountLookups.filter((item) => item.companyId === 'company-multi').map((item) => item.accountId);
  assert(looked.includes('fa-a') && looked.includes('fa-b'), 'cada cobrança consulta a própria conta');
  assert(!looked.includes('fa-only'), 'conta da outra empresa não é escolhida');
  assert(looked.includes('fa-other-company'), 'conta gravada é consultada dentro da empresa do pedido');
  assert(
    accountLookups.every((item) => item.companyId === 'company-multi'),
    'a busca da conta fica restrita à empresa da cobrança',
  );
  const missing = multi.items.find((item) => item.installmentId === 'inst-missing');
  assert(
    Boolean(missing?.error?.includes('sem conta financeira')),
    'conta ausente é informada e não é substituída',
  );
  assert(!accountLookups.some((item) => item.accountId === ''), 'conta vazia não vira consulta');
  const blocked = listChargesNotUpdatedForAccount(multi.items);
  assert(blocked.includes('inst-missing') && blocked.includes('inst-foreign'), 'a tela lista as cobranças sem conta válida');
  assert(blocked.includes('inst-a') && blocked.includes('inst-b'), 'falha de credencial simulada também fica identificada');

  accountLookups.length = 0;
  const single = await bulkUpdateCompanyChargeStatuses(admin, 'company-single', ['inst-single']);
  assert(single.failed === 1, 'empresa com uma conta também usa a conta da cobrança');
  assert(
    accountLookups.length === 1 &&
      accountLookups[0]?.companyId === 'company-single' &&
      accountLookups[0]?.accountId === 'fa-only',
    'empresa sem Inter consulta somente a conta vinculada',
  );
  console.log('OK testMultiAccountSyncUsesPersistedAccountAndIsolatesFailures');
}

async function main() {
  testBulkRouteAndChargesUi();
  await testBulkSkipsWhenNoChargeRecord();
  await testMultiAccountSyncUsesPersistedAccountAndIsolatesFailures();
  console.log('mandatory-company-asaas-bulk-status-tests: all passed');
}

void main();
