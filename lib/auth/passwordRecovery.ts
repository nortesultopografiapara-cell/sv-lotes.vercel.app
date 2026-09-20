/**
 * Recuperação oficial de senha via Supabase Auth.
 * Sem service_role, sem senha provisória, sem enumeração de e-mail.
 */

export const PASSWORD_RECOVERY_MIN_LENGTH = 6;
export const PASSWORD_RECOVERY_COOLDOWN_MS = 60_000;
export const PASSWORD_RECOVERY_COOKIE = 'sv_lotes_pw_recovery';
export const PASSWORD_RECOVERY_REQUEST_PATH = '/esqueci-senha';
export const PASSWORD_RECOVERY_RESET_PATH = '/redefinir-senha';
export const PASSWORD_RECOVERY_LOGIN_PATH = '/login';

export const PASSWORD_RECOVERY_NEUTRAL_MESSAGE =
  'Se o endereço informado estiver cadastrado, você receberá as instruções para redefinir sua senha.';

export const PASSWORD_RECOVERY_INVALID_LINK_MESSAGE =
  'Este link de recuperação é inválido ou já expirou. Solicite um novo link para continuar.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecoveryEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidRecoveryEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeRecoveryEmail(value));
}

export function resolvePasswordRecoveryRedirectTo(origin: string): string {
  const base = String(origin || '').trim().replace(/\/+$/, '');
  return `${base}${PASSWORD_RECOVERY_RESET_PATH}`;
}

export function validateNewRecoveryPassword(
  password: string,
  confirm: string,
): string | null {
  if (String(password || '').length < PASSWORD_RECOVERY_MIN_LENGTH) {
    return 'A senha deve ter no mínimo 6 caracteres.';
  }
  if (password !== confirm) {
    return 'As senhas não coincidem.';
  }
  return null;
}

export function isPasswordRecoveryPublicPath(pathname: string): boolean {
  const path = String(pathname || '');
  return (
    path === PASSWORD_RECOVERY_REQUEST_PATH ||
    path === PASSWORD_RECOVERY_RESET_PATH ||
    path.startsWith(`${PASSWORD_RECOVERY_REQUEST_PATH}/`) ||
    path.startsWith(`${PASSWORD_RECOVERY_RESET_PATH}/`)
  );
}

export function workspaceBlockedDuringRecovery(
  pathname: string,
  recoveryLock: boolean,
): boolean {
  if (!recoveryLock) return false;
  if (isPasswordRecoveryPublicPath(pathname)) return false;
  if (pathname === PASSWORD_RECOVERY_LOGIN_PATH) return false;
  return true;
}

export function remainingCooldownMs(lastSentAt: number, now = Date.now()): number {
  if (!lastSentAt) return 0;
  return Math.max(0, lastSentAt + PASSWORD_RECOVERY_COOLDOWN_MS - now);
}

export function parseHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(String(hash || '').replace(/^#/, ''));
}

export function isRecoveryLinkError(search: URLSearchParams, hash = ''): boolean {
  const hashParams = parseHashParams(hash);
  const combined = [
    search.get('error'),
    search.get('error_code'),
    search.get('error_description'),
    hashParams.get('error'),
    hashParams.get('error_code'),
    hashParams.get('error_description'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /expired|otp_expired|access_denied|invalid|flow_state/.test(combined);
}

export function looksLikeRecoveryCallback(search: URLSearchParams, hash = ''): boolean {
  if (search.get('code')) return true;
  const hashParams = parseHashParams(hash);
  return hashParams.get('type') === 'recovery' || Boolean(hashParams.get('access_token'));
}

export function canOpenPasswordRecoveryForm(input: {
  hasSession: boolean;
  recoveryLock: boolean;
  search: URLSearchParams;
  hash?: string;
}): boolean {
  if (isRecoveryLinkError(input.search, input.hash || '')) return false;
  if (!input.hasSession) return false;
  return (
    input.recoveryLock || looksLikeRecoveryCallback(input.search, input.hash || '')
  );
}

export function recoveryRequestUserMessage(
  _authError?: { message?: string } | null,
): string {
  return PASSWORD_RECOVERY_NEUTRAL_MESSAGE;
}

export function buildPasswordRecoveryUpdatePayload(password: string): { password: string } {
  return { password: String(password) };
}

export function markPasswordRecoveryLock(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${PASSWORD_RECOVERY_COOKIE}=1; Path=/; Max-Age=3600; SameSite=Lax`;
}

export function clearPasswordRecoveryLock(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${PASSWORD_RECOVERY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function hasPasswordRecoveryLock(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => part.trim() === `${PASSWORD_RECOVERY_COOKIE}=1`);
}

export function readPasswordRecoveryLockFromCookieHeader(cookieHeader: string): boolean {
  return String(cookieHeader || '')
    .split(';')
    .some((part) => part.trim() === `${PASSWORD_RECOVERY_COOKIE}=1`);
}
