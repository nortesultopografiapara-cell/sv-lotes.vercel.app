/**
 * P1 — fundação persistente da Transferência de titularidade.
 * npx tsx scripts/mandatory-sale-title-transfer-phase1-tests.ts
 */
import fs from 'node:fs';
import path from 'path';
import {
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  showsTerminationSettlement,
} from '../lib/finance/releaseLotShared';
import {
  isSaleTitleTransferOperation,
  isSaleTitleTransferStatus,
  isTitleTransferScheduleMode,
  SALE_TITLE_TRANSFER_INFLIGHT_STATUSES,
  SALE_TITLE_TRANSFER_OPERATION_CODE,
  SALE_TITLE_TRANSFER_STATUSES,
  SALE_TITLE_TRANSFER_TABLE,
  TITLE_TRANSFER_DOCUMENT_PREFIX,
  TITLE_TRANSFER_LOT_REQUIRED_STATUS,
} from '../lib/finance/saleTitleTransfer';
import { isSaleLotSwapOperation } from '../lib/finance/saleLotSwap';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testSchemaAndTypes() {
  const sql = read('supabase/migrations/20261016120000_sale_title_transfers.sql');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.sale_title_transfers'), 'tabela');
  assert(SALE_TITLE_TRANSFER_TABLE === 'sale_title_transfers', 'constante tabela');
  assert(SALE_TITLE_TRANSFER_OPERATION_CODE === 'transferencia_titularidade', 'código UI');
  assert(TITLE_TRANSFER_DOCUMENT_PREFIX === 'TT', 'prefixo TT');
  assert(TITLE_TRANSFER_LOT_REQUIRED_STATUS === 'Vendido', 'lote permanece vendido');
  for (const col of [
    'company_id',
    'tenant_id',
    'sale_id',
    'block_id',
    'from_customer_id',
    'to_customer_id',
    'previous_transfer_id',
    'from_contract_id',
    'to_contract_id',
    'declared_agio_amount',
    'schedule_mode',
    'financial_snapshot',
    'charges_phase',
    'status',
    'idempotency_key',
  ]) {
    assert(sql.includes(col), `coluna ${col}`);
  }
  assert(sql.includes('from_customer_id <> to_customer_id'), 'titulares distintos');
  assert(sql.includes('previous_transfer_id'), 'cadeia A→B→C');
  assert(sql.includes('sale_title_transfers_sale_inflight_uidx'), 'inflight por venda');
  assert(sql.includes("WHERE status IN ('CALCULATED', 'EXECUTING')"), 'EXECUTED histórico permitido');
  assert(sql.includes('sale_title_transfers_tenant_all'), 'RLS tenant');
  assert(sql.includes('current_tenant_id()'), 'isolamento');
  assert(sql.includes('is_super_admin()'), 'super admin');
  assert(sql.includes('GRANT SELECT, INSERT, UPDATE'), 'authenticated sem DELETE');
  assert(!sql.includes('GRANT DELETE'), 'sem DELETE autenticado');
  assert(!/\bDROP TABLE\b/i.test(sql), 'sem DROP TABLE');
  assert(!/\bDROP COLUMN\b/i.test(sql), 'sem DROP COLUMN');
  assert(!/\bDELETE FROM\b/i.test(sql), 'sem DELETE FROM');
  assert(!/\bTRUNCATE\b/i.test(sql), 'sem TRUNCATE');
  assert(!/\bALTER TABLE public\.sale_lot_swaps\b/i.test(sql), 'não altera sale_lot_swaps');
  assert(!/\bCREATE OR REPLACE FUNCTION public\.execute_sale_lot_swap\b/i.test(sql), 'sem RPC da troca');
  assert(!sql.includes('seller_parties_json'), 'sem Mundo Novo');
  assert(!/ALTER TABLE public\.contracts\b/i.test(sql), 'não altera contracts');
  assert(!/ALTER TABLE public\.finance_receipts\b/i.test(sql), 'não altera parcelas');
  assert(!/ALTER TABLE public\.sales\b/i.test(sql), 'não altera sales');
  assert(!/ALTER TABLE public\.blocks\b/i.test(sql), 'não altera blocks');
  for (const st of SALE_TITLE_TRANSFER_STATUSES) {
    assert(isSaleTitleTransferStatus(st), `status ${st}`);
  }
  assert(SALE_TITLE_TRANSFER_INFLIGHT_STATUSES.join(',') === 'CALCULATED,EXECUTING', 'inflight');
  assert(isTitleTransferScheduleMode('ASSUME_CURRENT'), 'modo A');
  assert(isTitleTransferScheduleMode('RECALCULATE'), 'modo B');
  assert(isSaleTitleTransferOperation('transferencia_titularidade'), 'operação');
  assert(!isSaleTitleTransferOperation('troca_lote'), 'não é troca');
  console.log('OK testSchemaAndTypes');
}

function testIsolationFromOtherFlows() {
  assert(isDeferredSaleOperation('transferencia_titularidade'), 'ainda diferida do /release');
  assert(!isLotReleaseSaleOperation('transferencia_titularidade'), 'não libera lote');
  assert(!showsTerminationSettlement('transferencia_titularidade'), 'sem acerto de rescisão');
  assert(isSaleLotSwapOperation('troca_lote'), 'troca intacta');
  assert(!isSaleLotSwapOperation('transferencia_titularidade'), 'titularidade ≠ troca');
  const apply = read('scripts/develop/apply-sale-title-transfers.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('PRODUCTION_PROJECT_REF'), 'bloqueia Production');
  assert(apply.includes(DEVELOP_PROJECT_REF), 'ref DEVELOP');
  assert(!apply.includes('LOT_SWAP_EXTERNAL_CHARGES_LIVE'), 'sem LIVE da troca');
  console.log('OK testIsolationFromOtherFlows');
}

function testProductionRefsUntouched() {
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production conhecida');
  console.log('OK testProductionRefsUntouched');
}

function main() {
  testSchemaAndTypes();
  testIsolationFromOtherFlows();
  testProductionRefsUntouched();
  console.log('OK mandatory-sale-title-transfer-phase1-tests');
}

main();
