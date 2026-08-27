/**
 * Autorização de /api/regenerate — regeneração em massa.
 * npx tsx scripts/mandatory-api-regenerate-auth-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  decideBulkRegenerateAccess,
  isBulkRegeneratePath,
  isBulkRegenerateRoleAllowed,
} from '../lib/bulkContractRegenerateAuth';
import {
  executeBulkRegenerate,
  type BulkRegenerateHandlerDeps,
} from '../lib/bulkContractRegenerateHandler';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const root = path.join(__dirname, '..');

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
  roleOk?: boolean;
  refresh?: () => Promise<{ updatedCount: number }>;
}): { deps: BulkRegenerateHandlerDeps; refreshCalls: number } {
  let refreshCalls = 0;
  const admin = fakeAdmin();
  const deps: BulkRegenerateHandlerDeps = {
    getRequestAuthUser: async () => ({
      user: opts.userId ? fakeUser(opts.userId) : null,
      configError: opts.configError ?? null,
    }),
    createAdminSupabase: () => ({ client: admin, configError: null }),
    assertSuperAdmin: async () =>
      opts.roleOk === false ? { ok: false, error: 'Permissão negada.' } : { ok: true },
    refreshAllContractGeneratedHtml: async () => {
      refreshCalls += 1;
      if (opts.refresh) return opts.refresh();
      return { updatedCount: 2 };
    },
  };
  return {
    deps,
    get refreshCalls() {
      return refreshCalls;
    },
  };
}

async function testAnonymousCannotExecute() {
  const getBox = makeDeps({ userId: null });
  const postBox = makeDeps({ userId: null });
  const req = new Request('http://localhost/api/regenerate');
  const getRes = await executeBulkRegenerate(req, 'GET', getBox.deps);
  const postRes = await executeBulkRegenerate(req, 'POST', postBox.deps);
  assert(getRes.status === 401, 'GET anônimo 401');
  assert(postRes.status === 401, 'POST anônimo 401');
  assert(getRes.body.code === 'UNAUTHORIZED', 'GET code');
  assert(postRes.body.code === 'UNAUTHORIZED', 'POST code');
  assert(!String(getRes.body.error || '').toLowerCase().includes('service'), 'sem service role');
  assert(getBox.refreshCalls === 0, 'GET anônimo não escreve');
  assert(postBox.refreshCalls === 0, 'POST anônimo não escreve');
  console.log('OK testAnonymousCannotExecute');
}

async function testAuthenticatedCommonUserDenied() {
  const box = makeDeps({ userId: 'user-common', roleOk: false });
  const req = new Request('http://localhost/api/regenerate');
  const res = await executeBulkRegenerate(req, 'POST', box.deps);
  assert(res.status === 403, 'usuário comum 403');
  assert(res.body.code === 'FORBIDDEN', 'code FORBIDDEN');
  assert(box.refreshCalls === 0, 'comum não escreve');
  console.log('OK testAuthenticatedCommonUserDenied');
}

async function testAdminWithoutSuperAdminDenied() {
  const getBox = makeDeps({ userId: 'admin-1', roleOk: false });
  const postBox = makeDeps({ userId: 'admin-1', roleOk: false });
  const req = new Request('http://localhost/api/regenerate');
  const getRes = await executeBulkRegenerate(req, 'GET', getBox.deps);
  const postRes = await executeBulkRegenerate(req, 'POST', postBox.deps);
  assert(getRes.status === 403, 'ADMIN GET 403');
  assert(postRes.status === 403, 'ADMIN POST 403');
  assert(getBox.refreshCalls === 0, 'ADMIN GET não escreve');
  assert(postBox.refreshCalls === 0, 'ADMIN POST não escreve');
  assert(!isBulkRegenerateRoleAllowed('ADMIN'), 'ADMIN não é SUPER_ADMIN');
  assert(!isBulkRegenerateRoleAllowed('BROKER'), 'BROKER não é SUPER_ADMIN');
  assert(!isBulkRegenerateRoleAllowed('OWNER'), 'OWNER não é SUPER_ADMIN');
  assert(!isBulkRegenerateRoleAllowed('MASTER-ADMIN'), 'MASTER-ADMIN não passa neste hotfix');
  console.log('OK testAdminWithoutSuperAdminDenied');
}

async function testSuperAdminAllowed() {
  const getBox = makeDeps({ userId: 'sa-1', roleOk: true });
  const postBox = makeDeps({ userId: 'sa-1', roleOk: true });
  const req = new Request('http://localhost/api/regenerate');
  const getRes = await executeBulkRegenerate(req, 'GET', getBox.deps);
  const postRes = await executeBulkRegenerate(req, 'POST', postBox.deps);
  assert(getRes.status === 200, 'SUPER_ADMIN GET 200');
  assert(getRes.body.write === false, 'GET sem escrita');
  assert(getBox.refreshCalls === 0, 'GET SUPER_ADMIN não chama refresh');
  assert(postRes.status === 200, 'SUPER_ADMIN POST 200');
  assert(postRes.body.success === true, 'POST success');
  assert(postRes.body.updatedCount === 2, 'POST updatedCount');
  assert(postBox.refreshCalls === 1, 'POST SUPER_ADMIN chama refresh uma vez');
  assert(isBulkRegenerateRoleAllowed('SUPER_ADMIN'), 'role SUPER_ADMIN');
  console.log('OK testSuperAdminAllowed');
}

function testDecideAccessMatrix() {
  const anon = decideBulkRegenerateAccess({ userId: null });
  assert(!anon.allow && anon.status === 401, 'decide anônimo');
  const admin = decideBulkRegenerateAccess({ userId: 'a', role: 'ADMIN' });
  assert(!admin.allow && admin.status === 403, 'decide ADMIN');
  const sa = decideBulkRegenerateAccess({ userId: 's', role: 'SUPER_ADMIN' });
  assert(sa.allow === true, 'decide SUPER_ADMIN');
  const down = decideBulkRegenerateAccess({ serviceUnavailable: true });
  assert(!down.allow && down.status === 503, 'decide 503');
  console.log('OK testDecideAccessMatrix');
}

function testMiddlewareAndPublicRoutes() {
  const mw = read('middleware.ts');
  const publicBlock = mw.slice(mw.indexOf('const publicRoutes'), mw.indexOf('const isCompanyExportApi'));
  assert(!/['"]\/api\/regenerate['"]/.test(publicBlock), 'publicRoutes sem /api/regenerate');
  assert(mw.includes("'/login'"), 'login público');
  assert(mw.includes("'/api/sign'"), 'sign público');
  assert(mw.includes("'/api/payments/webhook'"), 'webhook público');
  assert(mw.includes("'/portal-cliente'"), 'portal público');
  assert(mw.includes("'/api/company-lookup'"), 'company-lookup público');
  assert(mw.includes("'/api/setup'"), 'setup permanece na lista pública deste hotfix');
  assert(mw.includes('isBulkRegeneratePath'), 'middleware usa helper');
  assert(mw.includes('bulkRegenerateUnauthorizedJson'), 'middleware 401 anônimo');
  assert(read('lib/bulkContractRegenerateAuth.ts').includes('Não autenticado.'), 'mensagem 401 segura');
  assert(isBulkRegeneratePath('/api/regenerate'), 'path exato');
  assert(isBulkRegeneratePath('/api/regenerate/'), 'path prefixo');
  assert(!isBulkRegeneratePath('/api/contracts/1/regenerate'), 'não captura regenerate por contrato');
  console.log('OK testMiddlewareAndPublicRoutes');
}

function testRouteDoesNotLeakSecrets() {
  const route = read('app/api/regenerate/route.ts');
  const handler = read('lib/bulkContractRegenerateHandler.ts');
  assert(!route.includes('SUPABASE_SERVICE_ROLE_KEY'), 'rota não cita service role');
  assert(!handler.includes('SUPABASE_SERVICE_ROLE_KEY'), 'handler não cita service role');
  assert(route.includes("executeBulkRegenerate(request, 'GET'"), 'GET delega');
  assert(route.includes("executeBulkRegenerate(request, 'POST'"), 'POST delega');
  assert(handler.includes("method === 'GET'"), 'GET sem escrita');
  assert(handler.includes('refreshAllContractGeneratedHtml'), 'POST usa refresh extraído');
  assert(!route.includes('generateContractHTML'), 'rota não gera HTML direto');
  console.log('OK testRouteDoesNotLeakSecrets');
}

function testRefreshSourcePreservesLegacyLogic() {
  const src = read('lib/bulkContractHtmlRefresh.ts');
  assert(src.includes('generateContractHTML'), 'ainda gera HTML pelo dispatcher existente');
  assert(src.includes('generated_html: newHtml'), 'ainda grava generated_html');
  assert(src.includes('ensureValidContractNumber'), 'ainda corrige número inválido');
  assert(src.includes('finance_receipts'), 'ainda lê parcelas');
  assert(src.includes("from('companies')"), 'ainda lê tenant');
  assert(src.includes('project_name_snapshot'), 'ainda preenche snapshot');
  assert(!src.includes('araguaiaContractClauses'), 'refresh não especializa ARAGUAIA');
  console.log('OK testRefreshSourcePreservesLegacyLogic');
}

function testModelsIsolated() {
  const auth = read('lib/bulkContractRegenerateAuth.ts');
  const refresh = read('lib/bulkContractHtmlRefresh.ts');
  const route = read('app/api/regenerate/route.ts');
  const handler = read('lib/bulkContractRegenerateHandler.ts');
  for (const src of [auth, refresh, route, handler]) {
    assert(!/PROMITENTE\(S\)/.test(src), 'hotfix não mexe em rótulos ARAGUAIA');
    assert(!src.includes('araguaiaContractClauses'), 'não importa cláusulas ARAGUAIA');
    assert(!src.includes('menesesContractClauses'), 'não importa MENESES');
    assert(!src.includes('recantoPrimavera'), 'não importa RECANTO');
  }
  const template = read('lib/contractTemplate.ts');
  assert(template.includes('resolveSaleContractModel'), 'dispatcher de modelos intacto');
  console.log('OK testModelsIsolated');
}

async function main() {
  testDecideAccessMatrix();
  testMiddlewareAndPublicRoutes();
  testRouteDoesNotLeakSecrets();
  testRefreshSourcePreservesLegacyLogic();
  testModelsIsolated();
  await testAnonymousCannotExecute();
  await testAuthenticatedCommonUserDenied();
  await testAdminWithoutSuperAdminDenied();
  await testSuperAdminAllowed();
  console.log('mandatory-api-regenerate-auth-tests: all passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
