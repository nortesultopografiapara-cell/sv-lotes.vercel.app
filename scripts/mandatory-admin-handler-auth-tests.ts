/**
 * Handlers administrativos com sessão simulada. Não abre banco e não usa
 * credencial real: as variáveis de Supabase ficam ausentes durante o teste.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { authorizePlatformAdminRequest, useAdminAuthDepsForTests } from '../lib/security/adminAuthorization';
import { GET as quotesGet, POST as quotesPost } from '../app/api/master/topography/quotes/route';
import { DELETE as deleteCharge } from '../app/api/saas/billing/charges/[id]/route';
import { GET as companyAdminsGet } from '../app/api/master/company-admins/route';
import { GET as receivablesGet } from '../app/api/master/corporate-finance/receivables/route';
import { GET as exportGet } from '../app/api/master/companies/[id]/exports/route';
import { POST as createUser } from '../app/api/users/create/route';
import { GET as ownerAccessGet } from '../app/api/users/[id]/owner-project-access/route';

const root = join(__dirname, '..');
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error('FAIL', message);
  }
}

const supabaseKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
const savedEnv = supabaseKeys.map((key) => [key, process.env[key]] as const);
for (const key of supabaseKeys) delete process.env[key];

type CallerResult =
  | { ok: true; caller: { role: string; status: string | null } }
  | { ok: false; reason: 'not_found' | 'lookup_failed' };

function session(userId: string | null, configError: string | null = null) {
  let loaded: string | null = null;
  useAdminAuthDepsForTests({
    getRequestAuthUser: async () => ({ user: userId ? { id: userId } : null, configError }),
    loadCaller: async (id) => {
      loaded = id;
      return load(id);
    },
  });
  return {
    loaded: () => loaded,
  };
}

let load: (id: string) => Promise<CallerResult> = async () => ({ ok: false, reason: 'not_found' });

function asRole(role: string): CallerResult {
  return { ok: true, caller: { role, status: 'ACTIVE' } };
}

async function main() {
  const anonymousQuotes = session(null);
  const anonResponse = await quotesGet(new Request('http://localhost/api/master/topography/quotes?userId=admin-a'));
  assert(anonResponse.status === 401, 'orçamento anônimo responde 401');
  assert(anonymousQuotes.loaded() === null, 'orçamento anônimo não consulta o papel');

  session(null, 'Sessão inválida: jwt');
  const invalid = await quotesGet(new Request('http://localhost/api/master/topography/quotes'));
  assert(invalid.status === 401, 'sessão inválida responde 401');

  const mismatch = session('user-a');
  load = async () => asRole('SUPER_ADMIN');
  const mismatchResponse = await quotesPost(new Request('http://localhost/api/master/topography/quotes', {
    method: 'POST',
    body: JSON.stringify({ userId: 'admin-b', title: 'teste' }),
  }));
  assert(mismatchResponse.status === 403, 'userId do navegador diferente da sessão responde 403');
  assert(mismatch.loaded() === null, 'divergência não chega à consulta de papel');

  for (const role of ['USER', 'BROKER', 'CORRETOR', 'OWNER', 'ADMIN']) {
    session('actor');
    load = async () => asRole(role);
    const response = await quotesGet(new Request('http://localhost/api/master/topography/quotes?userId=actor'));
    assert(response.status === 403, `${role} não abre orçamento da plataforma`);
  }

  session('admin-a');
  load = async () => asRole('ADMIN');
  const foreign = await receivablesGet(new Request('http://localhost/api/master/corporate-finance/receivables?userId=admin-a'));
  assert(foreign.status === 403, 'administrador de imobiliária não abre o financeiro da plataforma');

  session('admin-a');
  load = async () => asRole('ADMIN');
  const exportDenied = await exportGet(
    new Request('http://localhost/api/master/companies/empresa-b/exports?userId=admin-a'),
    { params: Promise.resolve({ id: 'empresa-b' }) },
  );
  assert(exportDenied.status === 403, 'administrador de imobiliária não exporta outra empresa pela plataforma');

  session('super-1');
  load = async (id) => {
    assert(id === 'super-1', 'o papel consultado é o da sessão');
    return asRole('SUPER_ADMIN');
  };
  const allowed = await quotesGet(new Request('http://localhost/api/master/topography/quotes?userId=outra-pessoa'));
  assert(allowed.status === 403, 'SUPER_ADMIN com userId divergente continua negado');

  session('super-1');
  load = async () => asRole('SUPER_ADMIN');
  const opened = await quotesGet(new Request('http://localhost/api/master/topography/quotes?userId=super-1'));
  assert(opened.status === 500, 'SUPER_ADMIN autenticado passa da autorização e para antes do banco');
  const openedBody = await opened.json();
  assert(!openedBody.quote && !openedBody.quotes, 'a passagem da autorização não devolve dados');

  session('super-1');
  load = async () => ({ ok: false, reason: 'lookup_failed' });
  const lookup = await deleteCharge(
    new Request('http://localhost/api/saas/billing/charges/charge-1?userId=super-1'),
    { params: Promise.resolve({ id: 'charge-1' }) },
  );
  assert(lookup.status === 503, 'falha ao consultar a autorização impede excluir cobrança');

  session('user-a');
  load = async () => asRole('USER');
  const admins = await companyAdminsGet(new Request('http://localhost/api/master/company-admins?userId=user-a&companyId=empresa-a'));
  assert(admins.status === 403, 'usuário comum não administra empresa pela rota master');

  const direct = await authorizePlatformAdminRequest(
    new Request('http://localhost/api'),
    'super-1',
    {
      getRequestAuthUser: async () => ({ user: { id: 'super-1' }, configError: null }),
      loadCaller: async () => asRole('SUPER_ADMIN'),
    },
  );
  assert(direct.ok && direct.userId === 'super-1', 'a identidade devolvida é a da sessão');

  const created = await createUser(new Request('http://localhost/api/users/create', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Corretor Teste',
      email: 'corretor@example.invalid',
      tenantId: 'empresa-a',
      role: 'BROKER',
      callerUserId: 'admin-a',
    }),
  }));
  assert(created.status === 401, 'cadastro de corretor sem sessão responde 401');

  const ownerAccess = await ownerAccessGet(
    new Request('http://localhost/api/users/alvo/owner-project-access?callerUserId=admin-a'),
    { params: Promise.resolve({ id: 'alvo' }) },
  );
  assert(ownerAccess.status === 401, 'acesso de proprietário sem sessão responde 401');

  const routes = walkRoutes(join(root, 'app/api'));
  let platform = 0;
  let corporate = 0;
  let exported = 0;
  let companyGate = 0;
  let browserAssert = 0;
  for (const file of routes) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('authorizePlatformAdminRequest')) platform += 1;
    if (text.includes('authorizeCorporateFinance')) corporate += 1;
    if (text.includes('authorizeCompanyExport')) exported += 1;
    if (text.includes('authorizeCompanyAdminRequest')) companyGate += 1;
    if (/assertSuperAdmin\(/.test(text)) browserAssert += 1;
    for (const part of text.split(/(?=export async function )/)) {
      if (!part.startsWith('export async function ')) continue;
      const authAt = part.search(/authorizePlatformAdminRequest\(request,|authorizeCorporateFinance\(request,|authorizeCompanyExport\(request,/);
      const clientAt = part.search(/createServiceSupabase\(\)|getCorporateFinanceServiceClient\(\)|getCompanyExportAdmin\(\)/);
      if (authAt >= 0 && clientAt >= 0) {
        assert(authAt < clientAt, `autorização antes da service role em ${relative(root, file)}`);
      }
    }
  }
  assert(browserAssert === 0, 'nenhuma rota chama assertSuperAdmin com identificador solto');
  assert(platform > 0 && corporate > 0 && exported > 0, 'os módulos platform, financeiro master e exportação foram migrados');
  console.log(JSON.stringify({ routes: routes.length, platform, corporate, exported, companyGate, browserAssert }));

  useAdminAuthDepsForTests(null);
  if (failed > 0) {
    console.error(`${failed} teste(s) falharam`);
    process.exit(1);
  }
  console.log('admin handler auth: ok');
}

function walkRoutes(dir: string, acc: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkRoutes(path, acc);
    else if (name === 'route.ts') acc.push(path);
  }
  return acc;
}

main().finally(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
