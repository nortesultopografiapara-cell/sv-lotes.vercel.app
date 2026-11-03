/**
 * Testes obrigatórios — Fase 1 reautenticação do Administrador Principal.
 * npx tsx scripts/mandatory-primary-admin-reauth-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRIMARY_ADMIN_VERIFY_FAILURE_ACTION,
  PRIMARY_ADMIN_VERIFY_MAX_PER_USER,
  PRIMARY_ADMIN_VERIFY_SUCCESS_ACTION,
  buildPrimaryAdminVerifyAuditEvent,
  maskPrimaryAdminEmail,
  previewPrimaryAdminIdentity,
  readPrimaryAdminVerifyRequest,
  sanitizeEphemeralPasswordVerifyOutput,
  toPublicPrimaryAdminVerifyResult,
  verifyPrimaryAdminPassword,
  type PrimaryAdminPasswordVerifyInput,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminUserRow,
} from '../lib/primaryAdminReauth';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const SV = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const OTHER = 'aaaaaaaa-bbbb-4000-8000-ffffffffffff';
const PRINCIPAL = '8ffc7eec-2df7-4f91-b536-ddf3fc393a14';
const MARCOS = 'da9ab925-b398-4dc2-9020-92832ca4e9f8';
const OTHER_ADMIN = 'bbbbbbbb-cccc-4000-8000-111111111111';
const PRINCIPAL_EMAIL = 'demostrar@svlotes.com.br';
const MARCOS_EMAIL = 'marcos@svlotes.com.br';
const OTHER_EMAIL = 'demo@svlotes.com.br';
const PRINCIPAL_PASSWORD = 'principal-secret';
const MARCOS_PASSWORD = 'marcos-secret';
const OTHER_PASSWORD = 'other-company-secret';

function users(): Record<string, PrimaryAdminUserRow> {
  return {
    [PRINCIPAL]: {
      id: PRINCIPAL,
      tenant_id: SV,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: PRINCIPAL_EMAIL,
      full_name: 'Admin - S.V TOPOGRAFIA E PROJETO LTDA',
    },
    [MARCOS]: {
      id: MARCOS,
      tenant_id: SV,
      role: 'ADMIN_EMPRESA',
      status: 'ACTIVE',
      email: MARCOS_EMAIL,
      full_name: 'Marco francisco oliveira',
    },
    [OTHER_ADMIN]: {
      id: OTHER_ADMIN,
      tenant_id: OTHER,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: OTHER_EMAIL,
      full_name: 'Usuário Demonstração',
    },
  };
}

function makeDeps(over: {
  primaryId?: string | null;
  userOver?: Record<string, Partial<PrimaryAdminUserRow>>;
  verify?: PrimaryAdminReauthDeps['verifyPassword'];
  passwordCalls?: PrimaryAdminPasswordVerifyInput[];
} = {}) {
  const table = users();
  for (const [id, patch] of Object.entries(over.userOver || {})) {
    table[id] = { ...table[id], ...patch };
  }
  const passwordCalls: PrimaryAdminPasswordVerifyInput[] = over.passwordCalls || [];
  const rateLimitStore = new Map<string, number[]>();
  const primaryId = over.primaryId === undefined ? PRINCIPAL : over.primaryId;
  const deps: PrimaryAdminReauthDeps = {
    rateLimitStore,
    loadOperator: async (id) => table[id] || null,
    loadCompanyPrimaryAdminUserId: async (companyId) => {
      if (companyId !== SV) return null;
      return primaryId;
    },
    loadUser: async (id) => table[id] || null,
    verifyPassword: over.verify
      || (async (input) => {
        passwordCalls.push(input);
        if (input.email === PRINCIPAL_EMAIL && input.password === PRINCIPAL_PASSWORD) {
          return {
            userId: PRINCIPAL,
            accessToken: 'ephemeral-access',
            refreshToken: 'ephemeral-refresh',
            session: { access_token: 'ephemeral-access', refresh_token: 'ephemeral-refresh' },
          };
        }
        if (input.email === MARCOS_EMAIL && input.password === MARCOS_PASSWORD) {
          return { userId: MARCOS, accessToken: 'marcos-token', refreshToken: 'marcos-refresh' };
        }
        if (input.email === OTHER_EMAIL && input.password === OTHER_PASSWORD) {
          return { userId: OTHER_ADMIN, accessToken: 'other-token', refreshToken: 'other-refresh' };
        }
        return { userId: null, accessToken: null, refreshToken: null };
      }),
  };
  return { deps, passwordCalls, rateLimitStore };
}

async function testACorrectPrincipalPassword() {
  const { deps, passwordCalls } = makeDeps();
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: PRINCIPAL_PASSWORD,
  });
  if (!result.ok) throw new Error('A senha correta do Principal autoriza');
  assert(result.authorizedBy.userId === PRINCIPAL, 'A authorizedBy é o Principal');
  assert(result.authorizedBy.displayName.includes('S.V TOPOGRAFIA'), 'nome do Principal');
  assert(result.authorizedBy.maskedEmail === 'dem*****@svlotes.com.br', 'e-mail mascarado');
  assert(passwordCalls.length === 1, 'uma verificação');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'autentica o e-mail do primary_admin_user_id');
  const pub = toPublicPrimaryAdminVerifyResult(result);
  assert(pub.ok === true && 'authorizedBy' in pub, 'resposta pública de sucesso');
  console.log('OK A senha correta do Principal');
}

async function testBWrongPrincipalPassword() {
  const { deps } = makeDeps();
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: 'senha-errada',
  });
  assert(result.ok === false, 'B senha errada nega');
  assert(result.reason === 'password_rejected', 'motivo interno senha');
  const pub = toPublicPrimaryAdminVerifyResult(result);
  assert(JSON.stringify(pub) === '{"ok":false}', 'resposta pública genérica');
  console.log('OK B senha errada do Principal');
}

async function testCMarcosOwnPasswordDenied() {
  const { deps, passwordCalls } = makeDeps();
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: MARCOS_PASSWORD,
  });
  assert(result.ok === false, 'C senha do Marcos não autoriza');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'nunca autentica o e-mail do operador');
  assert(passwordCalls[0].email !== MARCOS_EMAIL, 'e-mail do Marcos não é usado');
  console.log('OK C senha correta do próprio Marcos');
}

async function testDOtherCompanyAdminPasswordDenied() {
  const { deps, passwordCalls } = makeDeps();
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: OTHER_PASSWORD,
  });
  assert(result.ok === false, 'D senha de outro tenant não autoriza');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'continua no e-mail do Principal do tenant');
  console.log('OK D senha de ADMIN de outra empresa');
}

async function testEMissingPrimaryDenied() {
  const { deps, passwordCalls } = makeDeps({ primaryId: null });
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: PRINCIPAL_PASSWORD,
  });
  assert(result.ok === false, 'E sem primary_admin_user_id nega');
  assert(result.reason === 'missing_primary', 'motivo missing_primary');
  assert(passwordCalls.length === 0, 'não tenta senha sem Principal');
  console.log('OK E empresa sem primary_admin_user_id');
}

async function testFInactivePrimaryDenied() {
  const { deps, passwordCalls } = makeDeps({
    userOver: { [PRINCIPAL]: { status: 'INACTIVE' } },
  });
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: PRINCIPAL_PASSWORD,
  });
  assert(result.ok === false, 'F Principal INACTIVE nega');
  assert(result.reason === 'primary_invalid', 'motivo primary_invalid');
  assert(passwordCalls.length === 0, 'não tenta senha de Principal inativo');
  console.log('OK F Primary Admin INACTIVE');
}

async function testGIgnoreInjectedPrimaryAdminUserId() {
  const { deps, passwordCalls } = makeDeps();
  const body = readPrimaryAdminVerifyRequest({
    password: PRINCIPAL_PASSWORD,
    primary_admin_user_id: OTHER_ADMIN,
    primary_admin_email: OTHER_EMAIL,
  });
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: body.password,
  });
  if (!result.ok) throw new Error('G ignora primary_admin_user_id do client');
  assert(result.authorizedBy.userId === PRINCIPAL, 'continua o id do banco');
  assert(passwordCalls[0].email !== OTHER_EMAIL, 'não usa e-mail injetado');
  console.log('OK G primary_admin_user_id no request é ignorado');
}

async function testHIgnoreInjectedCompanyId() {
  const { deps } = makeDeps();
  const body = readPrimaryAdminVerifyRequest({
    password: PRINCIPAL_PASSWORD,
    company_id: OTHER,
    tenantId: OTHER,
  });
  const result = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: MARCOS,
    password: body.password,
  });
  assert(result.ok === true, 'H ignora company_id do client');
  assert(result.tenantId === SV, 'tenant vem do operador autenticado');
  console.log('OK H company_id no request é ignorado');
}

function testIEphemeralTokensNeverLeaveServer() {
  const leaked = sanitizeEphemeralPasswordVerifyOutput({
    userId: PRINCIPAL,
    accessToken: 'secret-access',
    refreshToken: 'secret-refresh',
    session: { access_token: 'secret-access', refresh_token: 'secret-refresh' },
  });
  assert(leaked.userId === PRINCIPAL, 'preserva só o userId');
  assert(!('accessToken' in leaked), 'sem accessToken');
  assert(!('refreshToken' in leaked), 'sem refreshToken');
  assert(!('session' in leaked), 'sem session');

  const route = read('app/api/security/primary-admin/verify/route.ts');
  assert(route.includes('toPublicPrimaryAdminVerifyResult'), 'rota devolve só o resultado público');
  assert(route.includes('readPrimaryAdminVerifyRequest'), 'rota lê só a senha');
  assert(!route.includes('access_token'), 'rota não devolve access_token');
  assert(!route.includes('refresh_token'), 'rota não devolve refresh_token');

  const server = read('lib/primaryAdminReauthServer.ts');
  assert(server.includes('persistSession: false'), 'client efêmero sem persistSession');
  assert(server.includes('autoRefreshToken: false'), 'sem autoRefresh');
  assert(server.includes("signOut(accessToken, 'local')"), 'revoga sessão efêmera local');
  assert(!server.includes('cookies()'), 'não usa cookies da sessão do operador');
  assert(server.includes('accessToken: null'), 'não propaga token efêmero');
  console.log('OK I tokens efêmeros nunca chegam ao browser');
}

function testJOperatorSessionUntouched() {
  const route = read('app/api/security/primary-admin/verify/route.ts');
  assert(route.includes('getRequestAuthUser'), 'operador vem da sessão existente');
  assert(!route.includes('createRouteHandlerSupabase'), 'não autentica o Principal no client de cookies');

  const ui = read('components/settings/PrimaryAdminVerifyPanel.tsx');
  assert(!ui.includes('signInWithPassword'), 'UI não faz signIn no browser');
  assert(ui.includes("JSON.stringify({ password: presented })"), 'POST envia só a senha');
  assert(!ui.includes('company_id'), 'UI não envia company_id');
  assert(!ui.includes('primary_admin_user_id'), 'UI não envia primary_admin_user_id');
  assert(!ui.includes('localStorage'), 'senha não vai para localStorage');
  assert(!ui.includes('sessionStorage'), 'senha não vai para sessionStorage');
  assert(ui.includes('setPassword(\'\')'), 'limpa o campo após tentativa');
  assert(ui.includes('supabase.auth.getUser()'), 'confirma sessão atual após o teste');
  assert(ui.includes('Sessão atual permanece'), 'homologação exibe a sessão do operador');
  console.log('OK J sessão do operador permanece intacta');
}

async function testIdentityAndRateLimitAndAudit() {
  assert(maskPrimaryAdminEmail(PRINCIPAL_EMAIL) === 'dem*****@svlotes.com.br', 'máscara canônica');
  const { deps } = makeDeps();
  const preview = await previewPrimaryAdminIdentity(deps, MARCOS);
  assert(preview.ok === true, 'preview carrega o Principal');
  if (preview.ok) {
    assert(preview.principal.maskedEmail === 'dem*****@svlotes.com.br', 'preview mascarado');
    assert(!JSON.stringify(preview).includes(PRINCIPAL_EMAIL), 'preview sem e-mail completo');
  }

  const { deps: limitDeps, rateLimitStore } = makeDeps();
  for (let i = 0; i < PRIMARY_ADMIN_VERIFY_MAX_PER_USER; i += 1) {
    const denied = await verifyPrimaryAdminPassword(limitDeps, {
      operatorUserId: MARCOS,
      password: 'errada',
    });
    assert(denied.ok === false, `falha ${i + 1}`);
  }
  const blocked = await verifyPrimaryAdminPassword(limitDeps, {
    operatorUserId: MARCOS,
    password: PRINCIPAL_PASSWORD,
  });
  assert(blocked.ok === false, 'rate limit bloqueia mesmo com senha correta');
  assert(blocked.reason === 'rate_limited', 'motivo rate_limited');
  assert(rateLimitStore.size > 0, 'hits registrados por usuário e tenant');

  const ok = await verifyPrimaryAdminPassword(makeDeps().deps, {
    operatorUserId: MARCOS,
    password: PRINCIPAL_PASSWORD,
  });
  const successAudit = buildPrimaryAdminVerifyAuditEvent(ok);
  assert(successAudit?.action === PRIMARY_ADMIN_VERIFY_SUCCESS_ACTION, 'audit sucesso');
  assert(successAudit?.requestedBy === MARCOS, 'requested_by operador');
  assert(successAudit?.authorizedBy === PRINCIPAL, 'authorized_by só no sucesso');
  const failAudit = buildPrimaryAdminVerifyAuditEvent(
    await verifyPrimaryAdminPassword(makeDeps().deps, {
      operatorUserId: MARCOS,
      password: 'x',
    }),
  );
  assert(failAudit?.action === PRIMARY_ADMIN_VERIFY_FAILURE_ACTION, 'audit falha');
  assert(!failAudit?.authorizedBy, 'falha sem authorized_by');
  console.log('OK identidade, rate limit e audit');
}

function testSourceContracts() {
  const route = read('app/api/security/primary-admin/verify/route.ts');
  assert(route.includes("export async function POST"), 'POST /api/security/primary-admin/verify');
  assert(route.includes("export async function GET"), 'GET preview da identidade');
  assert(!route.includes('finance_receipts'), 'não toca financeiro');
  assert(!route.includes('cash_movements'), 'não toca caixa');

  const ui = read('components/settings/PrimaryAdminVerifyPanel.tsx');
  assert(ui.includes('Testar autorização do Administrador Principal'), 'título de homologação');
  assert(ui.includes('Senha do Administrador Principal'), 'pede só a senha');
  assert(ui.includes('PRIMARY_ADMIN_VERIFY_SUCCESS_MESSAGE'), 'mensagem de sucesso');
  assert(ui.includes('PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE'), 'mensagem genérica de falha');
  assert(ui.includes('isDevelopHomologRuntime'), 'UI só no Develop');

  const shell = read('components/settings/CompanySettingsV2Shell.tsx');
  assert(shell.includes('PrimaryAdminVerifyPanel'), 'painel em Configurações');
  assert(shell.includes('isDevelopHomologRuntime()'), 'shell oculta fora do Develop');

  const server = read('lib/primaryAdminReauthServer.ts');
  assert(server.includes('createEphemeralAuthClient'), 'client Auth isolado');
  assert(server.includes('signInWithPassword'), 'validação server-side');
  console.log('OK contratos de fonte');
}

async function main() {
  await testACorrectPrincipalPassword();
  await testBWrongPrincipalPassword();
  await testCMarcosOwnPasswordDenied();
  await testDOtherCompanyAdminPasswordDenied();
  await testEMissingPrimaryDenied();
  await testFInactivePrimaryDenied();
  await testGIgnoreInjectedPrimaryAdminUserId();
  await testHIgnoreInjectedCompanyId();
  testIEphemeralTokensNeverLeaveServer();
  testJOperatorSessionUntouched();
  await testIdentityAndRateLimitAndAudit();
  testSourceContracts();
  console.log('\nOK — mandatory-primary-admin-reauth-tests passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
