/**
 * Venda GIS exige contrato persistido; revenda não reutiliza contrato anterior.
 * npx tsx scripts/mandatory-gis-sale-contract-required-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  pickHistoricalSaleContractId,
  SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE,
} from '../lib/saleHistoricalContract';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const SALE_A = 'sale-a';
const SALE_B = 'sale-b';
const CONTRACT_A = 'contract-a';
const CONTRACT_B = 'contract-b';
const CONTRACT_A_V2 = 'contract-a-v2';

function testSuccessfulSaleRequiresPersistedContract() {
  const gis = read('lib/gisSaleCreateService.ts');
  assert(gis.includes('insertContractForSale'), 'INSERT de contrato da venda');
  assert(gis.includes('persistSaleContractLink'), 'grava sales.contract_id');
  assert(gis.includes('.update({ contract_id: contractId })'), 'sales.contract_id explícito');
  assert(gis.includes("status: 'Vendido'"), 'marca lote vendido');
  assert(
    gis.indexOf("logSaleStep('generate_contract'") < gis.indexOf("logSaleStep('update_lot_status'"),
    'contrato persistido antes de concluir o lote',
  );
  assert(gis.includes('contract_id: contractId'), 'lote recebe o contrato da venda nova');
  assert(!gis.includes('from(\'contracts\').update'), 'GIS não atualiza contrato existente');
  assert(gis.includes('getNextContractNumber'), 'número novo por venda');
  assert(
    gis.includes('SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE'),
    'venda sem contrato não retorna sucesso',
  );

  const map = read('components/map/GISMap.tsx');
  assert(
    map.includes(SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE),
    'operador vê erro visível no GIS',
  );
  console.log('OK testSuccessfulSaleRequiresPersistedContract');
}

function testContractFailureRollsBackSaleAndLot() {
  const gis = read('lib/gisSaleCreateService.ts');
  assert(
    !gis.includes('warnings.push(`Contrato não gerado:'),
    'falha de contrato não vira warning',
  );
  assert(!gis.includes('Contrato não criado:'), 'insert falho não vira warning');
  assert(gis.includes('throw new Error(`${SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE}'), 'erro visível');
  assert(gis.includes('rollbackPartialSale'), 'rollback compensatório');
  const rollback = gis.slice(
    gis.indexOf('async function rollbackPartialSale'),
    gis.indexOf('export async function executeGisSaleCreate'),
  );
  assert(
    rollback.indexOf(".from('contracts').delete().eq('sale_id', params.saleId)") <
      rollback.indexOf(".from('sales').delete().eq('id', params.saleId)"),
    'apaga contrato da venda nova antes da sale',
  );
  assert(rollback.includes("status: 'Disponível'"), 'lote volta a Disponível');
  assert(rollback.includes('sale_id: null'), 'limpa blocks.sale_id');
  assert(rollback.includes('contract_id: null'), 'limpa blocks.contract_id');
  assert(!rollback.includes(".eq('block_id'"), 'rollback não apaga contrato de outra venda pelo lote');

  const route = read('app/api/sales/create/route.ts');
  assert(route.includes('status: 500'), 'API devolve erro, não 200 com warning');
  console.log('OK testContractFailureRollsBackSaleAndLot');
}

function testResaleCreatesIndependentContract() {
  const contractA = pickHistoricalSaleContractId({
    saleId: SALE_A,
    settlementContractId: CONTRACT_A,
    saleRowContractId: CONTRACT_A,
    contractsOfThisSale: [
      { id: CONTRACT_A, sale_id: SALE_A, is_current: true, created_at: '2026-09-05T18:09:00.000Z' },
    ],
  });
  const contractB = pickHistoricalSaleContractId({
    saleId: SALE_B,
    settlementContractId: CONTRACT_B,
    saleRowContractId: CONTRACT_B,
    contractsOfThisSale: [
      { id: CONTRACT_B, sale_id: SALE_B, is_current: true, created_at: '2026-09-05T18:28:00.000Z' },
    ],
  });
  assert(contractA === CONTRACT_A, 'Venda A → Contrato A');
  assert(contractB === CONTRACT_B, 'Venda B → Contrato B');
  assert(contractA !== contractB, 'IDs próprios');

  const crossed = pickHistoricalSaleContractId({
    saleId: SALE_B,
    settlementContractId: CONTRACT_A,
    saleRowContractId: CONTRACT_A,
    contractsOfThisSale: [
      { id: CONTRACT_A, sale_id: SALE_A, is_current: true, created_at: '2026-09-05T18:09:00.000Z' },
      { id: CONTRACT_B, sale_id: SALE_B, is_current: true, created_at: '2026-09-05T18:28:00.000Z' },
    ],
  });
  assert(crossed === CONTRACT_B, 'contrato de venda anterior não é reutilizado');

  const gis = read('lib/gisSaleCreateService.ts');
  assert(gis.includes('Sempre INSERT de contrato novo da venda'), 'revenda INSERT');
  assert(gis.includes('.insert([cleaned])'), 'INSERT, não UPDATE');
  console.log('OK testResaleCreatesIndependentContract');
}

function testHistoricalPointersSurviveReleaseLot() {
  const release = read('lib/finance/releaseLotService.ts');
  const apply = release.slice(
    release.indexOf('async function applyLocalRelease'),
    release.indexOf('export async function executeReleaseLot'),
  );
  assert(
    apply.includes("update({ status: SALE_CANCELLED_STATUS })"),
    'venda histórica só muda status',
  );
  assert(
    apply.includes('Encerramento preserva sales.contract_id da venda histórica'),
    'não zera sales.contract_id',
  );
  const salesUpdate = apply.slice(
    apply.indexOf(".from('sales')"),
    apply.indexOf('CANCEL_SALE_FAILED'),
  );
  assert(!salesUpdate.includes('contract_id: null'), 'sales.contract_id permanece');

  const clearCore = apply.slice(apply.indexOf('const clearCore'), apply.indexOf('let blockErr'));
  assert(clearCore.includes('contract_id: null'), 'blocks.contract_id pode ser limpo');
  assert(clearCore.includes('sale_id: null'), 'blocks.sale_id limpo');

  assert(apply.includes('.eq(\'id\', preview.contractId)'), 'cancela o contrato da venda');
  console.log('OK testHistoricalPointersSurviveReleaseLot');
}

function testSettlementAndEsignResolveBySaleNotBlock() {
  const helper = read('lib/saleHistoricalContract.ts');
  assert(!helper.includes(".eq('block_id'"), 'resolver nunca busca por block_id');
  assert(helper.includes('settlement.contract_id'), 'ordem: settlement');
  assert(helper.includes('contracts.sale_id'), 'ordem: contratos da venda');
  assert(helper.includes('sales.contract_id'), 'ordem: sales.contract_id');

  const distratoA = pickHistoricalSaleContractId({
    saleId: SALE_A,
    settlementContractId: CONTRACT_A_V2,
    saleRowContractId: CONTRACT_A,
    contractsOfThisSale: [
      { id: CONTRACT_A, sale_id: SALE_A, is_current: false, created_at: '2026-09-05T18:09:00.000Z' },
      {
        id: CONTRACT_A_V2,
        sale_id: SALE_A,
        is_current: true,
        created_at: '2026-09-05T18:10:00.000Z',
      },
    ],
  });
  const distratoB = pickHistoricalSaleContractId({
    saleId: SALE_B,
    settlementContractId: CONTRACT_B,
    saleRowContractId: CONTRACT_B,
    contractsOfThisSale: [
      { id: CONTRACT_B, sale_id: SALE_B, is_current: true, created_at: '2026-09-05T18:28:00.000Z' },
    ],
  });
  assert(distratoA === CONTRACT_A_V2, 'Distrato da Venda A usa Contrato A');
  assert(distratoB === CONTRACT_B, 'Distrato da Venda B usa Contrato B');

  const missing = pickHistoricalSaleContractId({
    saleId: SALE_B,
    settlementContractId: null,
    saleRowContractId: null,
    contractsOfThisSale: [],
  });
  assert(missing === null, 'sem contrato da venda não inventa vínculo');

  const foreignSettlementIgnored = pickHistoricalSaleContractId({
    saleId: SALE_B,
    settlementContractId: CONTRACT_A,
    saleRowContractId: null,
    contractsOfThisSale: [
      { id: CONTRACT_B, sale_id: SALE_B, is_current: true, created_at: '2026-09-05T18:28:00.000Z' },
    ],
  });
  assert(foreignSettlementIgnored === CONTRACT_B, 'não cruza contratos entre vendas');

  const release = read('lib/finance/releaseLotService.ts');
  const loadCtx = release.slice(
    release.indexOf('async function loadSaleContext'),
    release.indexOf('const receiptFull'),
  );
  assert(
    loadCtx.indexOf("loadContractBy({ column: 'sale_id'") <
      loadCtx.indexOf("loadContractBy({ column: 'id', value: saleRowContractId })"),
    'ReleaseLot localiza contrato pela venda antes de sales.contract_id',
  );
  assert(!loadCtx.includes("column: 'block_id'"), 'loadSaleContext não busca contrato por block_id');
  assert(
    release.includes('contractId: resolveSettlementContractId(liveCtx.contract)'),
    'settlement recebe o contrato carregado da venda',
  );

  const persist = read('lib/termination-documents/persist.ts');
  assert(persist.includes('loadHistoricalSaleContractId'), 'freeze resolve contrato histórico da venda');
  assert(!persist.includes("eq('block_id'"), 'freeze não cruza por lote');

  const esign = read('lib/termination-documents/signature.ts');
  assert(esign.includes('loadHistoricalSaleContractId'), 'e-sign resolve pela venda');
  assert(esign.includes('CONTRACT_REQUIRED'), 'sem contrato permanece erro');
  assert(!esign.includes('loaded.snapshot.contractId'), 'não usa snapshot cego');
  assert(!esign.includes(".eq('block_id'"), 'e-sign não busca contrato por lote');
  assert(esign.includes('sale_id') && esign.includes('input.saleId'), 'recusa contrato de outra venda');
  console.log('OK testSettlementAndEsignResolveBySaleNotBlock');
}

function testDesistenciaUnchangedAndNoRetroactiveRepair() {
  const release = read('lib/finance/releaseLotService.ts');
  assert(release.includes("'Desistência concluída com sucesso.'"), 'Desistência intacta');
  assert(release.includes("'Distrato concluído com sucesso.'"), 'Distrato intacto');
  assert(release.includes('function desistenciaSuccessMessage'), 'Desistência segue no mesmo motor');

  const regen = read('lib/contractRegeneration.ts');
  assert(
    regen.includes(".from('sales')") && regen.includes('contract_id: newRow.id'),
    'regeneração atualiza sales.contract_id da mesma venda',
  );

  const migrations = fs.readdirSync(path.join(__dirname, '..', 'supabase/migrations'));
  assert(
    !migrations.some((name) => /sales_contract_id|sale_contract_required|venda.sem.contrato/i.test(name)),
    'sem migration neste patch',
  );
  const gis = read('lib/gisSaleCreateService.ts');
  assert(!gis.includes('7134adb4'), 'não repara Venda B por heurística');
  console.log('OK testDesistenciaUnchangedAndNoRetroactiveRepair');
}

function main() {
  testSuccessfulSaleRequiresPersistedContract();
  testContractFailureRollsBackSaleAndLot();
  testResaleCreatesIndependentContract();
  testHistoricalPointersSurviveReleaseLot();
  testSettlementAndEsignResolveBySaleNotBlock();
  testDesistenciaUnchangedAndNoRetroactiveRepair();
  console.log('ALL mandatory-gis-sale-contract-required-tests passed');
}

main();
