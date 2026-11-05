/**
 * Simulação local da SEG-2B. Não abre banco e não escreve no Develop.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  brokerCreateTenantDecision,
  decideUsersIdentityChange,
  sessionCallerDecision,
  type UsersIdentityRow,
} from '../lib/security/usersIdentityGuard';

const root = resolve(__dirname, '..');
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error('FAIL', message);
  }
}

const self: UsersIdentityRow = {
  id: 'user-a',
  role: 'USER',
  tenantId: 'empresa-a',
  companyId: null,
};

const promoted: UsersIdentityRow = { ...self, role: 'SUPER_ADMIN' };
const moved: UsersIdentityRow = { ...self, tenantId: 'empresa-b' };
const renamed: UsersIdentityRow = { ...self, role: 'USER' };

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: false,
    actorId: 'user-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: self,
    newRow: promoted,
  }).reason === 'self_role',
  'usuário comum não altera o próprio papel',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: true,
    actorId: 'user-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: self,
    newRow: moved,
  }).reason === 'self_tenant',
  'usuário não troca a própria empresa',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: false,
    actorId: 'user-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: self,
    newRow: renamed,
  }).allow,
  'edição de perfil sem mudar papel ou empresa continua permitida',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: true,
    actorIsTenantAdmin: false,
    actorId: 'super',
    actorTenantId: null,
    operation: 'UPDATE',
    oldRow: { id: 'super', role: 'SUPER_ADMIN', tenantId: 'empresa-a', companyId: null },
    newRow: { id: 'super', role: 'SUPER_ADMIN', tenantId: null, companyId: null },
  }).allow,
  'SUPER_ADMIN pode limpar o próprio tenant ao sair do modo empresa',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: true,
    actorId: 'admin-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: { id: 'user-b', role: 'BROKER', tenantId: 'empresa-a', companyId: null },
    newRow: { id: 'user-b', role: 'ADMIN', tenantId: 'empresa-a', companyId: null },
  }).allow,
  'administrador da empresa altera papel local de outro usuário',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: true,
    actorId: 'admin-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: { id: 'user-b', role: 'BROKER', tenantId: 'empresa-a', companyId: null },
    newRow: { id: 'user-b', role: 'SUPER_ADMIN', tenantId: 'empresa-a', companyId: null },
  }).reason === 'role_reserved',
  'administrador da empresa não promove SUPER_ADMIN',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: true,
    actorId: 'admin-a',
    actorTenantId: 'empresa-a',
    operation: 'INSERT',
    newRow: { id: 'novo', role: 'BROKER', tenantId: 'empresa-b', companyId: null },
  }).reason === 'tenant_denied',
  'criação em outra empresa é negada',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'authenticated',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: false,
    actorId: 'user-a',
    actorTenantId: 'empresa-a',
    operation: 'UPDATE',
    oldRow: { id: 'user-b', role: 'USER', tenantId: 'empresa-b', companyId: null },
    newRow: { id: 'user-b', role: 'USER', tenantId: 'empresa-b', companyId: null },
  }).reason === 'other_user',
  'usuário comum não altera usuário de outra empresa',
);

assert(
  decideUsersIdentityChange({
    actorKind: 'anon',
    actorIsSuperAdmin: false,
    actorIsTenantAdmin: false,
    actorId: null,
    actorTenantId: null,
    operation: 'INSERT',
    newRow: self,
  }).reason === 'anon_denied',
  'anônimo não grava usuário',
);

assert(
  sessionCallerDecision({ sessionUserId: null, claimedCallerId: 'admin-a' }).reason === 'missing_session',
  'identificador enviado sem sessão não autoriza',
);

assert(
  brokerCreateTenantDecision({
    callerRole: 'ADMIN',
    callerTenantId: 'empresa-a',
    requestedTenantId: 'empresa-b',
  }).reason === 'foreign_tenant',
  'cadastro de corretor não aceita outra empresa',
);

const proposal = readFileSync(resolve(root, 'supabase/proposals/20261105180000_users_identity_lockdown.sql'), 'utf8');
const precheck = readFileSync(resolve(root, 'supabase/proposals/20261105180100_users_identity_precheck_readonly.sql'), 'utf8');
const finance = readFileSync(resolve(root, 'supabase/proposals/20261105170000_finance_receipts_rls_lockdown.sql'), 'utf8');

assert(proposal.includes('USERS_IDENTITY:SELF_ROLE'), 'proposta bloqueia autopromoção');
assert(proposal.includes('Enable read access for all users'), 'proposta remove a leitura aberta');
assert(!proposal.includes('USING (true)'), 'proposta não recria policy aberta');
assert(proposal.includes('SEG2B_ANON_PRIVILEGE'), 'proposta aborta se anon conservar privilégio');
assert(proposal.includes('SEG2B_AUTHENTICATED_TRUNCATE'), 'proposta aborta se authenticated conservar TRUNCATE');
assert(!precheck.includes('INSERT INTO'), 'inventário não grava linhas');
assert(finance.includes('SEG2A_UNEXPECTED_POLICY'), 'proposta financeira da SEG-2A permanece');
assert(
  readFileSync(resolve(root, 'app/api/users/create/route.ts'), 'utf8').includes('brokerCreateTenantDecision'),
  'cadastro de corretor consulta a decisão de empresa',
);
assert(
  !readFileSync(resolve(root, 'lib/ownersAdmin.ts'), 'utf8').includes('user?.id || callerUserIdFromClient'),
  'administração de proprietários não aceita identificador sem sessão',
);

if (failed > 0) {
  console.error(`users-identity-guard: ${failed} falha(s)`);
  process.exit(1);
}

console.log('users-identity-guard: ok');
