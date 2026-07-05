/**
 * Atualização em lote de status Asaas Company.
 * npx tsx scripts/mandatory-company-asaas-bulk-status-tests.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { bulkUpdateCompanyChargeStatuses } from '../lib/finance/companyAsaasBulkStatusUpdate';

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
  console.log('OK testBulkRouteAndChargesUi');
}

async function main() {
  testBulkRouteAndChargesUi();
  await testBulkSkipsWhenNoChargeRecord();
  console.log('mandatory-company-asaas-bulk-status-tests: all passed');
}

void main();
