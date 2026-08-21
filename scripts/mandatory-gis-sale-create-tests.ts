/**
 * Testes — criação de venda pelo GIS (API /api/sales/create).
 * npx tsx scripts/mandatory-gis-sale-create-tests.ts
 */

import fs from 'node:fs';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSalesCreateRouteExists() {
  const route = fs.readFileSync('app/api/sales/create/route.ts', 'utf8');
  assert(route.includes('[sales/create]'), 'logs [sales/create] na rota');
  assert(route.includes('executeGisSaleCreate'), 'delega ao service');
  assert(route.includes('success: false'), 'erro JSON claro');
  console.log('OK testSalesCreateRouteExists');
}

function testGisSaleCreateServiceFlow() {
  const service = fs.readFileSync('lib/gisSaleCreateService.ts', 'utf8');
  assert(service.includes("logSaleStep('create_sale'"), 'log create_sale');
  assert(service.includes("logSaleStep('create_receipts'"), 'log create_receipts');
  assert(service.includes("logSaleStep('update_lot_status'"), 'lote vendido antes do contrato');
  assert(service.includes("logSaleStep('generate_contract'"), 'log generate_contract');
  assert(
    service.indexOf("logSaleStep('update_lot_status'") <
      service.indexOf("logSaleStep('generate_contract'"),
    'update_lot_status antes de generate_contract',
  );
  assert(service.includes('CONTRACT_GENERATION_TIMEOUT_MS'), 'timeout no contrato');
  assert(service.includes('rollbackPartialSale'), 'rollback em falha parcial');
  assert(service.includes('insertRowsWithColumnFallback'), 'parcelas em lote');
  assert(
    !service.includes('for (const financePayload of financePayloads)'),
    'sem loop 1-a-1 de parcelas',
  );
  assert(service.includes('persistGeneratedContractHtml'), 'persiste HTML do contrato');
  assert(service.includes('buildCommissionSnapshotFields'), 'snapshot de comissão na venda');
  assert(service.includes('resolveSaleCommissionPlan'), 'plano PERCENT/FIXED/NONE');
  console.log('OK testGisSaleCreateServiceFlow');
}

function testGisMapUsesSalesCreateApi() {
  const gis = fs.readFileSync('components/map/GISMap.tsx', 'utf8');
  assert(gis.includes('/api/sales/create'), 'GIS chama API de venda');
  assert(gis.includes('fetchJsonWithTimeout'), 'GIS usa timeout no fetch');
  assert(gis.includes('SALES_CREATE_FETCH_TIMEOUT_MS'), 'timeout dedicado venda');
  const handler = gis.slice(gis.indexOf('handleSaveCustomerAndLot'));
  assert(
    handler.indexOf('/api/sales/create') < handler.indexOf('resolveOrCreateCustomer'),
    'venda via API antes do resolveOrCreateCustomer no handler',
  );
  console.log('OK testGisMapUsesSalesCreateApi');
}

function testCustomerLotFormReleasesLoading() {
  const modal = fs.readFileSync('components/map/CustomerLotFormModal.tsx', 'utf8');
  assert(modal.includes('setSubmitting(false)'), 'libera submitting no finally');
  assert(modal.includes('CUSTOMER_LOT_FORM_SUBMIT_ERROR'), 'log de erro no submit');
  assert(modal.includes('alert(msg)'), 'exibe erro ao usuário');
  console.log('OK testCustomerLotFormReleasesLoading');
}

function run() {
  testSalesCreateRouteExists();
  testGisSaleCreateServiceFlow();
  testGisMapUsesSalesCreateApi();
  testCustomerLotFormReleasesLoading();
  console.log('OK — mandatory-gis-sale-create-tests passed');
}

run();
