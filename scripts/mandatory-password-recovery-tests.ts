/**
 * Testes obrigatórios — recuperação oficial de senha (Supabase Auth).
 * npx tsx scripts/mandatory-password-recovery-tests.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOLDOWN_MS,
  PASSWORD_RECOVERY_DIFFERENT_PASSWORD_MESSAGE,
  PASSWORD_RECOVERY_INVALID_LINK_MESSAGE,
  PASSWORD_RECOVERY_LOGIN_PATH,
  PASSWORD_RECOVERY_MIN_LENGTH,
  PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
  PASSWORD_RECOVERY_RATE_LIMIT_MESSAGE,
  PASSWORD_RECOVERY_REQUEST_PATH,
  PASSWORD_RECOVERY_RESET_PATH,
  PASSWORD_RECOVERY_UPDATE_FAILED_MESSAGE,
  buildPasswordRecoveryUpdatePayload,
  canOpenPasswordRecoveryForm,
  isRecoveryLinkError,
  isValidRecoveryEmail,
  looksLikeRecoveryCallback,
  normalizeRecoveryEmail,
  readPasswordRecoveryLockFromCookieHeader,
  recoveryRequestUserMessage,
  remainingCooldownMs,
  resolvePasswordRecoveryRedirectTo,
  translatePasswordRecoveryError,
  validateNewRecoveryPassword,
  workspaceBlockedDuringRecovery,
} from '../lib/auth/passwordRecovery';
import {
  PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR,
  PASSWORD_RECOVERY_EMAIL_HTML,
  PASSWORD_RECOVERY_EMAIL_SUBJECT,
  PASSWORD_RECOVERY_EMAIL_TEXT,
  passwordRecoveryEmailUsesOfficialConfirmationUrl,
} from '../lib/auth/passwordRecoveryEmailTemplate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

const helper = read('lib/auth/passwordRecovery.ts');
const forgot = read('app/esqueci-senha/page.tsx');
const reset = read('app/redefinir-senha/page.tsx');
const login = read('app/login/page.tsx');
const useAuth = read('hooks/useAuth.ts');
const middleware = read('middleware.ts');
const layout = read('components/Layout.tsx');
const callback = read('app/auth/callback/page.tsx');
const onboarding = read('app/onboarding/page.tsx');
const companyAdmins = read('lib/companyAdminUsers.ts');
const clientFiles = [
  'lib/auth/passwordRecovery.ts',
  'lib/auth/passwordRecoveryEmailTemplate.ts',
  'lib/supabase-config.ts',
  'app/esqueci-senha/page.tsx',
  'app/redefinir-senha/page.tsx',
  'app/login/page.tsx',
  'hooks/useAuth.ts',
  'middleware.ts',
  'components/Layout.tsx',
];

let passed = 0;

function check(name: string, cond: boolean) {
  assert(cond, name);
  passed += 1;
  console.log(`ok  ${name}`);
}

check('minimo 6 caracteres (politica atual)', PASSWORD_RECOVERY_MIN_LENGTH === 6);
check(
  'onboarding permanece com minimo 6',
  onboarding.includes('password.length < 6') &&
    onboarding.includes('A senha deve ter no mínimo 6 caracteres.'),
);

check('email valido corporativo', isValidRecoveryEmail('Nome@Empresa.com.br'));
check('email invalido sem dominio', !isValidRecoveryEmail('usuario@'));
check('email invalido texto solto', !isValidRecoveryEmail('nao-e-email'));
check('normaliza email', normalizeRecoveryEmail('  ADM@SVLOTES.COM.BR ') === 'adm@svlotes.com.br');

check(
  'redirectTo resolve pelo origin do ambiente',
  resolvePasswordRecoveryRedirectTo('https://sv-lotes-preview.vercel.app/') ===
    'https://sv-lotes-preview.vercel.app/redefinir-senha',
);

check(
  'senha menor que 6',
  validateNewRecoveryPassword('12345', '12345') === 'A senha deve ter no mínimo 6 caracteres.',
);
check(
  'confirmacao divergente',
  validateNewRecoveryPassword('123456', '654321') === 'As senhas não coincidem.',
);
check('senha valida com confirmacao', validateNewRecoveryPassword('123456', '123456') === null);

const now = 1_000_000;
check('cooldown inicial zerado', remainingCooldownMs(0, now) === 0);
check(
  'cooldown contra clique repetido',
  remainingCooldownMs(now - 10_000, now) === PASSWORD_RECOVERY_COOLDOWN_MS - 10_000,
);
check('cooldown expirado libera envio', remainingCooldownMs(now - 61_000, now) === 0);

check(
  'resposta neutra para email existente',
  recoveryRequestUserMessage(null) === PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
);
check(
  'resposta indistinguivel para email inexistente',
  recoveryRequestUserMessage({ message: 'User not found' }) ===
    recoveryRequestUserMessage(null),
);
check(
  'resposta indistinguivel para erro interno',
  recoveryRequestUserMessage({ message: 'For security purposes, you can only request this after 60 seconds.' }) ===
    PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
);

check(
  'traduz same_password pelo codigo',
  translatePasswordRecoveryError({ code: 'same_password', message: 'New password should be different from the old password.' }, 'update') ===
    PASSWORD_RECOVERY_DIFFERENT_PASSWORD_MESSAGE,
);
check(
  'traduz senha igual pela mensagem inglesa',
  translatePasswordRecoveryError('New password should be different from the old password.', 'update') ===
    PASSWORD_RECOVERY_DIFFERENT_PASSWORD_MESSAGE,
);
check(
  'traduz rate limit pelo status 429',
  translatePasswordRecoveryError({ status: 429, message: 'Too Many Requests' }, 'update') ===
    PASSWORD_RECOVERY_RATE_LIMIT_MESSAGE,
);
check(
  'traduz rate limit pelo codigo GoTrue',
  translatePasswordRecoveryError({ code: 'over_request_rate_limit' }, 'update') ===
    PASSWORD_RECOVERY_RATE_LIMIT_MESSAGE,
);
check(
  'traduz link expirado pelo codigo',
  translatePasswordRecoveryError({ code: 'otp_expired', status: 403 }, 'update') ===
    PASSWORD_RECOVERY_INVALID_LINK_MESSAGE,
);
check(
  'contexto link sempre seguro',
  translatePasswordRecoveryError({ message: 'unexpected blob' }, 'link') ===
    PASSWORD_RECOVERY_INVALID_LINK_MESSAGE,
);
check(
  'falha inesperada nao vaza ingles',
  translatePasswordRecoveryError({ code: 'unexpected_failure', message: 'Database error saving new user' }, 'update') ===
    PASSWORD_RECOVERY_UPDATE_FAILED_MESSAGE,
);
check(
  'solicitacao nunca revela user_not_found',
  translatePasswordRecoveryError({ code: 'user_not_found', message: 'User not found' }, 'request') ===
    PASSWORD_RECOVERY_NEUTRAL_MESSAGE,
);
check(
  'UI de reset usa tradutor centralizado',
  reset.includes("translatePasswordRecoveryError(updateError, 'update')"),
);
check(
  'UI de reset nao imprime message bruta do GoTrue',
  !reset.includes('updateError.message ||'),
);

const validSearch = new URLSearchParams('code=pkce-recovery');
check(
  'link valido com code + sessao abre formulario',
  canOpenPasswordRecoveryForm({
    hasSession: true,
    recoveryLock: false,
    search: validSearch,
  }),
);
check(
  'link invalido sem sessao e sem token',
  !canOpenPasswordRecoveryForm({
    hasSession: false,
    recoveryLock: false,
    search: new URLSearchParams(),
  }),
);
check(
  'link expirado',
  isRecoveryLinkError(new URLSearchParams('error=access_denied&error_code=otp_expired')),
);
check(
  'link expirado nao abre formulario mesmo com sessao residual',
  !canOpenPasswordRecoveryForm({
    hasSession: true,
    recoveryLock: false,
    search: new URLSearchParams('error=access_denied&error_code=otp_expired'),
  }),
);
check(
  'reutilizacao: code sem sessao e sem lock',
  !canOpenPasswordRecoveryForm({
    hasSession: false,
    recoveryLock: false,
    search: new URLSearchParams('code=already-used'),
  }),
);
check(
  'refresh apos exchange usa lock + sessao',
  canOpenPasswordRecoveryForm({
    hasSession: true,
    recoveryLock: true,
    search: new URLSearchParams(),
  }),
);
check(
  'sessao de login normal sem recovery nao abre reset',
  !canOpenPasswordRecoveryForm({
    hasSession: true,
    recoveryLock: false,
    search: new URLSearchParams(),
  }),
);
check(
  'hash type=recovery e callback',
  looksLikeRecoveryCallback(new URLSearchParams(), '#type=recovery&access_token=abc'),
);

check(
  'workspace bloqueado durante recovery',
  workspaceBlockedDuringRecovery('/map', true) &&
    workspaceBlockedDuringRecovery('/dashboard', true) &&
    workspaceBlockedDuringRecovery('/', true),
);
check(
  'rotas publicas de recovery nao bloqueiam',
  !workspaceBlockedDuringRecovery(PASSWORD_RECOVERY_REQUEST_PATH, true) &&
    !workspaceBlockedDuringRecovery(PASSWORD_RECOVERY_RESET_PATH, true) &&
    !workspaceBlockedDuringRecovery(PASSWORD_RECOVERY_LOGIN_PATH, true),
);
check(
  'sem cookie de recovery o workspace segue normal',
  !workspaceBlockedDuringRecovery('/map', false),
);
check(
  'cookie lock lido do header',
  readPasswordRecoveryLockFromCookieHeader(`sid=abc; ${PASSWORD_RECOVERY_COOKIE}=1; other=1`),
);

const payload = buildPasswordRecoveryUpdatePayload('nova-senha-segura');
check('updateUser payload so tem password', Object.keys(payload).join(',') === 'password');
check('updateUser nao recebe user_id', !('user_id' in payload));
check('updateUser nao recebe tenant_id', !('tenant_id' in payload));
check('updateUser nao recebe adminId', !('adminId' in payload));
check('updateUser nao recebe email alvo', !('email' in payload));

check(
  'esqueci-senha usa resetPasswordForEmail',
  forgot.includes('resetPasswordForEmail(cleanEmail, { redirectTo })'),
);
check(
  'esqueci-senha resolve redirectTo pelo origin',
  forgot.includes('resolvePasswordRecoveryRedirectTo(window.location.origin)'),
);
check('esqueci-senha tem campo de e-mail', forgot.includes('type="email"'));
check('esqueci-senha tem botao de envio', forgot.includes('Enviar link de recuperação'));
check('esqueci-senha copy recuperar acesso', forgot.includes('Recuperar acesso'));
check(
  'esqueci-senha copy instrucao',
  forgot.includes('Informe o e-mail corporativo cadastrado no SV Lotes'),
);
check('esqueci-senha copy verifique e-mail', forgot.includes('Verifique seu e-mail'));
check(
  'esqueci-senha resposta sempre neutra',
  forgot.includes('recoveryRequestUserMessage(null)'),
);
check('esqueci-senha tem loading', forgot.includes('disabled={loading || cooldownLeft > 0}'));
check('esqueci-senha tem cooldown', forgot.includes('Aguarde ${cooldownSeconds}s'));
check('esqueci-senha nao usa service role', !forgot.includes('SERVICE_ROLE'));
check('esqueci-senha nao escolhe user_id', !forgot.includes('user_id'));
check('esqueci-senha nao escolhe adminId', !forgot.includes('adminId'));
check('esqueci-senha nao reutiliza reset administrativo', !forgot.includes('resetCompanyAdminPassword'));

check('redefinir-senha valida recovery', reset.includes('canOpenPasswordRecoveryForm'));
check('redefinir-senha troca code PKCE', reset.includes('exchangeCodeForSession'));
check('redefinir-senha ouve PASSWORD_RECOVERY', reset.includes("event === 'PASSWORD_RECOVERY'"));
check('redefinir-senha copy criar nova senha', reset.includes('Criar nova senha'));
check(
  'redefinir-senha copy confirmacao',
  reset.includes('Digite e confirme sua nova senha para recuperar o acesso ao SV Lotes.'),
);
check('redefinir-senha campo nova senha', reset.includes('Nova senha'));
check('redefinir-senha campo confirmar', reset.includes('Confirmar nova senha'));
check(
  'redefinir-senha updateUser so do recovery user',
  /updateUser\(\s*buildPasswordRecoveryUpdatePayload\(password\),?\s*\)/.test(reset),
);
check('redefinir-senha signOut apos sucesso', reset.includes('supabase.auth.signOut()'));
check('redefinir-senha mensagem de sucesso', reset.includes('Senha alterada com sucesso'));
check('redefinir-senha vai para login', reset.includes('PASSWORD_RECOVERY_LOGIN_PATH'));
check('redefinir-senha link invalido seguro', reset.includes('PASSWORD_RECOVERY_INVALID_LINK_MESSAGE'));
check('redefinir-senha solicitar novo link', reset.includes('Solicitar novo link'));
check('redefinir-senha nao recebe user_id alvo', !reset.includes('searchParams.get(\'user_id\')'));
check('redefinir-senha nao recebe tenant_id alvo', !reset.includes('searchParams.get(\'tenant_id\')'));
check('redefinir-senha nao recebe adminId alvo', !reset.includes('adminId'));
check('redefinir-senha nao usa service role', !reset.includes('SERVICE_ROLE'));
check('redefinir-senha nao gera senha provisoria', !reset.includes('temporaryPassword'));
check('redefinir-senha nao reutiliza admin reset', !reset.includes('resetCompanyAdminPassword'));

check('login corrige link morto', login.includes('PASSWORD_RECOVERY_REQUEST_PATH'));
check('login nao usa href="#"', !login.includes('href="#"'));
check(
  'login nao trata recovery como workspace',
  login.includes('hasPasswordRecoveryLock()') &&
    login.includes('looksLikeRecoveryCallback') &&
    login.includes('PASSWORD_RECOVERY_RESET_PATH'),
);

check('useAuth trata PASSWORD_RECOVERY', useAuth.includes("event === 'PASSWORD_RECOVERY'"));
check(
  'useAuth nao deixa recovery entrar no workspace',
  useAuth.includes('hasPasswordRecoveryLock()') &&
    useAuth.includes('PASSWORD_RECOVERY_RESET_PATH'),
);
check(
  'useAuth SIGNED_OUT nao foge da tela de reset',
  useAuth.includes('isPasswordRecoveryPublicPath(window.location.pathname)'),
);
check('useAuth limpa lock no signOut', useAuth.includes('clearPasswordRecoveryLock()'));

check(
  'middleware rotas publicas de recovery',
  middleware.includes("'/esqueci-senha'") && middleware.includes("'/redefinir-senha'"),
);
check(
  'middleware bloqueia workspace com cookie de recovery',
  middleware.includes('workspaceBlockedDuringRecovery') &&
    middleware.includes('PASSWORD_RECOVERY_COOKIE'),
);
check(
  'middleware nao manda recovery do login para o dashboard',
  middleware.includes('if (isRecoveryLock)') && middleware.includes('return response'),
);

check(
  'layout trata recovery como pagina standalone',
  layout.includes("'/esqueci-senha'") && layout.includes("'/redefinir-senha'"),
);

check(
  'auth/callback nao foi alterado para recovery',
  !callback.includes('passwordRecovery') && !callback.includes('PASSWORD_RECOVERY'),
);
check(
  'auth/callback segue mandando sessao normal ao workspace/onboarding',
  callback.includes("router.push('/onboarding')") && callback.includes("router.push('/')"),
);

check(
  'reset administrativo de companyAdminUsers permanece intacto',
  companyAdmins.includes('export async function resetCompanyAdminPassword') &&
    companyAdmins.includes('admin.auth.admin.updateUserById'),
);
check(
  'recovery nao importa companyAdminUsers',
  !helper.includes('companyAdminUsers') &&
    !forgot.includes('companyAdminUsers') &&
    !reset.includes('companyAdminUsers'),
);

const portal = read('app/portal-cliente/page.tsx');
const portalOtp = read('lib/portal-cliente/otp.ts');
const portalConfirm = read('app/portal-cliente/confirmar/page.tsx');
const createCompany = read('app/api/companies/create/route.ts');
check(
  'portal do cliente nao foi alterado nesta feature',
  !portal.includes('passwordRecovery') && !portal.includes('resetPasswordForEmail'),
);
check(
  'OTP do portal do cliente permanece independente do Auth recovery',
  portalOtp.includes('verifyClientPortalOtpCode') &&
    !portalOtp.includes('resetPasswordForEmail') &&
    !portalConfirm.includes('passwordRecovery'),
);
check('login normal continua com signInWithPassword', login.includes('signInWithPassword'));
check(
  'criacao de administrador permanece no fluxo de empresas',
  createCompany.includes('force_password_change: true') &&
    !createCompany.includes('passwordRecovery'),
);
check(
  'assunto do e-mail de recovery',
  PASSWORD_RECOVERY_EMAIL_SUBJECT === 'Recuperação de senha — SV Lotes',
);
check(
  'template HTML usa ConfirmationURL oficial',
  passwordRecoveryEmailUsesOfficialConfirmationUrl(PASSWORD_RECOVERY_EMAIL_HTML),
);
check(
  'template texto usa ConfirmationURL oficial',
  passwordRecoveryEmailUsesOfficialConfirmationUrl(PASSWORD_RECOVERY_EMAIL_TEXT),
);
check(
  'template nao monta token manualmente',
  !PASSWORD_RECOVERY_EMAIL_HTML.includes('{{ .Token }}') &&
    !PASSWORD_RECOVERY_EMAIL_HTML.includes('generateLink') &&
    PASSWORD_RECOVERY_EMAIL_HTML.includes('Redefinir minha senha'),
);
check(
  'template nao depende de imagem externa',
  !/<img\s/i.test(PASSWORD_RECOVERY_EMAIL_HTML) &&
    !PASSWORD_RECOVERY_EMAIL_HTML.includes('http://') &&
    PASSWORD_RECOVERY_EMAIL_HTML.includes('href="' + PASSWORD_RECOVERY_EMAIL_CONFIRMATION_VAR + '"'),
);

for (const rel of clientFiles) {
  const src = read(rel);
  check(
    `${rel} sem SUPABASE_SERVICE_ROLE_KEY`,
    !src.includes('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

const staticDir = join(process.cwd(), '.next', 'static');
if (existsSync(staticDir)) {
  const clientAssets = walkFiles(staticDir).filter((f) => /\.(js|json)$/.test(f));
  const recoveryAssets = clientAssets.filter((f) => {
    const text = readFileSync(f, 'utf8');
    return (
      text.includes('sv_lotes_pw_recovery') ||
      text.includes('/esqueci-senha') ||
      text.includes('/redefinir-senha')
    );
  });
  const hits = recoveryAssets.filter((f) =>
    readFileSync(f, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY'),
  );
  check(
    'chunks de recovery sem SUPABASE_SERVICE_ROLE_KEY',
    hits.length === 0,
  );
} else {
  console.log('skip bundle cliente (sem .next/static ainda)');
}

console.log(`\n${passed} checks passed`);
