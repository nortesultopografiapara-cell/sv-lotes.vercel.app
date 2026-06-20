/**
 * Autenticação de rotas cron (Vercel Cron / agendador externo).
 */

export function resolveCronSecret(): string {
  return String(process.env.CRON_SECRET || process.env.SAAS_CRON_SECRET || '').trim();
}

export function isCronSecretValid(request: Request): boolean {
  const expected = resolveCronSecret();
  if (!expected) return false;

  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  if (headerSecret && headerSecret === expected) return true;

  const authorization = String(request.headers.get('authorization') || '').trim();
  if (authorization === `Bearer ${expected}`) return true;

  const url = new URL(request.url);
  const querySecret =
    String(url.searchParams.get('secret') || url.searchParams.get('cron_secret') || '').trim();
  if (querySecret && querySecret === expected) return true;

  return false;
}
