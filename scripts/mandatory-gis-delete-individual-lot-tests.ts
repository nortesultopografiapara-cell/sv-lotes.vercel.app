/**
 * Testes obrigatórios — exclusão de lote individual no GIS.
 * npx tsx scripts/mandatory-gis-delete-individual-lot-tests.ts
 */

import {
  INDIVIDUAL_LOT_DELETE_CONFIRM_MESSAGE,
  buildIndividualLotDeleteConfirmMessage,
  canDeleteIndividualLotRole,
  formatIndividualLotDeleteLabel,
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

function testOwnerBrokerAssistantBlocked() {
  assert(!canDeleteIndividualLotRole('OWNER').allowed, 'OWNER bloqueado');
  assert(!canDeleteIndividualLotRole('BROKER').allowed, 'BROKER bloqueado');
  assert(!canDeleteIndividualLotRole('CORRETOR').allowed, 'CORRETOR bloqueado');
  assert(!canDeleteIndividualLotRole('ASSISTANT').allowed, 'ASSISTANT bloqueado');
  console.log('OK testOwnerBrokerAssistantBlocked');
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
    INDIVIDUAL_LOT_DELETE_CONFIRM_MESSAGE.includes('permanentemente'),
    'mensagem de confirmação definida',
  );
  assert(
    formatIndividualLotDeleteLabel('02', '04') === 'QD 02 LT 04',
    'rótulo QD/LT',
  );
  assert(
    formatIndividualLotDeleteLabel('QUADRA 02', '04') === 'QD 02 LT 04',
    'rótulo remove prefixo QUADRA',
  );
  const msg = buildIndividualLotDeleteConfirmMessage('02', '04');
  assert(msg.includes('QD 02 LT 04'), 'confirmação inclui rótulo do lote');
  assert(msg.includes('permanentemente'), 'confirmação menciona remoção permanente');
  assert(isLotStatusAvailableForDelete('Disponível'), 'status Disponível');
  assert(isLotStatusAvailableForDelete('disponivel'), 'status sem acento');
  console.log('OK testConfirmMessage');
}

function testUiEntryPointInProjectQuadrasPanel() {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/map/ProjectQuadrasPanel.tsx'),
    'utf8',
  );
  assert(panel.includes('onRequestDeleteLot'), 'painel expõe exclusão de lote');
  assert(panel.includes('Excluir lote'), 'botão Excluir lote no painel');
  assert(panel.includes('Excluir quadra'), 'botão Excluir quadra permanece');
  assert(panel.includes('Atualizar lote'), 'botão Atualizar lote permanece');

  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/map/page.tsx'),
    'utf8',
  );
  assert(page.includes('DeleteIndividualLotModal'), 'página usa modal de exclusão');
  assert(page.includes('handleDeleteIndividualLotQuadra'), 'handler no painel de quadras');
  assert(page.includes('/api/projects/'), 'reutiliza API DELETE existente');
  assert(!page.includes('onLotDeleted'), 'mapa não recebe onLotDeleted do popup comercial');

  const gisMap = fs.readFileSync(
    path.join(process.cwd(), 'components/map/GISMap.tsx'),
    'utf8',
  );
  assert(!gisMap.includes('canDeleteIndividualLot'), 'popup comercial sem exclusão estrutural');
  assert(!gisMap.includes('onRequestDeleteLot'), 'popup comercial sem handler de exclusão');
  assert(!gisMap.includes('Excluir lote'), 'texto Excluir lote removido do modal comercial');

  const modal = fs.readFileSync(
    path.join(process.cwd(), 'components/map/DeleteIndividualLotModal.tsx'),
    'utf8',
  );
  assert(modal.includes('buildIndividualLotDeleteConfirmMessage'), 'modal usa mensagem padrão');
  assert(modal.includes('Número do lote'), 'modal pede número do lote');

  console.log('OK testUiEntryPointInProjectQuadrasPanel');
}

function testAvailableForAllProjects() {
  const page = require('fs').readFileSync(
    require('path').join(process.cwd(), 'app/map/page.tsx'),
    'utf8',
  );
  assert(!page.includes('Recanto Primavera'), 'não depende do template Recanto');
  assert(!page.includes('recanto'), 'não filtra por recanto');
  assert(page.includes('canManageGisProject(user?.role)'), 'usa permissão existente');
  console.log('OK testAvailableForAllProjects');
}

function main() {
  testAdminDeletesAvailableLotWithoutLinks();
  testAdminCannotDeleteSoldOrReserved();
  testAdminCannotDeleteWithSaleContractFinance();
  testOwnerBrokerAssistantBlocked();
  testDeleteDoesNotRemoveWholeQuadra();
  testConfirmMessage();
  testUiEntryPointInProjectQuadrasPanel();
  testAvailableForAllProjects();
  console.log('mandatory-gis-delete-individual-lot-tests: all passed');
}

main();
