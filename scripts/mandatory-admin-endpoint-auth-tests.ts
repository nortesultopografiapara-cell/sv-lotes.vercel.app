/**
 * Decisões de autorização administrativa. Não abre banco, não cria usuário
 * e não chama a service role.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  authorizeBrokerCreate,
  sessionCallerDecision,
} from '../lib/security/usersIdentityGuard';

const root = resolve(__dirname, '..');
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error('FAIL', message);
  }
}

assert(
  sessionCallerDecision({ sessionUserId: null, claimedCallerId: 'admin-a' }).reason === 'missing_session',
  'requisição sem sessão é rejeitada',
);
assert(
  sessionCallerDecision({ sessionUserId: 'user-a', claimedCallerId: 'admin-a' }).reason === 'caller_mismatch',
  'identificador enviado pelo cliente não substitui a sessão',
);
assert(
  sessionCallerDecision({ sessionUserId: 'admin-a', claimedCallerId: 'admin-a' }).reason === 'session',
  'identificador igual ao da sessão é aceito',
);
assert(
  sessionCallerDecision({ sessionUserId: 'admin-a', claimedCallerId: '' }).allow,
  'sessão válida sem identificador extra é aceita',
);

const actors = ['USER', 'CORRETOR', 'BROKER', 'OWNER', 'MANAGER'] as const;
for (const role of actors) {
  const decision = authorizeBrokerCreate({
    sessionUserId: 'actor',
    callerRole: role,
    callerTenantId: 'empresa-a',
    requestedTenantId: 'empresa-a',
  });
  assert(!decision.allow && decision.reason === 'not_admin', `${role} não executa cadastro administrativo`);
}

const foreignAdmin = authorizeBrokerCreate({
  sessionUserId: 'admin-a',
  callerRole: 'ADMIN',
  callerTenantId: 'empresa-a',
  requestedTenantId: 'empresa-b',
});
assert(!foreignAdmin.allow && foreignAdmin.reason === 'foreign_tenant', 'administrador de imobiliária não cruza empresa');

for (const role of ['ADMIN', 'COMPANY_ADMIN', 'ADMIN_EMPRESA'] as const) {
  const decision = authorizeBrokerCreate({
    sessionUserId: 'admin-a',
    callerRole: role,
    callerTenantId: 'empresa-a',
    requestedTenantId: 'empresa-a',
  });
  assert(decision.allow && decision.reason === 'same_tenant', `${role} cadastra corretor na própria empresa`);
}

const platform = authorizeBrokerCreate({
  sessionUserId: 'super',
  callerRole: 'SUPER_ADMIN',
  callerTenantId: null,
  requestedTenantId: 'empresa-b',
});
assert(platform.allow && platform.reason === 'platform_admin', 'SUPER_ADMIN legítimo mantém o cadastro');

const anonymous = authorizeBrokerCreate({
  sessionUserId: null,
  callerRole: 'SUPER_ADMIN',
  callerTenantId: null,
  requestedTenantId: 'empresa-a',
});
assert(!anonymous.allow && anonymous.status === 401, 'papel alegado sem sessão não autoriza');

const createRoute = readFileSync(resolve(root, 'app/api/users/create/route.ts'), 'utf8');
const createBody = createRoute.slice(createRoute.indexOf('export async function POST'));
assert(
  createBody.indexOf('getRequestAuthUser') < createBody.indexOf('createClient('),
  'cadastro de corretor valida a sessão antes da service role',
);
assert(
  createBody.indexOf('authorizeBrokerCreate') < createBody.indexOf('auth.admin.createUser'),
  'cadastro de corretor autoriza antes de criar o usuário',
);
assert(!createRoute.includes('For now we trust the payload'), 'o cadastro publicado não confia mais no payload');

const ownerRoute = readFileSync(
  resolve(root, 'app/api/users/[id]/owner-project-access/route.ts'),
  'utf8',
);
const getBody = ownerRoute.slice(
  ownerRoute.indexOf('export async function GET'),
  ownerRoute.indexOf('export async function PUT'),
);
const putBody = ownerRoute.slice(ownerRoute.indexOf('export async function PUT'));
assert(
  getBody.indexOf('requireSessionCaller') < getBody.indexOf('createServiceSupabase()'),
  'leitura de acesso valida a sessão antes da service role',
);
assert(
  putBody.indexOf('requireSessionCaller') < putBody.indexOf('createServiceSupabase()'),
  'gravação de acesso valida a sessão antes da service role',
);
assert(ownerRoute.includes(".eq('id', userId)"), 'a consulta do administrador usa o id da sessão');
assert(!ownerRoute.includes(".eq('id', callerUserId)"), 'callerUserId do navegador não seleciona o administrador');

const ownersAdmin = readFileSync(resolve(root, 'lib/ownersAdmin.ts'), 'utf8');
assert(
  ownersAdmin.includes("reason: 'missing_session_user'"),
  'proprietários e administradores exigem sessão',
);
assert(
  !ownersAdmin.includes('user?.id || callerUserIdFromClient'),
  'callerUserId não preenche a identidade quando a sessão falta',
);

if (failed > 0) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}

console.log('admin endpoint auth: ok');
