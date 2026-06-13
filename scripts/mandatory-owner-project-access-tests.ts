/**
 * Testes obrigatórios — acesso OWNER por empreendimento.
 * npx tsx scripts/mandatory-owner-project-access-tests.ts
 */

import {
  aggregateOwnerPermissions,
  canOwnerAccessProject,
  canOwnerAccessRoute,
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIds,
  getOwnerAllowedProjectIdsForModule,
  getOwnerMenuItemsFromPermissions,
  isOwnerBlockedRoute,
  isOwnerUser,
  isTenantAdminRole,
  ownerCanAccessModule,
  resolveCashMovementProjectId,
  resolveCommissionProjectId,
  resolveContractProjectId,
  resolveOwnerFirstAllowedRoute,
  resolveReceiptProjectId,
  resolveFinanceProjectsForUser,
  resolveFinanceProjectsFilterNames,
  scopeFinanceRowsForUser,
  shouldApplyOwnerFinanceScope,
  shouldRedirectOwnerFromRoute,
  type OwnerProjectAccessRow,
} from '../lib/ownerProjectAccess';
import {
  OWNERS_SESSION_EXPIRED_MESSAGE,
  OWNERS_SESSION_CONFIRM_MESSAGE,
  resolveUsersTenantId,
  USERS_CALLER_SELECT,
  isRecoverableOwnerOrphan,
  isConflictingTenantProfile,
  isOwnerAuthHookResidue,
} from '../lib/ownersAdmin';
import { isBrokerRole, isOwnerRole, canManageGisProject, canManageOwners, isBrokerBlockedRoute } from '../lib/rolePermissions';
import { isPlatformAdmin } from '../lib/rls';
import {
  formatOwnerProfileType,
  isOwnerAccountActive,
  isValidOwnerProfileType,
  normalizeOwnerProfileType,
} from '../lib/ownerProfiles';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MARTINI_2 = '11111111-1111-1111-1111-111111111101';
const MARTINI_3 = '11111111-1111-1111-1111-111111111102';
const OTHER_PROJECT = '11111111-1111-1111-1111-111111111199';
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OWNER_ID = 'owner-irineu-1';

const ownerRows: OwnerProjectAccessRow[] = [
  {
    tenant_id: TENANT,
    user_id: OWNER_ID,
    project_id: MARTINI_2,
    can_view_dashboard: true,
    can_view_map: true,
    can_view_finance: true,
    can_view_contracts: true,
  },
  {
    tenant_id: TENANT,
    user_id: OWNER_ID,
    project_id: MARTINI_3,
    can_view_dashboard: true,
    can_view_map: true,
    can_view_finance: true,
    can_view_contracts: true,
  },
];

const ownerUser = { id: OWNER_ID, role: 'OWNER', tenant_id: TENANT };
const adminUser = { id: 'admin-1', role: 'ADMIN', tenant_id: TENANT };
const brokerUser = { id: 'broker-1', role: 'BROKER', tenant_id: TENANT };
const superAdmin = { id: 'super-1', role: 'SUPER_ADMIN', tenant_id: null };

const allProjects = [
  { id: MARTINI_2, name: 'CHACREAMENTO MARTINI II' },
  { id: MARTINI_3, name: 'LOTEAMENTO MARTINI 3' },
  { id: OTHER_PROJECT, name: 'OUTRO LOTEAMENTO MENESES' },
];

function testOwnerSeesOnlyAllowedProjects() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const visible = filterProjectsForUser(ownerUser, allProjects, allowed);
  assert(visible.length === 2, 'OWNER deve ver 2 projetos liberados');
  assert(visible.every((p) => [MARTINI_2, MARTINI_3].includes(p.id)), 'projetos Martini');
  console.log('OK testOwnerSeesOnlyAllowedProjects');
}

function testOwnerDoesNotSeeOtherMenesesProjects() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const visible = filterProjectsForUser(ownerUser, allProjects, allowed);
  assert(!visible.some((p) => p.id === OTHER_PROJECT), 'OWNER não vê outro empreendimento');
  console.log('OK testOwnerDoesNotSeeOtherMenesesProjects');
}

function testOwnerCannotAccessUnreleasedProjectUrl() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  assert(!canOwnerAccessProject(ownerUser, OTHER_PROJECT, allowed), 'project_id não liberado bloqueado');
  assert(canOwnerAccessProject(ownerUser, MARTINI_2, allowed), 'project_id liberado permitido');
  console.log('OK testOwnerCannotAccessUnreleasedProjectUrl');
}

function testOwnerFinanceScopedByProject() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const receipts = [
    { project_id: MARTINI_2, amount: 100 },
    { project_id: OTHER_PROJECT, amount: 500 },
    { sales: { project_id: MARTINI_3 }, amount: 200 },
  ];
  const scoped = filterRowsByOwnerProjects(receipts, allowed, resolveReceiptProjectId);
  assert(scoped.length === 2, 'financeiro OWNER apenas projetos liberados');
  assert(scoped.reduce((s, r) => s + r.amount, 0) === 300, 'soma financeira sem mistura');
  console.log('OK testOwnerFinanceScopedByProject');
}

function testAdminStillSeesAllProjects() {
  const visible = filterProjectsForUser(adminUser, allProjects, null);
  assert(visible.length === 3, 'ADMIN vê todos os projetos');
  assert(isTenantAdminRole(adminUser.role), 'ADMIN é admin tenant');
  console.log('OK testAdminStillSeesAllProjects');
}

function testBrokerBehaviorUnchanged() {
  assert(isBrokerRole(brokerUser.role), 'BROKER reconhecido');
  assert(!isOwnerUser(brokerUser), 'BROKER não é OWNER');
  assert(!canManageGisProject(brokerUser.role), 'BROKER não gerencia GIS');
  const visible = filterProjectsForUser(brokerUser, allProjects, null);
  assert(visible.length === 3, 'BROKER mantém lista tenant completa no app');
  console.log('OK testBrokerBehaviorUnchanged');
}

function testSuperAdminUnaffected() {
  assert(isPlatformAdmin(superAdmin.role!), 'SUPER_ADMIN intacto');
  assert(!isOwnerUser(superAdmin), 'SUPER_ADMIN não é OWNER');
  const visible = filterProjectsForUser(superAdmin, allProjects, []);
  assert(visible.length === 3, 'SUPER_ADMIN ignora filtro OWNER');
  console.log('OK testSuperAdminUnaffected');
}

function testOwnerDashboardSumsOnlyAllowedProjects() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const lots = [
    { project_id: MARTINI_2, status: 'available', price: 1000 },
    { project_id: MARTINI_3, status: 'sold', price: 2000 },
    { project_id: OTHER_PROJECT, status: 'sold', price: 9000 },
  ];
  const scoped = filterRowsByOwnerProjects(lots, allowed, (lot) => lot.project_id);
  const total = scoped.reduce((sum, lot) => sum + lot.price, 0);
  assert(scoped.length === 2, 'dashboard OWNER só lotes liberados');
  assert(total === 3000, 'dashboard soma apenas projetos liberados');
  console.log('OK testOwnerDashboardSumsOnlyAllowedProjects');
}

function testOwnerMapListsOnlyAllowedProjects() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const mapProjects = filterProjectsForUser(ownerUser, allProjects, allowed);
  assert(mapProjects.map((p) => p.name).join('|').includes('MARTINI'), 'mapa lista Martini');
  assert(mapProjects.length === 2, 'mapa GIS sem projetos extras');
  console.log('OK testOwnerMapListsOnlyAllowedProjects');
}

function testOwnerFinanceDoesNotMixOtherDevelopments() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const contracts = [
    { project_id: MARTINI_2, contract_number: 'C-1' },
    { project_id: OTHER_PROJECT, contract_number: 'C-9' },
    { sales: { projects: { id: MARTINI_3 } }, contract_number: 'C-2' },
  ];
  const scoped = filterRowsByOwnerProjects(contracts, allowed, resolveContractProjectId);
  assert(scoped.length === 2, 'contratos OWNER sem mistura');
  assert(!scoped.some((c) => c.contract_number === 'C-9'), 'contrato de outro loteamento excluído');
  console.log('OK testOwnerFinanceDoesNotMixOtherDevelopments');
}

function testOwnerRoleAndPermissionsHelpers() {
  assert(isOwnerRole('OWNER'), 'role OWNER');
  assert(ownerCanAccessModule(ownerRows, 'finance'), 'módulo financeiro liberado');
  const perms = aggregateOwnerPermissions(ownerRows);
  assert(perms.can_view_map && perms.can_view_dashboard, 'permissões agregadas');
  assert(isOwnerBlockedRoute('/settings'), 'OWNER bloqueado em settings');
  assert(isOwnerBlockedRoute('/owners'), 'OWNER bloqueado em /owners');
  assert(!isOwnerBlockedRoute('/map'), 'OWNER pode acessar mapa');
  console.log('OK testOwnerRoleAndPermissionsHelpers');
}

function testOwnersMenuAndRouteAccess() {
  assert(canManageOwners('ADMIN'), 'ADMIN gerencia owners');
  assert(canManageOwners('SUPER_ADMIN'), 'SUPER_ADMIN gerencia owners');
  assert(!canManageOwners('OWNER'), 'OWNER não gerencia owners');
  assert(!canManageOwners('BROKER'), 'BROKER não gerencia owners');
  assert(isOwnerBlockedRoute('/owners'), 'OWNER não vê menu /owners');
  assert(isBrokerBlockedRoute('/owners'), 'BROKER bloqueado em /owners');
  console.log('OK testOwnersMenuAndRouteAccess');
}

function testOwnerProfileTypesAndInactive() {
  assert(normalizeOwnerProfileType('Proprietário') === 'PROPRIETARIO', 'tipo proprietário');
  assert(formatOwnerProfileType('SOCIO') === 'Sócio', 'label sócio');
  assert(isValidOwnerProfileType('INVESTIDOR'), 'tipo investidor válido');
  assert(!isOwnerAccountActive('INACTIVE'), 'conta inativa');
  assert(isOwnerAccountActive('ACTIVE'), 'conta ativa');
  console.log('OK testOwnerProfileTypesAndInactive');
}

function testOwnersSessionExpiredMessage() {
  assert(
    OWNERS_SESSION_EXPIRED_MESSAGE.includes('sessão expirou'),
    'mensagem amigável de sessão expirada',
  );
  assert(
    OWNERS_SESSION_CONFIRM_MESSAGE.includes('confirmar sua sessão'),
    'mensagem amigável de confirmação de sessão',
  );
  assert(!USERS_CALLER_SELECT.includes('company_id'), 'users select sem company_id');
  assert(resolveUsersTenantId({ tenant_id: TENANT }) === TENANT, 'resolve tenant_id');
  assert(resolveUsersTenantId({}) === null, 'tenant ausente');
  console.log('OK testOwnersSessionExpiredMessage');
}

function testOwnerOrphanEmailValidation() {
  const tenant = TENANT;
  const orphanHook = { id: 'orphan-1', role: 'CORRETOR', tenant_id: null, email: 'junior@gmail.com' };
  const orphanOwner = {
    id: 'orphan-2',
    role: 'OWNER',
    tenant_id: tenant,
    email: 'junior@gmail.com',
    owner_profile_type: null,
  };
  const broker = { id: 'broker-2', role: 'BROKER', tenant_id: tenant, email: 'b@gmail.com' };
  const admin = { id: 'admin-2', role: 'ADMIN', tenant_id: tenant, email: 'a@gmail.com' };
  const authHookResidue = {
    id: 'auth-hook-1',
    role: 'CORRETOR',
    tenant_id: tenant,
    email: 'junior@gmail.com',
    owner_profile_type: null,
  };

  assert(isRecoverableOwnerOrphan(orphanHook, tenant), 'hook auth órfão recuperável');
  assert(isRecoverableOwnerOrphan(orphanOwner, tenant), 'OWNER incompleto recuperável');
  assert(!isRecoverableOwnerOrphan(broker, tenant), 'BROKER ativo não é órfão');
  assert(isConflictingTenantProfile(broker, tenant), 'BROKER no tenant conflita');
  assert(isConflictingTenantProfile(admin, tenant), 'ADMIN no tenant conflita');
  assert(!isConflictingTenantProfile(orphanHook, tenant), 'hook sem tenant não conflita');
  assert(
    isOwnerAuthHookResidue(authHookResidue, {
      authUserId: 'auth-hook-1',
      email: 'junior@gmail.com',
    }),
    'resíduo do auth hook com tenant deve ser promovível a OWNER',
  );
  assert(
    !isOwnerAuthHookResidue(broker, { authUserId: 'broker-2', email: 'b@gmail.com' }),
    'BROKER real não é resíduo de hook',
  );
  console.log('OK testOwnerOrphanEmailValidation');
}

function testOwnerFinanceCashFlowScoped() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const cashMovements = [
    {
      id: 'cm-1',
      description: 'JOAQUIM / ENTRADA CHACARA 23',
      project_id: OTHER_PROJECT,
      projects: { id: OTHER_PROJECT, name: 'JOAQUIM' },
    },
    {
      id: 'cm-2',
      description: 'INSTALAÇÃO DE INTERNET NO ESCRITORIO',
      project_id: null,
      projects: null,
    },
    {
      id: 'cm-3',
      description: 'Recebimento Martini II',
      project_id: MARTINI_2,
      projects: { id: MARTINI_2, name: 'CHACARAS MARTINI II' },
    },
    {
      id: 'cm-4',
      description: 'Repasse via contrato Martine III',
      contracts: { project_id: MARTINI_3, projects: { id: MARTINI_3, name: 'MARTINE III' } },
    },
  ];

  const scoped = filterRowsByOwnerProjects(
    cashMovements,
    allowed,
    resolveCashMovementProjectId,
  );

  assert(scoped.length === 2, 'OWNER vê apenas 2 lançamentos de caixa permitidos');
  assert(
    !scoped.some((row) => row.description.includes('JOAQUIM')),
    'sem lançamento Joaquim',
  );
  assert(
    !scoped.some((row) => row.description.includes('INTERNET')),
    'sem despesa sem projeto autorizado',
  );
  assert(
    resolveCashMovementProjectId(cashMovements[3]) === MARTINI_3,
    'resolve projeto via contrato',
  );
  console.log('OK testOwnerFinanceCashFlowScoped');
}

function testOwnerFinanceCommissionsScoped() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const commissions = [
    {
      id: 'bc-1',
      sales: { project_id: OTHER_PROJECT, projects: { id: OTHER_PROJECT } },
    },
    {
      id: 'bc-2',
      contracts: { project_id: MARTINI_2, projects: { id: MARTINI_2 } },
    },
  ];
  const scoped = filterRowsByOwnerProjects(
    commissions,
    allowed,
    resolveCommissionProjectId,
  );
  assert(scoped.length === 1, 'comissões apenas do projeto permitido');
  assert(resolveCommissionProjectId(commissions[1]) === MARTINI_2, 'resolve comissão');
  console.log('OK testOwnerFinanceCommissionsScoped');
}

function testOwnerModuleSpecificProjectIds() {
  const rows: OwnerProjectAccessRow[] = [
    {
      ...ownerRows[0],
      can_view_finance: true,
      can_view_map: true,
      can_view_dashboard: false,
      can_view_contracts: true,
    },
    {
      ...ownerRows[1],
      can_view_finance: false,
      can_view_map: true,
      can_view_dashboard: true,
      can_view_contracts: false,
    },
  ];

  assert(
    getOwnerAllowedProjectIdsForModule(rows, 'finance').join(',') === MARTINI_2,
    'finance só Martini II',
  );
  assert(
    getOwnerAllowedProjectIdsForModule(rows, 'map').length === 2,
    'mapa com ambos quando liberado',
  );
  assert(
    getOwnerAllowedProjectIdsForModule(rows, 'dashboard').join(',') === MARTINI_3,
    'dashboard só Martine III',
  );
  assert(
    getOwnerAllowedProjectIdsForModule(rows, 'contracts').join(',') === MARTINI_2,
    'contratos só Martini II',
  );
  console.log('OK testOwnerModuleSpecificProjectIds');
}

function testOwnerTodosProjetosMeansAllowedOnly() {
  const allowed = getOwnerAllowedProjectIds(ownerRows);
  const allTenantProjects = [
    { id: MARTINI_2, name: 'CHACARAS MARTINI II' },
    { id: MARTINI_3, name: 'CHACARAS E LOTES MARTINE III' },
    { id: OTHER_PROJECT, name: 'JOAQUIM' },
    { id: 'castanheira-1', name: 'CASTANHEIRA' },
  ];
  const ownerVisible = allTenantProjects.filter((p) => allowed.includes(p.id));
  assert(ownerVisible.length === 2, 'OWNER vê 2 projetos no filtro');
  assert(!ownerVisible.some((p) => p.name === 'JOAQUIM'), 'sem Joaquim no seletor');
  console.log('OK testOwnerTodosProjetosMeansAllowedOnly');
}

function testOwnerWithDashboardStaysOnDashboardRoute() {
  const perms = aggregateOwnerPermissions(ownerRows);
  assert(perms.can_view_dashboard, 'OWNER com dashboard liberado');
  assert(
    shouldRedirectOwnerFromRoute('/dashboard', ownerRows, perms) === null,
    'permanece em /dashboard',
  );
  assert(canOwnerAccessRoute('/dashboard', perms), 'rota dashboard permitida');
  console.log('OK testOwnerWithDashboardStaysOnDashboardRoute');
}

function testOwnerWithoutDashboardRedirectsToFirstAllowedModule() {
  const rows = ownerRows.map((row) => ({ ...row, can_view_dashboard: false }));
  const perms = aggregateOwnerPermissions(rows);
  assert(!perms.can_view_dashboard, 'sem dashboard');
  assert(perms.can_view_map, 'ainda tem mapa');
  assert(
    shouldRedirectOwnerFromRoute('/dashboard', rows, perms) === '/map',
    'redireciona para /map',
  );
  assert(resolveOwnerFirstAllowedRoute(perms) === '/map', 'primeiro módulo é mapa');
  console.log('OK testOwnerWithoutDashboardRedirectsToFirstAllowedModule');
}

function testOwnerNavigationRoutesStayOnAllowedModules() {
  const perms = aggregateOwnerPermissions(ownerRows);
  assert(shouldRedirectOwnerFromRoute('/map', ownerRows, perms) === null, 'mapa ok');
  assert(shouldRedirectOwnerFromRoute('/finance', ownerRows, perms) === null, 'financeiro ok');
  assert(shouldRedirectOwnerFromRoute('/contracts', ownerRows, perms) === null, 'contratos ok');
  const menu = getOwnerMenuItemsFromPermissions(perms, ownerRows);
  assert(menu.length === 4, 'menu com 4 módulos');
  assert(menu.some((item) => item.href === '/dashboard'), 'menu inclui dashboard');
  console.log('OK testOwnerNavigationRoutesStayOnAllowedModules');
}

function testOwnerEmptyAccessRowsDoNotForceMapRedirect() {
  const perms = aggregateOwnerPermissions([]);
  assert(
    shouldRedirectOwnerFromRoute('/dashboard', [], perms) === null,
    'rows vazias não forçam redirect para mapa',
  );
  console.log('OK testOwnerEmptyAccessRowsDoNotForceMapRedirect');
}

function testAdminFinanceListsAllTenantProjects() {
  assert(!shouldApplyOwnerFinanceScope(adminUser), 'ADMIN não usa escopo OWNER');
  const projects = resolveFinanceProjectsForUser(adminUser, allProjects, ownerRows);
  assert(projects.length === 3, 'ADMIN lista todos os empreendimentos do tenant');
  const filterNames = resolveFinanceProjectsFilterNames(adminUser, allProjects, ownerRows);
  assert(filterNames.length === 3, 'filtro ADMIN com todos os nomes');
  assert(filterNames.includes('CHACREAMENTO MARTINI II'), 'filtro inclui Martini II');
  console.log('OK testAdminFinanceListsAllTenantProjects');
}

function testAdminFinanceReceiptsNotScopedByOwnerAccess() {
  const receipts = [
    { project_id: MARTINI_2, amount: 100 },
    { project_id: OTHER_PROJECT, amount: 500 },
    { sales: { project_id: MARTINI_3 }, amount: 200 },
  ];
  const scoped = scopeFinanceRowsForUser(
    adminUser,
    receipts,
    ownerRows,
    resolveReceiptProjectId,
  );
  assert(scoped.length === 3, 'ADMIN vê todas as parcelas do tenant');
  assert(
    scoped.reduce((sum, row) => sum + row.amount, 0) === 800,
    'ADMIN sem filtro owner_project_access em parcelas',
  );
  console.log('OK testAdminFinanceReceiptsNotScopedByOwnerAccess');
}

function testAdminFinanceCashMovementsNotScopedByOwnerAccess() {
  const cash = [
    { project_id: MARTINI_2, amount: 50 },
    { project_id: OTHER_PROJECT, amount: 150 },
  ];
  const scoped = scopeFinanceRowsForUser(
    adminUser,
    cash,
    ownerRows,
    resolveCashMovementProjectId,
  );
  assert(scoped.length === 2, 'ADMIN vê todo fluxo de caixa do tenant');
  console.log('OK testAdminFinanceCashMovementsNotScopedByOwnerAccess');
}

function testAdminFinanceCardsUseTenantData() {
  const receipts = [
    { project_id: MARTINI_2, amount: 100 },
    { project_id: OTHER_PROJECT, amount: 250 },
  ];
  const cash = [{ project_id: OTHER_PROJECT, amount: 75 }];
  const scopedReceipts = scopeFinanceRowsForUser(
    adminUser,
    receipts,
    ownerRows,
    resolveReceiptProjectId,
  );
  const scopedCash = scopeFinanceRowsForUser(
    adminUser,
    cash,
    ownerRows,
    resolveCashMovementProjectId,
  );
  const totalReceipts = scopedReceipts.reduce((sum, row) => sum + row.amount, 0);
  const totalCash = scopedCash.reduce((sum, row) => sum + row.amount, 0);
  assert(totalReceipts === 350, 'cards ADMIN somam parcelas do tenant inteiro');
  assert(totalCash === 75, 'cards ADMIN somam caixa do tenant inteiro');
  console.log('OK testAdminFinanceCardsUseTenantData');
}

function testOwnerFinanceStillScopedByAllowedProjects() {
  const receipts = [
    { project_id: MARTINI_2, amount: 100 },
    { project_id: OTHER_PROJECT, amount: 500 },
    { sales: { project_id: MARTINI_3 }, amount: 200 },
  ];
  const scoped = scopeFinanceRowsForUser(
    ownerUser,
    receipts,
    ownerRows,
    resolveReceiptProjectId,
  );
  assert(scoped.length === 2, 'OWNER continua escopado aos projetos permitidos');
  assert(scoped.reduce((sum, row) => sum + row.amount, 0) === 300, 'OWNER soma só liberados');
  const projects = resolveFinanceProjectsForUser(ownerUser, allProjects, ownerRows);
  assert(projects.length === 2, 'OWNER lista só projetos permitidos');
  console.log('OK testOwnerFinanceStillScopedByAllowedProjects');
}

function testOwnerFinanceDoesNotLeakDeniedProjects() {
  const filterNames = resolveFinanceProjectsFilterNames(ownerUser, allProjects, ownerRows);
  assert(!filterNames.includes('JOAQUIM'), 'OWNER não lista projeto negado no filtro');
  const cash = [
    { project_id: OTHER_PROJECT, amount: 999 },
    { project_id: MARTINI_2, amount: 40 },
  ];
  const scopedCash = scopeFinanceRowsForUser(
    ownerUser,
    cash,
    ownerRows,
    resolveCashMovementProjectId,
  );
  assert(scopedCash.length === 1, 'OWNER não vê caixa de projeto negado');
  assert(scopedCash[0].amount === 40, 'OWNER mantém só Martini II no caixa');
  console.log('OK testOwnerFinanceDoesNotLeakDeniedProjects');
}

function main() {
  testOwnerSeesOnlyAllowedProjects();
  testOwnerDoesNotSeeOtherMenesesProjects();
  testOwnerCannotAccessUnreleasedProjectUrl();
  testOwnerFinanceScopedByProject();
  testAdminStillSeesAllProjects();
  testBrokerBehaviorUnchanged();
  testSuperAdminUnaffected();
  testOwnerDashboardSumsOnlyAllowedProjects();
  testOwnerMapListsOnlyAllowedProjects();
  testOwnerFinanceDoesNotMixOtherDevelopments();
  testOwnerRoleAndPermissionsHelpers();
  testOwnersMenuAndRouteAccess();
  testOwnerProfileTypesAndInactive();
  testOwnersSessionExpiredMessage();
  testOwnerOrphanEmailValidation();
  testOwnerFinanceCashFlowScoped();
  testOwnerFinanceCommissionsScoped();
  testOwnerModuleSpecificProjectIds();
  testOwnerTodosProjetosMeansAllowedOnly();
  testOwnerWithDashboardStaysOnDashboardRoute();
  testOwnerWithoutDashboardRedirectsToFirstAllowedModule();
  testOwnerNavigationRoutesStayOnAllowedModules();
  testOwnerEmptyAccessRowsDoNotForceMapRedirect();
  testAdminFinanceListsAllTenantProjects();
  testAdminFinanceReceiptsNotScopedByOwnerAccess();
  testAdminFinanceCashMovementsNotScopedByOwnerAccess();
  testAdminFinanceCardsUseTenantData();
  testOwnerFinanceStillScopedByAllowedProjects();
  testOwnerFinanceDoesNotLeakDeniedProjects();
  console.log('mandatory-owner-project-access-tests: all passed');
}

main();
