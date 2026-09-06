/**
 * Fase 1 — fundação persistente da Troca de lote.
 * npx tsx scripts/mandatory-sale-lot-swap-phase1-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  showsTerminationSettlement,
} from '../lib/finance/releaseLotShared';
import { isSaleReleaseSettlementOperation } from '../lib/finance/saleReleaseSettlement';
import {
  assertSaleLotSwapFinancialsPersistable,
  deriveSaleLotSwapFinancials,
  formatLotSwapDocumentNumber,
  isLotSwapDocumentType,
  isLotSwapV1DestinationStatusAllowed,
  isSaleLotSwapOperation,
  isSaleLotSwapStatus,
  isSameProjectLotSwap,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  LOT_SWAP_DESTINATION_AFTER_EXECUTE_STATUS,
  LOT_SWAP_DOCUMENT_PREFIX,
  LOT_SWAP_DOCUMENT_TITLE,
  LOT_SWAP_SOURCE_AFTER_EXECUTE_STATUS,
  LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS,
  LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES,
  LOT_SWAP_V1_SAME_PROJECT_ONLY,
  SALE_DOCUMENT_LOT_SWAP_TYPES,
  SALE_DOCUMENT_TYPE_TROCA_LOTE,
  SALE_DOCUMENT_TYPE_TROCA_LOTE_ASSINADO,
  SALE_LOT_SWAP_INFLIGHT_STATUSES,
  SALE_LOT_SWAP_OPERATION_CODE,
  SALE_LOT_SWAP_STATUSES,
  SALE_LOT_SWAP_TABLE,
  v1TransferableCreditFromAppropriatedPayments,
} from '../lib/finance/saleLotSwap';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import {
  isOriginalTerminationDocumentType,
  isSaleOperationGeneratedType,
  isSignedTerminationDocumentType,
  SALE_DOCUMENT_LOT_SWAP_TYPES as SALE_DOC_LOT_SWAP_TYPES,
  SALE_DOCUMENT_TYPE_LABELS,
  validateSaleDocumentType,
} from '../lib/saleDocuments';
import { terminationDocumentPrefixForType } from '../lib/termination-documents/documentKinds';
import {
  LOT_SWAP_DOCUMENT_PREFIX as NUMBERING_TL,
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
  TERMINATION_DOCUMENT_PREFIX_DISTRATO,
  TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA,
  formatSaleOperationDocumentNumber,
  isValidSaleOperationDocumentNumber,
} from '../lib/termination-documents/numbering';
import {
  isDistratoTerminationOperation,
  isInadimplenciaTerminationOperation,
} from '../lib/termination-documents/titles';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(__dirname, '..', rel));
}

function testSchemaAndTypes() {
  const sql = read('supabase/migrations/20261013120000_sale_lot_swaps.sql');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.sale_lot_swaps'), 'tabela sale_lot_swaps');
  assert(SALE_LOT_SWAP_TABLE === 'sale_lot_swaps', 'constante da tabela');
  for (const col of [
    'company_id',
    'tenant_id',
    'sale_id',
    'customer_id',
    'from_project_id',
    'from_block_id',
    'to_project_id',
    'to_block_id',
    'from_contract_id',
    'to_contract_id',
    'old_sale_price',
    'new_lot_price',
    'total_paid',
    'transferable_credit',
    'old_balance',
    'price_difference',
    'new_balance',
    'financial_snapshot',
    'reason',
    'operator_user_id',
    'executed_at',
    'status',
    'idempotency_key',
    'document_number',
    'document_id',
    'created_at',
    'updated_at',
  ]) {
    assert(sql.includes(col), `coluna ${col}`);
  }
  assert(sql.includes('numeric(14,2)'), 'precisão financeira do padrão operacional');
  assert(sql.includes("jsonb NOT NULL DEFAULT '{}'::jsonb"), 'financial_snapshot jsonb');
  assert(sql.includes('sale_lot_swaps_idempotency_uidx'), 'unique idempotency_key');
  assert(sql.includes('(company_id, idempotency_key)'), 'idempotência por empresa');
  assert(sql.includes('sale_lot_swaps_sale_inflight_uidx'), 'unique em voo por venda');
  assert(sql.includes("WHERE status IN ('CALCULATED', 'EXECUTING')"), 'histórico EXECUTED permitido');
  assert(sql.includes('sale_lot_swaps_tenant_all'), 'RLS tenant');
  assert(sql.includes('current_tenant_id()'), 'isolamento por empresa');
  assert(sql.includes('is_super_admin()'), 'super admin RLS');
  assert(sql.includes('GRANT SELECT, INSERT, UPDATE'), 'authenticated sem DELETE');
  assert(!sql.includes('GRANT DELETE'), 'histórico sem delete autenticado');
  assert(!/\bDROP TABLE\b/i.test(sql), 'sem DROP TABLE');
  assert(!/\bDELETE FROM\b/i.test(sql), 'sem DELETE');
  assert(!/\bTRUNCATE\b/i.test(sql), 'sem TRUNCATE');
  assert(!sql.includes("'PREVIEW'"), 'não persiste PREVIEW');
  assert(!sql.includes('retention_percent'), 'sem retenção de rescisão');
  assert(!sql.includes('ALTER TABLE public.sale_release_settlements'), 'não altera settlement');
  assert(!sql.includes('CREATE TABLE IF NOT EXISTS public.sale_release_settlements'), 'não recria settlement');
  assert(sql.includes('NÃO reutiliza sale_release_settlements'), 'isolamento declarado');
  assert(sql.includes('CALCULATED'), 'status CALCULATED');
  assert(sql.includes('EXECUTING'), 'status EXECUTING');
  assert(sql.includes('EXECUTED'), 'status EXECUTED');
  assert(sql.includes('FAILED'), 'status FAILED');
  assert(SALE_LOT_SWAP_STATUSES.join(',') === 'CALCULATED,EXECUTING,EXECUTED,FAILED', 'status TS');
  assert(SALE_LOT_SWAP_INFLIGHT_STATUSES.join(',') === 'CALCULATED,EXECUTING', 'inflight');
  assert(isSaleLotSwapStatus('EXECUTED'), 'EXECUTED válido');
  assert(!isSaleLotSwapStatus('PREVIEW'), 'PREVIEW não é status persistido');
  assert(!isSaleLotSwapStatus('DRAFT'), 'DRAFT não entra na troca');
  console.log('OK testSchemaAndTypes');
}

function testPrefixTl() {
  assert(LOT_SWAP_DOCUMENT_PREFIX === 'TL', 'prefixo TL');
  assert(NUMBERING_TL === 'TL', 'TL na numeração compartilhada');
  assert(TERMINATION_DOCUMENT_PREFIX_DESISTENCIA === 'TD', 'TD intacto');
  assert(TERMINATION_DOCUMENT_PREFIX_DISTRATO === 'DT', 'DT intacto');
  assert(TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA === 'IN', 'IN intacto');
  const reserved = [
    TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
    TERMINATION_DOCUMENT_PREFIX_DISTRATO,
    TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA,
    LOT_SWAP_DOCUMENT_PREFIX,
  ];
  assert(new Set(reserved).size === 4, 'prefixos distintos');
  const sample = formatLotSwapDocumentNumber(1, 2026);
  assert(sample === 'TL-000000001/2026', 'convenção TL-000000001/2026');
  assert(sample === formatSaleOperationDocumentNumber('TL', 1, 2026), 'mesma RPC/formatador');
  assert(isValidSaleOperationDocumentNumber(sample), 'padrão A-Z{2}-9 dígitos/ano');
  assert(terminationDocumentPrefixForType('troca_lote') !== 'TL', 'helper de encerramento não emite TL');
  assert(
    terminationDocumentPrefixForType('desistencia') === 'TD',
    'Desistência continua TD',
  );
  console.log('OK testPrefixTl');
}

function testDocumentTypesRegisteredNotGenerated() {
  assert(SALE_DOCUMENT_TYPE_TROCA_LOTE === 'TROCA_LOTE', 'tipo original');
  assert(SALE_DOCUMENT_TYPE_TROCA_LOTE_ASSINADO === 'TROCA_LOTE_ASSINADO', 'tipo assinado');
  assert(
    SALE_DOCUMENT_LOT_SWAP_TYPES.join(',') === SALE_DOC_LOT_SWAP_TYPES.join(','),
    'tipos alinhados saleDocuments',
  );
  assert(
    validateSaleDocumentType('SYSTEM_GENERATED', 'TROCA_LOTE').valid,
    'TROCA_LOTE system-generated',
  );
  assert(
    validateSaleDocumentType('SYSTEM_GENERATED', 'TROCA_LOTE_ASSINADO').valid,
    'TROCA_LOTE_ASSINADO system-generated',
  );
  assert(isSaleOperationGeneratedType('TROCA_LOTE'), 'gerado pelo sistema');
  assert(isLotSwapDocumentType('TROCA_LOTE'), 'helper de tipo da troca');
  assert(!isOriginalTerminationDocumentType('TROCA_LOTE'), 'não é termo de encerramento');
  assert(!isSignedTerminationDocumentType('TROCA_LOTE_ASSINADO'), 'assinado de troca ≠ encerramento');
  assert(
    SALE_DOCUMENT_TYPE_LABELS.TROCA_LOTE.includes('Troca de Lote'),
    'rótulo do termo aditivo',
  );
  assert(LOT_SWAP_DOCUMENT_TITLE.includes('TROCA DE LOTE'), 'título reservado Fase 6');
  const swapMod = read('lib/finance/saleLotSwap.ts');
  assert(!swapMod.includes('jsPDF'), 'Fase 1 sem PDF');
  assert(!swapMod.includes('html2pdf'), 'Fase 1 sem html2pdf');
  assert(!exists('lib/lot-swap-documents'), 'sem pasta de PDF da troca');
  console.log('OK testDocumentTypesRegisteredNotGenerated');
}

function testFinancialModelSeparated() {
  const appropriated = 40000;
  const d = deriveSaleLotSwapFinancials({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    totalPaid: appropriated,
    transferableCredit: v1TransferableCreditFromAppropriatedPayments(appropriated),
  });
  assert(d.fields.total_paid === 40000, 'total_paid');
  assert(d.fields.transferable_credit === 40000, 'V1 crédito = apropriado ao preço');
  assert(d.fields.old_sale_price === 100000, 'old_sale_price');
  assert(d.fields.old_balance === 60000, 'old_balance = preço antigo - total_paid');
  assert(d.fields.new_lot_price === 120000, 'new_lot_price');
  assert(d.fields.price_difference === 20000, 'price_difference');
  assert(d.fields.new_balance === 80000, 'new_balance = novo preço - crédito');
  assert(!d.blocked, 'não bloqueia quando crédito <= preço novo');
  assertSaleLotSwapFinancialsPersistable(d);

  const futureSplit = deriveSaleLotSwapFinancials({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    totalPaid: 45000,
    transferableCredit: 40000,
  });
  assert(futureSplit.fields.total_paid === 45000, 'total_paid pode incluir outros componentes');
  assert(futureSplit.fields.transferable_credit === 40000, 'crédito classificado permanece separado');
  assert(futureSplit.fields.new_balance === 80000, 'new_balance usa crédito, não total_paid');

  const excess = deriveSaleLotSwapFinancials({
    oldSalePrice: 100000,
    newLotPrice: 50000,
    totalPaid: 80000,
    transferableCredit: 80000,
  });
  assert(excess.blocked, 'crédito > preço novo bloqueia');
  assert(excess.blockCode === LOT_SWAP_CREDIT_EXCEEDS_PRICE, 'código de bloqueio');
  assert(excess.fields.new_balance === -30000, 'saldo negativo calculado, não restituído');
  let threw = false;
  try {
    assertSaleLotSwapFinancialsPersistable(excess);
  } catch (e) {
    threw = e instanceof Error && e.message === LOT_SWAP_CREDIT_EXCEEDS_PRICE;
  }
  assert(threw, 'execução futura recusa restituição automática');
  console.log('OK testFinancialModelSeparated');
}

function testV1ScopeConstants() {
  assert(LOT_SWAP_V1_SAME_PROJECT_ONLY === true, 'V1 mesmo empreendimento');
  assert(isSameProjectLotSwap('p1', 'p1'), 'mesmo projeto');
  assert(!isSameProjectLotSwap('p1', 'p2'), 'projetos distintos');
  assert(LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS === 'Disponível', 'destino Disponível');
  assert(LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES.includes('Reservado'), 'Reservado rejeitado');
  assert(isLotSwapV1DestinationStatusAllowed('Disponível'), 'Disponível aceito');
  assert(!isLotSwapV1DestinationStatusAllowed('Reservado'), 'Reservado recusado');
  assert(!isLotSwapV1DestinationStatusAllowed('Vendido'), 'Vendido recusado');
  assert(LOT_SWAP_SOURCE_AFTER_EXECUTE_STATUS === 'Disponível', 'origem ficará Disponível');
  assert(LOT_SWAP_DESTINATION_AFTER_EXECUTE_STATUS === 'Vendido', 'destino ficará Vendido');
  console.log('OK testV1ScopeConstants');
}

function testIsolationFromReleaseLot() {
  assert(SALE_LOT_SWAP_OPERATION_CODE === 'troca_lote', 'código da operação');
  assert(isSaleLotSwapOperation('troca_lote'), 'helper da troca');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'troca_lote não é ReleaseLot');
  assert(!showsTerminationSettlement('troca_lote'), 'troca não aceita settlement');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'troca fora do catálogo de settlement');
  assert(isDeferredSaleOperation('troca_lote'), 'continua diferida no painel atual');
  assert(isLotReleaseSaleOperation('desistencia'), 'Desistência intacta no ReleaseLot');
  assert(isLotReleaseSaleOperation('distrato'), 'Distrato intacto no ReleaseLot');
  assert(isLotReleaseSaleOperation('inadimplencia'), 'Inadimplência intacta no ReleaseLot');
  assert(showsTerminationSettlement('desistencia'), 'settlement Desistência intacto');
  assert(showsTerminationSettlement('distrato'), 'settlement Distrato intacto');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement Inadimplência intacto');
  assert(isSaleReleaseSettlementOperation('desistencia'), 'persistência Desistência intacta');
  assert(isSaleReleaseSettlementOperation('distrato'), 'persistência Distrato intacta');
  assert(isSaleReleaseSettlementOperation('inadimplencia'), 'persistência Inadimplência intacta');
  assert(!isDistratoTerminationOperation('troca_lote'), 'troca ≠ distrato documental');
  assert(!isInadimplenciaTerminationOperation('troca_lote'), 'troca ≠ inadimplência documental');

  const swapMod = read('lib/finance/saleLotSwap.ts');
  assert(!swapMod.includes('releaseLotService'), 'módulo da troca não importa ReleaseLot');
  assert(!swapMod.includes('saleReleaseSettlement'), 'módulo da troca não importa settlement');
  assert(!swapMod.includes('calculateTerminationSettlement'), 'sem motor de rescisão');
  assert(!swapMod.includes('retention'), 'sem retenção 25%');

  const releaseTouched = [
    'lib/finance/releaseLotService.ts',
    'lib/finance/saleReleaseSettlement.ts',
    'lib/finance/releaseLotShared.ts',
    'app/api/lots/[lotId]/release/route.ts',
    'components/map/ReleaseLotConfirmModal.tsx',
  ];
  for (const rel of releaseTouched) {
    const src = read(rel);
    assert(!src.includes('saleLotSwap'), `${rel} não chama o serviço de troca`);
    assert(!src.includes('sale_lot_swaps'), `${rel} não grava sale_lot_swaps`);
    assert(!src.includes('LOT_SWAP_DOCUMENT_PREFIX'), `${rel} não usa prefixo TL`);
  }

  const existingFlows = [
    'components/map/GISMap.tsx',
    'lib/saleEdit.ts',
    'lib/gisSaleCreateService.ts',
    'app/finance/page.tsx',
    'lib/contractRegeneration.ts',
    'lib/termination-documents/persist.ts',
    'lib/mundoNovoContractSellers.ts',
  ];
  for (const rel of existingFlows) {
    const src = read(rel);
    assert(!src.includes('saleLotSwap'), `${rel} sem serviço de troca`);
    assert(!src.includes('sale_lot_swaps'), `${rel} sem tabela de troca`);
  }
  console.log('OK testIsolationFromReleaseLot');
}

function testNoExecutionSurface() {
  assert(!exists('app/api/sales/[id]/lot-swap/route.ts'), 'sem POST de execução');
  assert(!exists('app/api/lots/[lotId]/swap/route.ts'), 'sem rota de swap no lote');
  const swapMod = read('lib/finance/saleLotSwap.ts');
  assert(!swapMod.includes('export async function execute'), 'sem execute async');
  assert(!swapMod.includes('.from(\'sale_lot_swaps\')'), 'sem insert/update nesta fase');
  assert(!swapMod.includes('.from("sale_lot_swaps")'), 'sem client supabase nesta fase');
  assert(swapMod.includes('SECURITY DEFINER'), 'atomicidade futura documentada');
  assert(swapMod.includes('FOR UPDATE'), 'locks futuros documentados');
  const apply = read('scripts/develop/apply-sale-lot-swaps.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('assertNotContractOperationsMigration'), 'bloqueia operations');
  assert(apply.includes('ABORT: DATABASE_URL aponta para Production'), 'recusa Production');
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production conhecida');
  console.log('OK testNoExecutionSurface');
}

function testProtectedSurfacesUntouchedInSource() {
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('resolveMundoNovoPromitenteVendors'), 'Mundo Novo intacto');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('isDeferredSaleOperation(motiveCode)'), 'painel ainda recusa diferidos');
  assert(modal.includes('Troca de lote em etapa própria'), 'copy de troca diferida intacta');
  const releaseSql = read('supabase/migrations/20261010120000_sale_release_settlements.sql');
  assert(releaseSql.includes('sale_release_settlements'), 'settlement intacto');
  assert(
    !releaseSql.includes('troca_lote'),
    'settlement não ganhou troca_lote',
  );
  console.log('OK testProtectedSurfacesUntouchedInSource');
}

testSchemaAndTypes();
testPrefixTl();
testDocumentTypesRegisteredNotGenerated();
testFinancialModelSeparated();
testV1ScopeConstants();
testIsolationFromReleaseLot();
testNoExecutionSurface();
testProtectedSurfacesUntouchedInSource();
console.log('OK mandatory-sale-lot-swap-phase1-tests');
