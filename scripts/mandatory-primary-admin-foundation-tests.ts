/**
 * Testes obrigatórios — Fase 0 Administrador Principal.
 * npx tsx scripts/mandatory-primary-admin-foundation-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRIMARY_ADMIN_LABEL,
  PRIMARY_ADMIN_LOCKED_MESSAGE,
  SECONDARY_ADMIN_LABEL,
  assertPrimaryAdminNotLocked,
  canReplacePrimaryAdmin,
  companyAdminAuthorityLabel,
  companyAdminWriteHttpStatus,
  evaluatePrimaryAdminCandidate,
  isPrimaryAdminUser,
  suggestPrimaryAdminCandidate,
} from '../lib/companyPrimaryAdmin';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const COMPANY = 'cccccccc-1111-4000-8000-000000000001';
const OTHER = 'cccccccc-2222-4000-8000-000000000002';
const FIRST = 'aaaaaaaa-1111-4000-8000-000000000001';
const SECOND = 'aaaaaaaa-2222-4000-8000-000000000002';
const THIRD = 'aaaaaaaa-3333-4000-8000-000000000003';

function admin(over: Record<string, string | null> = {}) {
  return {
    id: FIRST,
    tenant_id: COMPANY,
    role: 'ADMIN',
    status: 'ACTIVE',
    ...over,
  };
}

function testANewCompanyFirstAdminBecomesPrimary() {
  const createSrc = read('app/api/companies/create/route.ts');
  const profileIdx = createSrc.indexOf('Cadastrando perfil em public.users');
  const assignIdx = createSrc.indexOf('assignFirstCompanyPrimaryAdmin(supabaseAdmin, newCompanyId, authUserId)');
  assert(createSrc.includes('assignFirstCompanyPrimaryAdmin'), 'create grava primary no primeiro admin');
  assert(profileIdx > 0 && assignIdx > profileIdx, 'grava depois do perfil do primeiro admin');
  const assigned = canReplacePrimaryAdmin(null, FIRST, false);
  assert(assigned.ok, 'empresa nova aceita o primeiro admin');
  console.log('OK A nova empresa — primeiro admin vira primary_admin_user_id');
}

function testBSecondAdminDoesNotChange() {
  const blocked = canReplacePrimaryAdmin(FIRST, SECOND, false);
  assert(!blocked.ok, 'segundo admin não substitui o Principal');
  const createAdminSrc = read('lib/companyAdminUsers.ts');
  assert(
    !createAdminSrc.includes('assignCompanyPrimaryAdmin') &&
      !createAdminSrc.includes('assignFirstCompanyPrimaryAdmin'),
    'Novo administrador não grava primary_admin_user_id',
  );
  assert(createAdminSrc.includes("params.role || 'ADMIN_EMPRESA'"), 'novo admin operacional permanece ADMIN_EMPRESA');
  console.log('OK B segundo admin não muda primary_admin_user_id');
}

function testCThirdAdminDoesNotChange() {
  const blocked = canReplacePrimaryAdmin(FIRST, THIRD, false);
  assert(!blocked.ok, 'terceiro admin não substitui o Principal');
  console.log('OK C terceiro admin também não muda');
}

function testDBadgeOnlyForPointedUser() {
  assert(companyAdminAuthorityLabel(FIRST, FIRST) === PRIMARY_ADMIN_LABEL, 'apontado recebe Principal');
  assert(companyAdminAuthorityLabel(SECOND, FIRST) === SECONDARY_ADMIN_LABEL, 'demais recebem Administrador');
  const ui = read('components/settings/TenantCompanyAdminsPanel.tsx');
  assert(ui.includes('companyAdminAuthorityLabel'), 'badge usa helper canônico');
  assert(ui.includes('meta?.primaryAdminUserId'), 'badge vem do id real');
  assert(!ui.includes("r === 'ADMIN' return 'Administrador principal'"), 'não infere pelo role');
  assert(!ui.includes('admin.created_by'), 'não infere por created_by');
  console.log('OK D badge somente no usuário apontado');
}

function testEAdminRoleIsNotEnough() {
  assert(!isPrimaryAdminUser(FIRST, SECOND), 'ADMIN sem o id apontado não é Principal');
  assert(companyAdminAuthorityLabel(FIRST, null) === SECONDARY_ADMIN_LABEL, 'sem coluna não há Principal');
  const okRole = evaluatePrimaryAdminCandidate(admin({ role: 'ADMIN' }), COMPANY);
  assert(okRole.ok, 'ADMIN pode ser candidato válido');
  assert(companyAdminAuthorityLabel(FIRST, SECOND) === SECONDARY_ADMIN_LABEL, 'role ADMIN sozinho não basta');
  console.log('OK E role ADMIN sozinho não basta');
}

function testFAdminEmpresaNotAutoPrimary() {
  const candidate = evaluatePrimaryAdminCandidate(admin({ id: SECOND, role: 'ADMIN_EMPRESA' }), COMPANY);
  assert(candidate.ok, 'ADMIN_EMPRESA é papel operacional permitido');
  assert(companyAdminAuthorityLabel(SECOND, FIRST) === SECONDARY_ADMIN_LABEL, 'ADMIN_EMPRESA não vira Principal sozinho');
  const createAdminSrc = read('lib/companyAdminUsers.ts');
  assert(createAdminSrc.includes("params.role || 'ADMIN_EMPRESA'"), 'criação normal usa ADMIN_EMPRESA');
  console.log('OK F ADMIN_EMPRESA não vira Principal automaticamente');
}

function testGOtherTenantRejected() {
  const cross = evaluatePrimaryAdminCandidate(admin({ tenant_id: OTHER }), COMPANY);
  assert(!cross.ok, 'outro tenant bloqueado');
  assert(cross.error?.includes('mesma empresa'), 'mensagem de tenant');
  console.log('OK G usuário de outro tenant não pode ser atribuído');
}

function testHSuperAdminRejected() {
  const superAdmin = evaluatePrimaryAdminCandidate(
    admin({ role: 'SUPER_ADMIN', tenant_id: COMPANY }),
    COMPANY,
  );
  assert(!superAdmin.ok, 'SUPER_ADMIN bloqueado');
  assert(superAdmin.error?.includes('SUPER_ADMIN'), 'mensagem SaaS');
  const implicit = isPrimaryAdminUser('super', null);
  assert(!implicit, 'SUPER_ADMIN não vira Principal implicitamente');
  console.log('OK H SUPER_ADMIN não vira Principal implicitamente');
}

function testIPrimaryCannotBeDeactivated() {
  const lock = assertPrimaryAdminNotLocked(FIRST, FIRST, 'deactivate');
  assert(!lock.ok, 'desativar Principal bloqueado');
  assert(lock.error === PRIMARY_ADMIN_LOCKED_MESSAGE, 'mensagem obrigatória');
  const other = assertPrimaryAdminNotLocked(SECOND, FIRST, 'deactivate');
  assert(other.ok, 'admin operacional pode ser desativado');
  assert(companyAdminWriteHttpStatus(PRIMARY_ADMIN_LOCKED_MESSAGE) === 409, 'API comum responde 409');
  const usersSrc = read('lib/companyAdminUsers.ts');
  assert(usersSrc.includes('assertPrimaryAdminNotLocked'), 'update API aplica o lock');
  const ui = read('components/settings/TenantCompanyAdminsPanel.tsx');
  assert(ui.includes('disabled={isPrimary}'), 'UI comum não desativa o Principal');
  assert(ui.includes('PRIMARY_ADMIN_LOCKED_MESSAGE'), 'UI usa a mensagem canônica');
  console.log('OK I Primary Admin não pode ser excluído/desativado pela UI/API comum');
}

function testJNormalAdminCreateStillWorks() {
  const createAdminSrc = read('lib/companyAdminUsers.ts');
  assert(createAdminSrc.includes('export async function createCompanyAdminUser'), 'criação normal preservada');
  assert(createAdminSrc.includes('canCreateCompanyAdmin'), 'limite contratual permanece');
  const panel = read('components/settings/TenantCompanyAdminsPanel.tsx');
  assert(panel.includes('Novo administrador'), 'botão Novo administrador permanece');
  console.log('OK J criação normal de administradores continua funcionando');
}

function testSuggestionIsReadOnlyHeuristic() {
  const suggestion = suggestPrimaryAdminCandidate({
    companyId: COMPANY,
    primaryAdminUserId: null,
    admins: [
      {
        id: FIRST,
        email: 'primeiro@demo.com',
        full_name: 'Admin Original',
        role: 'ADMIN',
        status: 'ACTIVE',
        created_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: SECOND,
        email: 'marcos@demo.com',
        full_name: 'Marcos Francisco de Oliveira',
        role: 'ADMIN_EMPRESA',
        status: 'ACTIVE',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  assert(suggestion.suggestedUserId === FIRST, 'heurística aponta o ADMIN mais antigo');
  assert(suggestion.confidence === 'high', 'confiança alta com único ADMIN');
  assert(suggestion.reason.includes('sem backfill'), 'não autoriza backfill');
  console.log('OK heurística READ-ONLY sem backfill');
}

function testSchemaAndCreateLocks() {
  const sql = read('supabase/migrations/20261020120000_companies_primary_admin_user_id.sql');
  assert(sql.includes('primary_admin_user_id uuid'), 'coluna uuid');
  assert(sql.includes('ON DELETE RESTRICT'), 'FK restringe exclusão acidental');
  assert(sql.includes('enforce_companies_primary_admin_identity'), 'trigger de identidade');
  assert(!sql.includes("'PRIMARY_ADMIN'"), 'não cria role PRIMARY_ADMIN');
  const updateSrc = read('lib/companiesUpdateService.ts');
  assert(updateSrc.includes('delete updatePayload.primary_admin_user_id'), 'update de empresa não aceita o campo');
  console.log('OK schema e proteção client-side');
}

function main() {
  testANewCompanyFirstAdminBecomesPrimary();
  testBSecondAdminDoesNotChange();
  testCThirdAdminDoesNotChange();
  testDBadgeOnlyForPointedUser();
  testEAdminRoleIsNotEnough();
  testFAdminEmpresaNotAutoPrimary();
  testGOtherTenantRejected();
  testHSuperAdminRejected();
  testIPrimaryCannotBeDeactivated();
  testJNormalAdminCreateStillWorks();
  testSuggestionIsReadOnlyHeuristic();
  testSchemaAndCreateLocks();
  console.log('\nOK — mandatory-primary-admin-foundation-tests passed');
}

main();
