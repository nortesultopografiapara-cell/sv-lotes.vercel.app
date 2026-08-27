/**
 * Autorização SUPER_ADMIN de /api/companies/cleanup, delete-test e create.
 * npx tsx scripts/mandatory-companies-admin-auth-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  authorizeCompanyAdminRequest,
  companyAdminForbiddenJson,
  companyAdminUnauthorizedJson,
  executeCompanyAdminPost,
  isCompanyAdminApiPath,
  type CompanyAdminAuthDeps,
} from '../lib/companyAdminApiAuth';

const root = path.join(__dirname, '..');

const APIS = [
  { name: 'cleanup', path: '/api/companies/cleanup', file: 'app/api/companies/cleanup/route.ts', execute: 'executeCompanyCleanup' },
  { name: 'delete-test', path: '/api/companies/delete-test', file: 'app/api/companies/delete-test/route.ts', execute: 'executeCompanyDeleteTest' },
  { name: 'create', path: '/api/companies/create', file: 'app/api/companies/create/route.ts', execute: 'executeCompanyCreate' },
] as const;

const DENIED_ROLES = ['BROKER', 'OWNER', 'ADMIN'] as const;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fakeUser(id: string): User {
  return { id } as User;
}

function fakeAdmin(): SupabaseClient {
  return { from: () => ({}) } as unknown as SupabaseClient;
}

function makeDeps(opts: {
  userId?: string | null;
  configError?: string | null;
  role?: string | null;
}): {
  deps: CompanyAdminAuthDeps;
  counters: {
    createAdminCalls: number;
    assertSuperAdminCalls: number;
    assertSuperAdminUserIds: string[];
  };
} {
  const counters = {
    createAdminCalls: 0,
    assertSuperAdminCalls: 0,
    assertSuperAdminUserIds: [] as string[],
  };
  const role = opts.role ?? 'SUPER_ADMIN';
  const deps: CompanyAdminAuthDeps = {
    getRequestAuthUser: async () => ({
      user: opts.userId ? fakeUser(opts.userId) : null,
      configError: opts.configError ?? null,
    }),
    createAdminSupabase: () => {
      counters.createAdminCalls += 1;
      return { client: fakeAdmin(), configError: null };
    },
    assertSuperAdmin: async (_admin, userId) => {
      counters.assertSuperAdminCalls += 1;
      if (userId) counters.assertSuperAdminUserIds.push(String(userId));
      if (!userId || role !== 'SUPER_ADMIN') {
        return { ok: false, error: 'Permissão negada.' };
      }
      return { ok: true };
    },
  };
  return { deps, counters };
}

async function invokeApi(
  apiPath: string,
  deps: CompanyAdminAuthDeps,
  body: Record<string, unknown>,
  privileged: () => Promise<{ status: number; body: Record<string, unknown> }>,
) {
  const req = new Request(`http://localhost${apiPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return executeCompanyAdminPost(req, deps, privileged);
}

async function testAnonymousCannotReachServiceRoleWrites() {
  for (const api of APIS) {
    const box = makeDeps({ userId: null });
    let serviceRoleWriteCalls = 0;
    const res = await invokeApi(api.path, box.deps, { userId: 'spoof-super-admin' }, async () => {
      serviceRoleWriteCalls += 1;
      return { status: 200, body: { leaked: true } };
    });
    assert(res.status === 401, `${api.name} anônimo 401`);
    assert(res.authorized === false, `${api.name} anônimo não autorizado`);
    assert(res.body.code === 'UNAUTHORIZED', `${api.name} code UNAUTHORIZED`);
    assert(res.body.error === 'Não autenticado.', `${api.name} mensagem 401`);
    assert(serviceRoleWriteCalls === 0, `${api.name} anônimo serviceRoleWriteCalls === 0`);
    assert(box.counters.createAdminCalls === 0, `${api.name} anônimo sem createAdminSupabase`);
    assert(box.counters.assertSuperAdminCalls === 0, `${api.name} anônimo sem assertSuperAdmin`);
  }
  console.log('OK testAnonymousCannotReachServiceRoleWrites');
}

async function testDeniedRolesCannotReachServiceRoleWrites() {
  for (const api of APIS) {
    for (const role of DENIED_ROLES) {
      const sessionUserId = `${role.toLowerCase()}-session`;
      const box = makeDeps({ userId: sessionUserId, role });
      let serviceRoleWriteCalls = 0;
      const res = await invokeApi(
        api.path,
        box.deps,
        { userId: '00000000-0000-0000-0000-aaaaaaaaaaaa', callerUserId: 'spoof' },
        async () => {
          serviceRoleWriteCalls += 1;
          return { status: 200, body: { leaked: true } };
        },
      );
      assert(res.status === 403, `${api.name} ${role} 403`);
      assert(res.authorized === false, `${api.name} ${role} não autorizado`);
      assert(res.body.code === 'FORBIDDEN', `${api.name} ${role} code FORBIDDEN`);
      assert(serviceRoleWriteCalls === 0, `${api.name} ${role} serviceRoleWriteCalls === 0`);
      assert(box.counters.createAdminCalls === 1, `${api.name} ${role} role lookup via admin client`);
      assert(box.counters.assertSuperAdminCalls === 1, `${api.name} ${role} assertSuperAdmin`);
      assert(
        box.counters.assertSuperAdminUserIds[0] === sessionUserId,
        `${api.name} ${role} usa user.id da sessão, não body.userId`,
      );
    }
  }
  console.log('OK testDeniedRolesCannotReachServiceRoleWrites');
}

async function testSuperAdminReachesLegitimateLogic() {
  for (const api of APIS) {
    const sessionUserId = 'super-admin-session';
    const box = makeDeps({ userId: sessionUserId, role: 'SUPER_ADMIN' });
    let serviceRoleWriteCalls = 0;
    const res = await invokeApi(
      api.path,
      box.deps,
      { userId: 'ignored-body-user' },
      async () => {
        serviceRoleWriteCalls += 1;
        return { status: 200, body: { success: true, api: api.name, privileged: true } };
      },
    );
    assert(res.status === 200, `${api.name} SUPER_ADMIN 200`);
    assert(res.authorized === true, `${api.name} SUPER_ADMIN authorized`);
    assert(res.body.success === true, `${api.name} SUPER_ADMIN chega à lógica`);
    assert(res.body.api === api.name, `${api.name} stub da rota certa`);
    assert(serviceRoleWriteCalls === 1, `${api.name} SUPER_ADMIN privileged uma vez`);
    assert(
      box.counters.assertSuperAdminUserIds[0] === sessionUserId,
      `${api.name} SUPER_ADMIN autoriza pela sessão`,
    );
  }
  console.log('OK testSuperAdminReachesLegitimateLogic');
}

async function testAuthorizeHelperMatrix() {
  const anon = makeDeps({ userId: null });
  const anonReq = new Request('http://localhost/api/companies/cleanup');
  const anonGate = await authorizeCompanyAdminRequest(anonReq, anon.deps);
  assert(!anonGate.ok && anonGate.status === 401, 'authorize anônimo');
  assert(anon.counters.createAdminCalls === 0, 'authorize anônimo sem admin client');

  const broker = makeDeps({ userId: 'broker-1', role: 'BROKER' });
  const brokerGate = await authorizeCompanyAdminRequest(anonReq, broker.deps);
  assert(!brokerGate.ok && brokerGate.status === 403, 'authorize BROKER');

  const sa = makeDeps({ userId: 'sa-1', role: 'SUPER_ADMIN' });
  const saGate = await authorizeCompanyAdminRequest(anonReq, sa.deps);
  assert(saGate.ok === true && saGate.userId === 'sa-1', 'authorize SUPER_ADMIN');
  console.log('OK testAuthorizeHelperMatrix');
}

function testRouteWiresGateBeforePrivilegedWork() {
  for (const api of APIS) {
    const src = read(api.file);
    assert(src.includes('authorizeCompanyAdminRequest'), `${api.name} usa o gate`);
    assert(src.includes('getRequestAuthUser'), `${api.name} sessão canônica`);
    assert(src.includes('assertSuperAdmin'), `${api.name} role canônica`);
    assert(src.includes('createAdminSupabase'), `${api.name} admin canônico`);
    assert(src.includes(`async function ${api.execute}`), `${api.name} lógica extraída sem refactor`);
    const postBlock = src.slice(
      src.indexOf('export async function POST'),
      src.indexOf(`async function ${api.execute}`),
    );
    assert(postBlock.includes('authorizeCompanyAdminRequest'), `${api.name} POST chama o gate`);
    assert(postBlock.includes('if (!gate.ok)'), `${api.name} retorna antes da lógica se o gate falhar`);
    assert(!postBlock.includes('createClient('), `${api.name} POST não cria service role antes do gate`);
    assert(!postBlock.includes('listUsers'), `${api.name} POST não lista Auth antes do gate`);
    assert(!postBlock.includes('body.userId'), `${api.name} gate não lê body.userId`);
    assert(!/assertSuperAdmin\([^,]+,\s*body\.userId/.test(src), `${api.name} não autoriza por body.userId`);
  }

  const cleanup = read('app/api/companies/cleanup/route.ts');
  assert(cleanup.includes('listUsers'), 'cleanup ainda lista Auth users');
  assert(cleanup.includes('testCompaniesRemoved'), 'cleanup ainda remove empresas de teste');
  assert(cleanup.includes('orphanedAuthUsers'), 'cleanup ainda trata órfãos');

  const deleteTest = read('app/api/companies/delete-test/route.ts');
  assert(deleteTest.includes('is_test_company'), 'delete-test ainda exige empresa de teste');
  assert(deleteTest.includes("from('companies').delete()"), 'delete-test ainda exclui empresa');
  assert(deleteTest.includes('hasOperationalData'), 'delete-test ainda bloqueia dados operacionais');

  const create = read('app/api/companies/create/route.ts');
  assert(create.includes('generateSlug'), 'create ainda gera slug');
  assert(create.includes('safeCompanyInsertWithSchemaFallback'), 'create ainda insere empresa');
  assert(create.includes('auth.admin.createUser'), 'create ainda cria admin');
  assert(create.includes('ensureSaasSubscription'), 'create ainda provisiona SaaS');
  assert(create.includes('[ROLLBACK INICIADO]'), 'create ainda faz rollback');

  console.log('OK testRouteWiresGateBeforePrivilegedWork');
}

function testMiddlewareAnonymous401WithoutMakingPublic() {
  const mw = read('middleware.ts');
  const publicBlock = mw.slice(mw.indexOf('const publicRoutes'), mw.indexOf('const isCompanyExportApi'));
  for (const api of APIS) {
    assert(!publicBlock.includes(`'${api.path}'`), `${api.path} não é publicRoute`);
    assert(isCompanyAdminApiPath(api.path), `${api.path} reconhecido`);
    assert(isCompanyAdminApiPath(`${api.path}/`), `${api.path}/ reconhecido`);
  }
  assert(!isCompanyAdminApiPath('/api/companies/status'), 'status não entra neste hotfix');
  assert(!isCompanyAdminApiPath('/api/companies/update'), 'update não entra neste hotfix');
  assert(!isCompanyAdminApiPath('/api/companies/delete'), 'delete permanente não entra neste hotfix');
  assert(mw.includes('isCompanyAdminApiPath'), 'middleware usa helper');
  assert(mw.includes('companyAdminUnauthorizedJson'), 'middleware 401 JSON anônimo');
  assert(JSON.stringify(companyAdminUnauthorizedJson()) === JSON.stringify({ error: 'Não autenticado.', code: 'UNAUTHORIZED' }), '401 estável');
  assert(JSON.stringify(companyAdminForbiddenJson()) === JSON.stringify({ error: 'Permissão negada.', code: 'FORBIDDEN' }), '403 estável');
  console.log('OK testMiddlewareAnonymous401WithoutMakingPublic');
}

function testCanonicalHelpersReused() {
  const helper = read('lib/companyAdminApiAuth.ts');
  assert(helper.includes('deps.getRequestAuthUser(request)'), 'sessão via getRequestAuthUser');
  assert(helper.includes('deps.assertSuperAdmin(supabaseAdmin, user.id)'), 'role via assertSuperAdmin(user.id)');
  assert(!helper.includes('body.userId'), 'helper não lê body.userId');
  assert(!helper.includes("from '@/lib/supabase/server'"), 'helper não instancia cliente Next');
  for (const api of APIS) {
    const src = read(api.file);
    assert(src.includes("from '@/lib/supabase/server'"), `${api.name} reutiliza getRequestAuthUser`);
    assert(src.includes("from '@/lib/apiSuperAdmin'"), `${api.name} reutiliza assertSuperAdmin`);
    assert(src.includes('getRequestAuthUser,'), `${api.name} injeta sessão da request`);
    assert(src.includes('assertSuperAdmin,'), `${api.name} injeta assertSuperAdmin`);
  }
  console.log('OK testCanonicalHelpersReused');
}

function testSiblingCompanyRoutesNotChanged() {
  const status = read('app/api/companies/status/route.ts');
  assert(status.includes('userId || callerId'), 'status ainda usa body.userId (fora deste hotfix)');
  assert(!status.includes('authorizeCompanyAdminRequest'), 'status não foi alterado neste hotfix');

  const update = read('app/api/companies/update/route.ts');
  assert(update.includes('assertMasterCanUpdateCompany'), 'update permanece com helper próprio');
  assert(!update.includes('authorizeCompanyAdminRequest'), 'update não foi alterado neste hotfix');

  const del = read('app/api/companies/delete/route.ts');
  assert(del.includes('signInWithPassword'), 'delete permanente permanece com senha no body');
  assert(!del.includes('authorizeCompanyAdminRequest'), 'delete permanente não foi alterado');

  const report = read('app/api/companies/dependency-report/route.ts');
  assert(!report.includes('authorizeCompanyAdminRequest'), 'dependency-report não foi alterado');
  assert(report.includes('SUPABASE_SERVICE_ROLE_KEY'), 'dependency-report ainda usa service role');

  const sub = read('app/api/companies/[id]/subscription/create/route.ts');
  assert(sub.includes('body.userId'), 'subscription/create ainda autoriza por body.userId');
  console.log('OK testSiblingCompanyRoutesNotChanged');
}

function testModelsAndModulesUntouched() {
  const helper = read('lib/companyAdminApiAuth.ts');
  const mw = read('middleware.ts');
  for (const src of [helper, mw]) {
    assert(!src.includes('araguaiaContractClauses'), 'não toca ARAGUAIA');
    assert(!src.includes('menesesContractClauses'), 'não toca MENESES');
    assert(!src.includes('recantoPrimavera'), 'não toca RECANTO');
  }
  const template = read('lib/contractTemplate.ts');
  assert(template.includes('resolveSaleContractModel'), 'dispatcher de modelos intacto');
  console.log('OK testModelsAndModulesUntouched');
}

async function main() {
  testCanonicalHelpersReused();
  testRouteWiresGateBeforePrivilegedWork();
  testMiddlewareAnonymous401WithoutMakingPublic();
  testSiblingCompanyRoutesNotChanged();
  testModelsAndModulesUntouched();
  await testAuthorizeHelperMatrix();
  await testAnonymousCannotReachServiceRoleWrites();
  await testDeniedRolesCannotReachServiceRoleWrites();
  await testSuperAdminReachesLegitimateLogic();
  console.log('mandatory-companies-admin-auth-tests: all passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
