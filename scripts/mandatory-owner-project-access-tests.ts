/**
 * Testes obrigatórios — acesso OWNER por empreendimento.
 * npx tsx scripts/mandatory-owner-project-access-tests.ts
 */

import {
  aggregateOwnerPermissions,
  canOwnerAccessProject,
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIds,
  isOwnerBlockedRoute,
  isOwnerUser,
  isTenantAdminRole,
  ownerCanAccessModule,
  resolveContractProjectId,
  resolveReceiptProjectId,
  type OwnerProjectAccessRow,
} from '../lib/ownerProjectAccess';
import { isBrokerRole, isOwnerRole, canManageGisProject } from '../lib/rolePermissions';
import { isPlatformAdmin } from '../lib/rls';

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
  assert(!isOwnerBlockedRoute('/map'), 'OWNER pode acessar mapa');
  console.log('OK testOwnerRoleAndPermissionsHelpers');
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
  console.log('mandatory-owner-project-access-tests: all passed');
}

main();
