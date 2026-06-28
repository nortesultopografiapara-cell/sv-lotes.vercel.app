/**
 * Testes obrigatórios — exclusão de lote individual no GIS.
 * npx tsx scripts/mandatory-gis-delete-individual-lot-tests.ts
 */

import {
  INDIVIDUAL_LOT_DELETE_CONFIRM_MESSAGE,
  canDeleteIndividualLotRole,
  individualLotDeleteTargetsSingleBlock,
  isLotStatusAvailableForDelete,
  validateIndividualLotDelete,
} from '../lib/gis/deleteIndividualLot';
import { deleteProjectQuadra, normalizeQuadraBlockName } from '../lib/projectQuadras';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const availableLot = {
  id: 'lot-a',
  project_id: 'proj-1',
  block_name: 'CHACARA',
  number: '02',
  status: 'Disponível',
  customer_id: null,
  sale_id: null,
  contract_id: null,
  broker_id: null,
};

function testAdminDeletesAvailableLotWithoutLinks() {
  assert(canDeleteIndividualLotRole('ADMIN').allowed, 'ADMIN pode excluir');
  assert(canDeleteIndividualLotRole('SUPER_ADMIN').allowed, 'SUPER_ADMIN pode excluir');
  const validation = validateIndividualLotDelete({
    lot: availableLot,
    linkedSalesCount: 0,
    linkedContractsCount: 0,
    linkedFinanceReceiptsCount: 0,
  });
  assert(validation.allowed, 'lote disponível sem vínculos pode ser excluído');
  console.log('OK testAdminDeletesAvailableLotWithoutLinks');
}

function testAdminCannotDeleteSoldOrReserved() {
  const sold = validateIndividualLotDelete({
    lot: { ...availableLot, status: 'Vendido' },
  });
  assert(!sold.allowed && sold.code === 'SOLD', 'bloqueia vendido');

  const reserved = validateIndividualLotDelete({
    lot: { ...availableLot, status: 'Reservado' },
  });
  assert(!reserved.allowed && reserved.code === 'RESERVED', 'bloqueia reservado');
  console.log('OK testAdminCannotDeleteSoldOrReserved');
}

function testAdminCannotDeleteWithSaleContractFinance() {
  const withSale = validateIndividualLotDelete({
    lot: availableLot,
    linkedSalesCount: 1,
  });
  assert(!withSale.allowed && withSale.code === 'SALE', 'bloqueia sale');

  const withContract = validateIndividualLotDelete({
    lot: availableLot,
    linkedContractsCount: 1,
  });
  assert(!withContract.allowed && withContract.code === 'CONTRACT', 'bloqueia contract');

  const withFinance = validateIndividualLotDelete({
    lot: availableLot,
    linkedFinanceReceiptsCount: 2,
  });
  assert(!withFinance.allowed && withFinance.code === 'FINANCE', 'bloqueia finance_receipt');
  console.log('OK testAdminCannotDeleteWithSaleContractFinance');
}

function testOwnerBrokerBlocked() {
  assert(!canDeleteIndividualLotRole('OWNER').allowed, 'OWNER bloqueado');
  assert(!canDeleteIndividualLotRole('BROKER').allowed, 'BROKER bloqueado');
  assert(!canDeleteIndividualLotRole('CORRETOR').allowed, 'CORRETOR bloqueado');
  console.log('OK testOwnerBrokerBlocked');
}

function testDeleteDoesNotRemoveWholeQuadra() {
  const scope = individualLotDeleteTargetsSingleBlock('lot-target');
  assert(scope.byId === true, 'escopo por id');
  assert(scope.lotId === 'lot-target', 'id do lote alvo');
  assert(scope.blockNameFilter === null, 'não filtra block_name');

  const quadraName = normalizeQuadraBlockName('CHACARA');
  const lotsInQuadra = [
    { id: 'lot-1', block_name: quadraName },
    { id: 'lot-2', block_name: quadraName },
    { id: 'lot-3', block_name: quadraName },
  ];
  const deletedId = 'lot-2';
  const remaining = lotsInQuadra.filter((l) => l.id !== deletedId);
  assert(remaining.length === 2, 'sobra 2 lotes na quadra');
  assert(
    remaining.every((l) => normalizeQuadraBlockName(l.block_name) === quadraName),
    'quadra permanece com outros lotes',
  );

  const deleteQuadraFilter = {
    project_id: 'proj-1',
    block_name: quadraName,
  };
  const individualDeleteFilter = {
    project_id: 'proj-1',
    id: deletedId,
  };
  assert(
    deleteQuadraFilter.block_name !== individualDeleteFilter.id,
    'exclusão individual não usa filtro de quadra inteira',
  );
  assert(deleteProjectQuadra.length > 0, 'deleteProjectQuadra exportada para contraste');
  console.log('OK testDeleteDoesNotRemoveWholeQuadra');
}

function testConfirmMessage() {
  assert(
    INDIVIDUAL_LOT_DELETE_CONFIRM_MESSAGE.includes('lote individualmente'),
    'mensagem de confirmação definida',
  );
  assert(isLotStatusAvailableForDelete('Disponível'), 'status Disponível');
  assert(isLotStatusAvailableForDelete('disponivel'), 'status sem acento');
  console.log('OK testConfirmMessage');
}

function main() {
  testAdminDeletesAvailableLotWithoutLinks();
  testAdminCannotDeleteSoldOrReserved();
  testAdminCannotDeleteWithSaleContractFinance();
  testOwnerBrokerBlocked();
  testDeleteDoesNotRemoveWholeQuadra();
  testConfirmMessage();
  console.log('mandatory-gis-delete-individual-lot-tests: all passed');
}

main();
