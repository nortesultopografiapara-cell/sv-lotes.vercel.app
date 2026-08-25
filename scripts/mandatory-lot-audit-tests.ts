/**
 * Auditoria operacional por lote (lot_audit_logs).
 * npx tsx scripts/mandatory-lot-audit-tests.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLotAuditPayload,
  formatLotAuditEvent,
  logLotAuditEvent,
  sortLotAuditHistory,
  type LotAuditLogRow,
} from '../lib/lotAudit';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testBuildPayload() {
  const payload = buildLotAuditPayload({
    blockId: 'block-1',
    companyId: 'tenant-1',
    projectId: 'proj-1',
    saleId: 'sale-1',
    userId: 'user-1',
    action: 'sold',
    title: 'Venda concluída',
    description: 'Teste',
    source: 'sale_flow',
  });
  assert(payload.block_id === 'block-1', 'block_id');
  assert(payload.lot_id === 'block-1', 'lot_id default');
  assert(payload.action === 'sold', 'action');
  assert(payload.source === 'sale_flow', 'source');
  console.log('OK testBuildPayload');
}

async function testLogFailureSilent() {
  const failingSupabase = {
    from() {
      return {
        insert() {
          return Promise.resolve({ error: { message: 'simulated failure' } });
        },
      };
    },
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await logLotAuditEvent(failingSupabase, {
      blockId: 'b1',
      action: 'sold',
      title: 'x',
      source: 'sale_flow',
    });
  } catch {
    threw = true;
  }
  assert(!threw, 'log não deve lançar erro');

  const throwingSupabase = {
    from() {
      throw new Error('network down');
    },
  } as unknown as SupabaseClient;
  threw = false;
  try {
    await logLotAuditEvent(throwingSupabase, {
      blockId: 'b1',
      action: 'sold',
      title: 'x',
      source: 'sale_flow',
    });
  } catch {
    threw = true;
  }
  assert(!threw, 'exceção interna não deve propagar');
  console.log('OK testLogFailureSilent');
}

function testActionPayloads() {
  const cases: Array<{ action: LotAuditLogRow['action']; title: string }> = [
    { action: 'sold', title: 'Venda concluída' },
    { action: 'reserved', title: 'Lote reservado' },
    { action: 'contract_generated', title: 'Contrato gerado' },
    { action: 'contract_regenerated', title: 'Contrato regenerado' },
    { action: 'front_corrected', title: 'Frente corrigida' },
    { action: 'confrontation_auto', title: 'Confrontação automática' },
    { action: 'confrontation_manual', title: 'Confrontação manual alterada' },
    { action: 'confrontation_manual', title: 'Confrontação manual removida' },
    {
      action: 'official_measure_side_changed',
      title: 'Lado oficial da medida alterado',
    },
  ];
  for (const c of cases) {
    const p = buildLotAuditPayload({
      blockId: 'lot-1',
      action: c.action,
      title: c.title,
      source: 'gis_map',
    });
    assert(p.action === c.action, `action ${c.action}`);
    assert(p.title === c.title, `title ${c.action}`);
  }
  console.log('OK testActionPayloads');
}

function testSortHistoryDesc() {
  const rows: LotAuditLogRow[] = [
    {
      id: '1',
      company_id: null,
      project_id: null,
      block_id: 'b',
      lot_id: 'b',
      sale_id: null,
      contract_id: null,
      user_id: null,
      action: 'reserved',
      title: 'A',
      description: null,
      old_data: null,
      new_data: null,
      created_at: '2026-06-01T10:00:00Z',
      source: 'sale_flow',
    },
    {
      id: '2',
      company_id: null,
      project_id: null,
      block_id: 'b',
      lot_id: 'b',
      sale_id: null,
      contract_id: null,
      user_id: null,
      action: 'sold',
      title: 'B',
      description: null,
      old_data: null,
      new_data: null,
      created_at: '2026-06-09T10:00:00Z',
      source: 'sale_flow',
    },
  ];
  const sorted = sortLotAuditHistory(rows);
  assert(sorted[0].id === '2', 'mais recente primeiro');
  console.log('OK testSortHistoryDesc');
}

function testFormatEvent() {
  const formatted = formatLotAuditEvent({
    id: 'e1',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: null,
    contract_id: null,
    user_id: 'u1',
    action: 'sold',
    title: 'Venda concluída',
    description: 'Cliente X',
    old_data: null,
    new_data: null,
    created_at: '2026-06-09T10:15:00Z',
    source: 'sale_flow',
  });
  assert(formatted.actionLabel === 'Venda', 'badge label');
  assert(formatted.title === 'Venda concluída', 'title');
  assert(formatted.badgeClass.includes('emerald'), 'sold badge');
  assert(formatted.saleId === null, 'saleId nulo quando ausente');
  const cancelled = formatLotAuditEvent({
    id: 'e2',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: 'sale-homolog',
    contract_id: null,
    user_id: 'u1',
    action: 'sale_cancelled',
    title: 'Lote liberado — venda encerrada',
    description: 'Desistência do cliente',
    old_data: null,
    new_data: { motiveCode: 'desistencia' },
    created_at: '2026-06-09T10:15:00Z',
    source: 'gis_map',
  });
  assert(cancelled.saleId === 'sale-homolog', 'saleId no histórico');
  assert(cancelled.motiveCode === 'desistencia', 'motivo no new_data');
  console.log('OK testFormatEvent');
}

function testEmptyHistorySafe() {
  const empty = sortLotAuditHistory([]);
  assert(empty.length === 0, 'histórico vazio');
  const formatted = empty.map((r) => formatLotAuditEvent(r));
  assert(formatted.length === 0, 'popup vazio não quebra formatação');
  console.log('OK testEmptyHistorySafe');
}

async function main() {
  testBuildPayload();
  await testLogFailureSilent();
  testActionPayloads();
  testSortHistoryDesc();
  testFormatEvent();
  testEmptyHistorySafe();
  console.log('\nTodos os testes de auditoria de lote passaram.');
}

void main();
