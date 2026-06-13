/**
 * Testes obrigatórios — OWNER somente leitura.
 * npx tsx scripts/mandatory-owner-readonly-tests.ts
 */

import {
  canManageGisProject,
  canManageOwners,
  canOwnerPerformWrites,
  isOwnerRole,
  OWNER_READ_ONLY_DENIED_MESSAGE,
} from '../lib/rolePermissions';
import {
  blockOwnerWriteOnClient,
  guardOwnerWriteRole,
  isOwnerBlockedMapWriteRoute,
  isWriteHttpMethod,
  ownerMapPopupWriteActionsEnabled,
  ownerMapWriteBlocked,
} from '../lib/ownerWriteGuard';
import {
  buildOwnerProjectOptionsFromAccessRows,
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIds,
  resolveCashMovementProjectId,
  resolveFinanceProjectFilterList,
} from '../lib/ownerProjectAccess';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MARTINI_2 = '11111111-1111-1111-1111-111111111101';
const MARTINI_3 = '11111111-1111-1111-1111-111111111102';
const OTHER_PROJECT = '11111111-1111-1111-1111-111111111199';

const ownerUser = { id: 'owner-1', role: 'OWNER', tenant_id: TENANT };
const adminUser = { id: 'admin-1', role: 'ADMIN', tenant_id: TENANT };

const ownerRows = [
  {
    tenant_id: TENANT,
    user_id: ownerUser.id,
    project_id: MARTINI_2,
    can_view_dashboard: true,
    can_view_map: true,
    can_view_finance: true,
    can_view_contracts: true,
  },
  {
    tenant_id: TENANT,
    user_id: ownerUser.id,
    project_id: MARTINI_3,
    can_view_dashboard: true,
    can_view_map: true,
    can_view_finance: true,
    can_view_contracts: true,
  },
];

function testOwnerCannotPerformWrites() {
  assert(isOwnerRole('OWNER'), 'OWNER reconhecido');
  assert(!canOwnerPerformWrites('OWNER'), 'OWNER não pode gravar');
  assert(canOwnerPerformWrites('ADMIN'), 'ADMIN pode gravar');
  assert(!guardOwnerWriteRole('OWNER'), 'guard bloqueia OWNER');
  assert(guardOwnerWriteRole('ADMIN'), 'guard libera ADMIN');
  console.log('OK testOwnerCannotPerformWrites');
}

function testOwnerCannotSellOrReserveLot() {
  assert(!canManageGisProject('OWNER'), 'OWNER não gerencia/vende no GIS');
  assert(!canManageGisProject('BROKER'), 'BROKER não gerencia projeto');
  assert(canManageGisProject('ADMIN'), 'ADMIN gerencia GIS');
  assert(blockOwnerWriteOnClient('OWNER'), 'bloqueio client-side venda/reserva');
  console.log('OK testOwnerCannotSellOrReserveLot');
}

function testOwnerCannotRegisterFinanceWrites() {
  assert(!canOwnerPerformWrites(ownerUser.role), 'sem registrar saída');
  assert(!canOwnerPerformWrites(ownerUser.role), 'sem registrar pagamento');
  assert(!guardOwnerWriteRole(ownerUser.role), 'financeiro bloqueado');
  console.log('OK testOwnerCannotRegisterFinanceWrites');
}

function testOwnerCannotEditContractOrProject() {
  assert(!canOwnerPerformWrites('OWNER'), 'sem editar contrato');
  assert(!canManageGisProject('OWNER'), 'sem editar lote/projeto GIS');
  assert(!canManageOwners('OWNER'), 'sem importar/gestão owners');
  console.log('OK testOwnerCannotEditContractOrProject');
}

function testOwnerCannotEditCustomer() {
  assert(!canOwnerPerformWrites('OWNER'), 'sem criar/editar cliente');
  console.log('OK testOwnerCannotEditCustomer');
}

function testOwnerApiWriteMethodsDetected() {
  assert(isWriteHttpMethod('POST'), 'POST é escrita');
  assert(isWriteHttpMethod('PATCH'), 'PATCH é escrita');
  assert(isWriteHttpMethod('DELETE'), 'DELETE é escrita');
  assert(!isWriteHttpMethod('GET'), 'GET não é escrita');
  console.log('OK testOwnerApiWriteMethodsDetected');
}

function testOwnerReadOnlyMessage() {
  assert(
    OWNER_READ_ONLY_DENIED_MESSAGE.includes('somente leitura'),
    'mensagem clara de read-only',
  );
  console.log('OK testOwnerReadOnlyMessage');
}

function testOwnerStillViewsOnlyAllowedProjects() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const projects = [
    { id: MARTINI_2, name: 'CHACARAS MARTINI II' },
    { id: MARTINI_3, name: 'CHACARAS E LOTES MARTINE III' },
    { id: OTHER_PROJECT, name: 'JOAQUIM' },
  ];
  const visible = filterProjectsForUser(ownerUser, projects, allowed);
  assert(visible.length === 2, 'OWNER visualiza só projetos permitidos');

  const cash = [
    { id: '1', project_id: OTHER_PROJECT, description: 'Joaquim' },
    { id: '2', project_id: MARTINI_2, description: 'Martini II' },
  ];
  const scopedCash = filterRowsByOwnerProjects(cash, allowed, resolveCashMovementProjectId);
  assert(scopedCash.length === 1, 'financeiro leitura escopada');
  assert(canOwnerPerformWrites(adminUser.role), 'ADMIN mantém escrita');
  console.log('OK testOwnerStillViewsOnlyAllowedProjects');
}

function testOwnerMapCannotEditConfrontation() {
  assert(ownerMapWriteBlocked('OWNER'), 'OWNER bloqueado no mapa');
  assert(!ownerMapPopupWriteActionsEnabled('OWNER'), 'popup sem editar confrontação');
  assert(ownerMapPopupWriteActionsEnabled('ADMIN'), 'ADMIN mantém popup técnico');
  console.log('OK testOwnerMapCannotEditConfrontation');
}

function testOwnerMapCannotSaveConfrontation() {
  assert(!guardOwnerWriteRole('OWNER'), 'salvar confrontação bloqueado');
  assert(blockOwnerWriteOnClient('OWNER'), 'client bloqueia salvar confrontação');
  console.log('OK testOwnerMapCannotSaveConfrontation');
}

function testOwnerMapCannotGenerateMemorialPdf() {
  assert(ownerMapWriteBlocked('OWNER'), 'OWNER não gera memorial');
  assert(!ownerMapPopupWriteActionsEnabled('OWNER'), 'popup sem memorial');
  assert(canManageGisProject('OWNER') === false, 'OWNER sem ferramentas GIS');
  console.log('OK testOwnerMapCannotGenerateMemorialPdf');
}

function testOwnerFinanceProjectFilterListsAllowedProjects() {
  const allProjects = [
    { id: MARTINI_2, name: 'CHACARAS MARTINI II' },
    { id: MARTINI_3, name: 'CHACARAS E LOTES MARTINE III' },
    { id: OTHER_PROJECT, name: 'JOAQUIM' },
  ];
  const options = buildOwnerProjectOptionsFromAccessRows(ownerRows, allProjects, 'finance');
  const filterList = resolveFinanceProjectFilterList(ownerUser, ownerRows, allProjects, options);
  assert(filterList.length === 2, 'filtro lista projetos permitidos');
  assert(
    filterList.includes('CHACARAS MARTINI II'),
    'filtro inclui Martini II',
  );
  assert(
    filterList.includes('CHACARAS E LOTES MARTINE III'),
    'filtro inclui Martine III',
  );
  console.log('OK testOwnerFinanceProjectFilterListsAllowedProjects');
}

function testOwnerFinanceProjectFilterDoesNotListDeniedProjects() {
  const allProjects = [
    { id: MARTINI_2, name: 'CHACARAS MARTINI II' },
    { id: MARTINI_3, name: 'CHACARAS E LOTES MARTINE III' },
    { id: OTHER_PROJECT, name: 'JOAQUIM' },
  ];
  const options = buildOwnerProjectOptionsFromAccessRows(ownerRows, allProjects, 'finance');
  const filterList = resolveFinanceProjectFilterList(ownerUser, ownerRows, allProjects, options);
  assert(!filterList.includes('JOAQUIM'), 'filtro não lista projeto negado');
  const visible = filterProjectsForUser(ownerUser, allProjects, getOwnerAllowedProjectIds(ownerRows));
  assert(!visible.some((p) => p.id === OTHER_PROJECT), 'OWNER não vê Joaquim');
  console.log('OK testOwnerFinanceProjectFilterDoesNotListDeniedProjects');
}

function testOwnerBackendBlocksMapWriteRoutes() {
  assert(
    isOwnerBlockedMapWriteRoute('/api/projects/abc', 'PATCH'),
    'PATCH projeto bloqueado',
  );
  assert(
    isOwnerBlockedMapWriteRoute('/api/contracts/abc/regenerate', 'POST'),
    'regenerar contrato bloqueado',
  );
  assert(
    !isOwnerBlockedMapWriteRoute('/api/projects/abc', 'GET'),
    'GET projeto permitido',
  );
  assert(isWriteHttpMethod('DELETE'), 'DELETE é escrita');
  assert(!guardOwnerWriteRole('OWNER'), 'guard backend OWNER');
  console.log('OK testOwnerBackendBlocksMapWriteRoutes');
}

function main() {
  testOwnerCannotPerformWrites();
  testOwnerCannotSellOrReserveLot();
  testOwnerCannotRegisterFinanceWrites();
  testOwnerCannotEditContractOrProject();
  testOwnerCannotEditCustomer();
  testOwnerApiWriteMethodsDetected();
  testOwnerReadOnlyMessage();
  testOwnerStillViewsOnlyAllowedProjects();
  testOwnerMapCannotEditConfrontation();
  testOwnerMapCannotSaveConfrontation();
  testOwnerMapCannotGenerateMemorialPdf();
  testOwnerFinanceProjectFilterListsAllowedProjects();
  testOwnerFinanceProjectFilterDoesNotListDeniedProjects();
  testOwnerBackendBlocksMapWriteRoutes();
  console.log('mandatory-owner-readonly-tests: all passed');
}

main();
