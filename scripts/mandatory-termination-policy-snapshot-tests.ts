/**
 * Snapshot contratual de encerramento — testes obrigatórios Fase 2.
 * npx tsx scripts/mandatory-termination-policy-snapshot-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ARAGUAIA_POLICY_V1,
  POLICY_CATALOG,
  buildTerminationPolicySnapshot,
  buildTerminationSettlementPreview,
  copyTerminationPolicyPersistFromSale,
  policyFromSnapshot,
  resolveLegacyModelForBackfill,
  resolveOperationalTerminationPolicy,
  resolveTerminationPolicy,
} from '../lib/contract-termination';
import { detectPreviewAraguaiaNameCoerce } from '../lib/contractModel';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rec(n: number, amount: number) {
  return { installment_number: n, status: 'pago' as const, amount };
}

function testNewAraguaiaSaleSnapshot() {
  const persist = buildTerminationPolicySnapshot({
    contractModel: 'ARAGUAIA',
    persistSource: 'catalog',
    capturedAt: '2026-08-22T00:00:00.000Z',
  });
  const snap = persist.termination_policy_snapshot;
  assert(snap.status === 'COMPLETE', 'COMPLETE');
  assert(persist.termination_policy_version === 'araguaia.clause3.item8.v1', 'version');
  assert(persist.termination_policy_source === 'catalog', 'source catalog');
  assert(snap.entryRefundable === false, 'entrada não reembolsável');
  assert(snap.contractualRetentionPercent === 25, 'retenção 25');
  assert(snap.refundInstallmentCountRule === 'PAID_REGULAR_INSTALLMENTS', 'parcelas quitadas');
  assert(snap.clauseReference === 'Cláusula 3 — itens 6 a 9', 'cláusula');
  assert(snap.contractModel === 'ARAGUAIA', 'modelo no snapshot');
  assert(snap.retentionBaseRule === 'EXCLUDE_NON_REFUNDABLE', 'base exclui entrada');
  assert(typeof snap.capturedAt === 'string' && snap.capturedAt.length > 0, 'capturedAt');
  console.log('OK testNewAraguaiaSaleSnapshot');
}

function testImmutabilityAgainstCatalogChange() {
  const persist = buildTerminationPolicySnapshot({
    contractModel: 'ARAGUAIA',
    persistSource: 'catalog',
  });
  const original = ARAGUAIA_POLICY_V1.contractualRetentionPercent;
  ARAGUAIA_POLICY_V1.contractualRetentionPercent = 99;
  POLICY_CATALOG.ARAGUAIA.contractualRetentionPercent = 99;
  try {
    const live = resolveTerminationPolicy({ saleContractModel: 'ARAGUAIA' });
    assert(live.policy.contractualRetentionPercent === 99, 'catálogo vigente mudou no teste');

    const frozen = policyFromSnapshot(persist.termination_policy_snapshot);
    assert(frozen.contractualRetentionPercent === 25, 'snapshot permanece v1');

    const preview = buildTerminationSettlementPreview({
      saleSnapshot: persist.termination_policy_snapshot,
      salePersistSource: 'catalog',
      receipts: [rec(0, 10000), rec(1, 20000)],
    });
    assert(preview.settlement.contractualRetentionPercent === 25, 'preview usa snapshot');
    assert(preview.settlement.contractualRefundAmount === 15000, 'líquido v1');
    assert(preview.origin.kind === 'sale_snapshot', 'origem snapshot da venda');
    assert(preview.origin.badge === 'CONGELADA', 'badge congelada');
    assert(preview.origin.frozen === true, 'frozen');
  } finally {
    ARAGUAIA_POLICY_V1.contractualRetentionPercent = original;
    POLICY_CATALOG.ARAGUAIA.contractualRetentionPercent = original;
  }
  console.log('OK testImmutabilityAgainstCatalogChange');
}

function testRegenerationCopiesSaleSnapshot() {
  const persist = buildTerminationPolicySnapshot({
    contractModel: 'ARAGUAIA',
    persistSource: 'catalog',
  });
  const sale = {
    termination_policy_snapshot: persist.termination_policy_snapshot,
    termination_policy_version: persist.termination_policy_version,
    termination_policy_source: persist.termination_policy_source,
  };
  const copied = copyTerminationPolicyPersistFromSale(sale);
  assert(
    copied.termination_policy_snapshot?.contractualRetentionPercent === 25,
    'cópia preserva 25',
  );
  assert(copied.termination_policy_source === 'catalog', 'source da venda');

  const regen = read('lib/contractRegeneration.ts');
  assert(regen.includes('copyTerminationPolicyPersistFromSale(sale)'), 'regenera copia da venda');
  assert(
    !regen.includes('buildTerminationPolicySnapshot'),
    'regeneração não recaptura catálogo',
  );
  console.log('OK testRegenerationCopiesSaleSnapshot');
}

function testOtherModelsStayIncomplete() {
  for (const model of ['PADRAO', 'MENESES', 'RECANTO_PRIMAVERA', 'SV_LOTES_2', 'CUSTOM']) {
    const persist = buildTerminationPolicySnapshot({
      contractModel: model,
      persistSource: 'catalog',
    });
    assert(persist.termination_policy_snapshot.status === 'INCOMPLETE', `${model} INCOMPLETE`);
    assert(
      persist.termination_policy_snapshot.contractualRetentionPercent == null,
      `${model} sem 25%`,
    );
  }
  console.log('OK testOtherModelsStayIncomplete');
}

function testBackfillHelpers() {
  const araguaia = buildTerminationPolicySnapshot({
    contractModel: 'ARAGUAIA',
    persistSource: 'backfill_inferred',
  });
  assert(araguaia.termination_policy_source === 'backfill_inferred', 'source backfill');
  assert(araguaia.termination_policy_snapshot.status === 'COMPLETE', 'ARAGUAIA complete');
  assert(araguaia.termination_policy_snapshot.policySource === 'backfill_inferred', 'json source');

  const incomplete = buildTerminationPolicySnapshot({
    contractModel: 'MENESES',
    persistSource: 'backfill_inferred',
  });
  assert(incomplete.termination_policy_snapshot.status === 'INCOMPLETE', 'meneses incomplete');
  assert(incomplete.termination_policy_snapshot.contractualRetentionPercent == null, 'sem %');

  const missing = buildTerminationPolicySnapshot({
    contractModel: null,
    persistSource: 'backfill_inferred',
  });
  assert(missing.termination_policy_snapshot.status === 'MISSING_POLICY', 'missing');

  const unknown = buildTerminationPolicySnapshot({
    contractModel: 'MODELO_X',
    persistSource: 'backfill_inferred',
  });
  assert(unknown.termination_policy_snapshot.status === 'MISSING_POLICY', 'desconhecido missing');

  assert(
    resolveLegacyModelForBackfill({
      saleContractModel: 'ARAGUAIA',
      companyContractModel: 'PADRAO',
    }) === 'ARAGUAIA',
    'venda prevalece',
  );
  assert(
    resolveLegacyModelForBackfill({
      projectContractModel: null,
      companyContractModel: 'MENESES',
    }) === 'MENESES',
    'empresa só se demais vazios',
  );

  const script = read('scripts/develop/backfill-termination-policy-snapshots.ts');
  assert(script.includes('--dry-run'), 'dry-run');
  assert(script.includes('assertDevelopWriteAllowed'), 'guard develop');
  assert(script.includes('PRODUCTION_PROJECT_REF'), 'conhece Production para abortar');
  assert(script.includes("termination_policy_source = 'backfill_inferred'") || script.includes("'backfill_inferred'"), 'grava backfill_inferred');
  console.log('OK testBackfillHelpers');
}

function testReleasePreviewPriority() {
  const snap = buildTerminationPolicySnapshot({
    contractModel: 'ARAGUAIA',
    persistSource: 'catalog',
  }).termination_policy_snapshot;

  const fromSnap = resolveOperationalTerminationPolicy({
    saleSnapshot: snap,
    saleContractModel: 'PADRAO',
  });
  assert(fromSnap.usedSnapshot === true, 'usa snapshot');
  assert(fromSnap.policy.catalogKey === 'ARAGUAIA', 'não cai no PADRAO');
  assert(fromSnap.policy.contractualRetentionPercent === 25, 'regra do snapshot');

  const legacy = resolveOperationalTerminationPolicy({
    saleContractModel: 'MENESES',
  });
  assert(legacy.usedSnapshot === false, 'legado sem snapshot');
  assert(legacy.origin.kind === 'legacy_inferred', 'inferido');
  assert(legacy.origin.badge === 'LEGADO INFERIDO', 'badge legado');
  assert(legacy.policy.contractualRetentionPercent == null, 'não herda 25');

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('saleSnapshot: sale?.termination_policy_snapshot'), 'GET lê snapshot da venda');
  assert(svc.includes('contractSnapshot: contract?.termination_policy_snapshot'), 'GET lê snapshot do contrato');
  console.log('OK testReleasePreviewPriority');
}

function testMalformedSnapshotDoesNotUseLiveCatalog() {
  const resolved = resolveOperationalTerminationPolicy({
    saleSnapshot: { foo: 'ARAGUAIA' },
    saleContractModel: 'ARAGUAIA',
  });
  assert(resolved.usedSnapshot === true, 'snapshot presente');
  assert(resolved.policy.policySource === 'missing', 'não usa catálogo vigente');
  console.log('OK testMalformedSnapshotDoesNotUseLiveCatalog');
}

function testPreviewAraguaiaNameCoerceIsNotSilentPersistRule() {
  assert(
    detectPreviewAraguaiaNameCoerce({
      projectName: 'Chacreamento Araguaia',
      projectModel: null,
    }) === true,
    'detecta coerce Preview',
  );
  assert(
    detectPreviewAraguaiaNameCoerce({
      projectName: 'Chacreamento Araguaia',
      projectModel: 'ARAGUAIA',
    }) === false,
    'não alerta se já é ARAGUAIA',
  );
  const gis = read('lib/gisSaleCreateService.ts');
  assert(gis.includes('detectPreviewAraguaiaNameCoerce'), 'GIS identifica coerce');
  assert(gis.includes('contract_model: saleContractModel'), 'grava modelo explícito');
  const imported = read('lib/imports/modules/sales/executeSaleRow.ts');
  assert(imported.includes('buildTerminationPolicySnapshot'), 'importação captura snapshot');
  assert(imported.includes('insertRowsWithColumnFallback'), 'importação ignora coluna ausente');
  const seed = read('scripts/develop/seed-homolog.ts');
  assert(seed.includes('buildTerminationPolicySnapshot'), 'seed homolog captura snapshot');
  const backfill = read('scripts/develop/backfill-termination-policy-snapshots.ts');
  assert(!backfill.includes('detectPreviewAraguaiaNameCoerce'), 'backfill não persiste por nome');
  console.log('OK testPreviewAraguaiaNameCoerceIsNotSilentPersistRule');
}

function testUiBadgeAndNoTechLeak() {
  const ui = read('components/map/ReleaseLotSettlementSection.tsx');
  assert(ui.includes('CONGELADA') || ui.includes('origin?.badge'), 'badge');
  assert(ui.includes('Política contratual congelada na venda') === false, 'título vem do origin');
  assert(ui.includes('origin?.title'), 'título operacional');
  assert(ui.includes('origin?.modelLine'), 'modelo amigável');
  assert(ui.includes('origin?.clauseLine'), 'cláusula amigável');
  assert(!ui.includes('catalogKey'), 'sem catalogKey na UI');
  assert(!ui.includes('JSON.stringify'), 'sem JSON na UI');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('origin={preview.settlementPreview.origin}'), 'modal passa origin');
  console.log('OK testUiBadgeAndNoTechLeak');
}

function testMigrationAdditiveAndGuards() {
  const sql = read('supabase/migrations/20261009120000_sales_termination_policy_snapshot.sql');
  assert(sql.includes('ADD COLUMN IF NOT EXISTS termination_policy_snapshot'), 'snapshot sales');
  assert(sql.includes('ALTER TABLE public.contracts'), 'contracts');
  assert(!/\bDROP COLUMN\b/i.test(sql), 'sem DROP COLUMN');
  assert(!/\bDELETE FROM\b/i.test(sql), 'sem DELETE');
  assert(!/\bTRUNCATE TABLE\b/i.test(sql), 'sem TRUNCATE TABLE');
  assert(sql.includes("'catalog'"), 'source catalog');
  assert(sql.includes("'backfill_inferred'"), 'source backfill');
  assert(!sql.includes('20261008120000'), 'não reutiliza migration de operações');

  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  const apply = read('scripts/develop/apply-termination-policy-snapshot.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply exige develop');
  assert(apply.includes('assertNotContractOperationsMigration'), 'bloqueia migration proibida');
  console.log('OK testMigrationAdditiveAndGuards');
}

function testSaleCreateAndReleaseDoNotPersistSettlement() {
  const post = read('app/api/lots/[lotId]/release/route.ts');
  const postFn = post.slice(post.indexOf('export async function POST'));
  assert(!postFn.includes('termination_policy_snapshot'), 'POST release não grava snapshot');
  assert(!postFn.includes('sale_release_settlements'), 'POST sem settlement table');
  const gis = read('lib/gisSaleCreateService.ts');
  assert(!gis.includes('/api/contract-operations/'), 'GIS sem cessão');
  assert(!read('lib/saleEdit.ts').includes('termination_policy'), 'edição de venda não reescreve snapshot');
  console.log('OK testSaleCreateAndReleaseDoNotPersistSettlement');
}

function main() {
  testNewAraguaiaSaleSnapshot();
  testImmutabilityAgainstCatalogChange();
  testRegenerationCopiesSaleSnapshot();
  testOtherModelsStayIncomplete();
  testBackfillHelpers();
  testReleasePreviewPriority();
  testMalformedSnapshotDoesNotUseLiveCatalog();
  testPreviewAraguaiaNameCoerceIsNotSilentPersistRule();
  testUiBadgeAndNoTechLeak();
  testMigrationAdditiveAndGuards();
  testSaleCreateAndReleaseDoNotPersistSettlement();
  console.log('\nALL mandatory-termination-policy-snapshot-tests PASSED');
}

main();
