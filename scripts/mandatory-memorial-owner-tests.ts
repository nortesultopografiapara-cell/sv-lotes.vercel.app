/**
 * Testes — proprietário do memorial descritivo (cliente da venda).
 * npx tsx scripts/mandatory-memorial-owner-tests.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMemorialPayloadFromRecords } from '../lib/memorial/memorialData';
import { generateMemorialPdf, memorialPdfTextContent } from '../lib/memorial/memorialPdf';
import {
  applyResolvedOwnerToBlock,
  resolveLotOwnerFromBlock,
} from '../lib/lotOwnerResolution';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const BASE_EAST = 50000;
const BASE_NORTH = 7500000;

function utmRectSegments(count: number, w = 12, h = 25): Record<string, unknown>[] {
  const e1 = BASE_EAST + w;
  const n1 = BASE_NORTH + h;
  const corners = [
    { n: BASE_NORTH, e: BASE_EAST },
    { n: BASE_NORTH, e: e1 },
    { n: n1, e: e1 },
    { n: n1, e: BASE_EAST },
  ];
  const segs: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const a = corners[i % 4];
    const b = corners[(i + 1) % 4];
    const dist = i % 2 === 0 ? w : h;
    segs.push({
      segment_index: i,
      vertex_order: i % 4,
      north: a.n,
      east: a.e,
      end_north: b.n,
      end_east: b.e,
      distance: dist,
      segment_type: 'LINE',
    });
  }
  return segs;
}

function lotBlock(num: string, extra: Record<string, unknown> = {}) {
  return {
    id: `lot-${num}`,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    segments_json: utmRectSegments(4),
    area: 300,
    perimeter: 74,
    status: 'Disponível',
    ...extra,
  };
}

type Row = Record<string, unknown>;

function createMockSupabase(fixtures: {
  customers?: Record<string, Row>;
  sales?: Row[];
  contracts?: Record<string, Row>;
}): SupabaseClient {
  const handlers = fixtures;
  return {
    from(table: string) {
      const state: {
        table: string;
        filters: Array<[string, string]>;
        orderCol?: string;
        limitN?: number;
      } = { table, filters: [] };

      const api = {
        select() {
          return api;
        },
        eq(col: string, val: string) {
          state.filters.push([col, val]);
          return api;
        },
        order(col: string) {
          state.orderCol = col;
          return api;
        },
        limit(n: number) {
          state.limitN = n;
          return api;
        },
        async maybeSingle() {
          const id = state.filters.find(([c]) => c === 'id')?.[1];
          if (state.table === 'customers' && id) {
            const row = handlers.customers?.[id] ?? null;
            return { data: row, error: null };
          }
          if (state.table === 'sales' && id) {
            const row = (handlers.sales || []).find((s) => String(s.id) === id) ?? null;
            return { data: row, error: null };
          }
          if (state.table === 'contracts' && id) {
            const row = handlers.contracts?.[id] ?? null;
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
        async single() {
          const res = await api.maybeSingle();
          if (!res.data) return { data: null, error: { message: 'not found' } };
          return res;
        },
        then(onFulfilled: (v: unknown) => unknown) {
          const blockId = state.filters.find(([c]) => c === 'block_id')?.[1];
          if (state.table === 'sales' && blockId) {
            const rows = (handlers.sales || []).filter(
              (s) => String(s.block_id) === blockId,
            );
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        },
      };

      return api;
    },
  } as unknown as SupabaseClient;
}

async function testSoldLotUsesCustomerFromSaleId() {
  const supabase = createMockSupabase({
    customers: {
      'cust-1': { id: 'cust-1', name: 'SEVERINO JOSE DE FRANÇA', document: '12345678901' },
    },
    sales: [{ id: 'sale-1', block_id: 'lot-12', customer_id: 'cust-1' }],
  });

  const block = lotBlock('12', {
    id: 'lot-12',
    status: 'Vendido',
    sale_id: 'sale-1',
  });

  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'SEVERINO JOSE DE FRANÇA', 'cliente da venda');
  assert(resolved.ownerDocument === '12345678901', 'documento do cliente');

  const enriched = applyResolvedOwnerToBlock(block, resolved);
  const payload = buildMemorialPayloadFromRecords({
    block: enriched,
    blockId: 'lot-12',
    project: { name: 'Empreendimento Teste', city: 'Parauapebas', uf: 'PA' },
    allBlocks: [enriched],
    streetGuides: [],
    company: { name: 'Empresa Teste' },
  });
  assert(
    payload.identification.owner === 'SEVERINO JOSE DE FRANÇA',
    'proprietário no memorial',
  );

  const doc = await generateMemorialPdf(payload);
  const text = memorialPdfTextContent(doc);
  assert(text.includes('SEVERINO JOSE DE FRANÇA'), 'pdf com proprietário');
  console.log('OK testSoldLotUsesCustomerFromSaleId');
}

async function testAvailableLotKeepsNotInformed() {
  const supabase = createMockSupabase({
    customers: {
      'cust-1': { id: 'cust-1', name: 'Cliente Indevido' },
    },
  });
  const block = lotBlock('05', { id: 'lot-05', status: 'Disponível', customer_id: 'cust-1' });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'Não informado', 'disponível sem proprietário');
  console.log('OK testAvailableLotKeepsNotInformed');
}

async function testReservedLotUsesCustomerId() {
  const supabase = createMockSupabase({
    customers: {
      'cust-2': { id: 'cust-2', name: 'MARIA RESERVA' },
    },
  });
  const block = lotBlock('08', {
    id: 'lot-08',
    status: 'Reservado',
    customer_id: 'cust-2',
  });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'MARIA RESERVA', 'reserva com cliente');
  console.log('OK testReservedLotUsesCustomerId');
}

async function testSoldWithoutCustomerFallsBackToBlockName() {
  const supabase = createMockSupabase({ sales: [], customers: {} });
  const block = lotBlock('09', {
    id: 'lot-09',
    status: 'Vendido',
    customer_name: 'CLIENTE LEGADO NO BLOCO',
  });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'CLIENTE LEGADO NO BLOCO', 'fallback cadastral');
  console.log('OK testSoldWithoutCustomerFallsBackToBlockName');
}

async function testSoldWithoutAnyCustomerStaysNotInformed() {
  const supabase = createMockSupabase({ sales: [], customers: {} });
  const block = lotBlock('10', { id: 'lot-10', status: 'Vendido' });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'Não informado', 'fallback seguro');
  console.log('OK testSoldWithoutAnyCustomerStaysNotInformed');
}

async function testSoldLotUsesCustomerIdDirect() {
  const supabase = createMockSupabase({
    customers: {
      'cust-3': { id: 'cust-3', name: 'SEVERINO JOSE DE FRANÇA' },
    },
  });
  const block = lotBlock('21', {
    id: 'lot-21',
    status: 'Vendido',
    customer_id: 'cust-3',
  });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'SEVERINO JOSE DE FRANÇA', 'customer_id direto');
  console.log('OK testSoldLotUsesCustomerIdDirect');
}

async function testSoldLotUsesContractId() {
  const supabase = createMockSupabase({
    customers: {
      'cust-4': { id: 'cust-4', name: 'CLIENTE VIA CONTRATO' },
    },
    contracts: {
      'contract-1': { id: 'contract-1', customer_id: 'cust-4' },
    },
  });
  const block = lotBlock('11', {
    id: 'lot-11',
    status: 'Vendido',
    contract_id: 'contract-1',
  });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'CLIENTE VIA CONTRATO', 'contract_id');
  console.log('OK testSoldLotUsesContractId');
}

async function testSoldLotUsesLatestSaleByBlockId() {
  const supabase = createMockSupabase({
    customers: {
      'cust-5': { id: 'cust-5', name: 'CLIENTE ULTIMA VENDA' },
    },
    sales: [
      { id: 'sale-old', block_id: 'lot-14', customer_id: 'cust-5', created_at: '2025-01-01' },
      { id: 'sale-new', block_id: 'lot-14', customer_id: 'cust-5', created_at: '2026-07-08' },
    ],
  });
  const block = lotBlock('14', { id: 'lot-14', status: 'Vendido' });
  const resolved = await resolveLotOwnerFromBlock(supabase, block);
  assert(resolved.owner === 'CLIENTE ULTIMA VENDA', 'ultima venda do block_id');
  console.log('OK testSoldLotUsesLatestSaleByBlockId');
}

async function main() {
  await testSoldLotUsesCustomerFromSaleId();
  await testSoldLotUsesCustomerIdDirect();
  await testSoldLotUsesContractId();
  await testSoldLotUsesLatestSaleByBlockId();
  await testAvailableLotKeepsNotInformed();
  await testReservedLotUsesCustomerId();
  await testSoldWithoutCustomerFallsBackToBlockName();
  await testSoldWithoutAnyCustomerStaysNotInformed();
  console.log('OK — mandatory-memorial-owner-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
