/**
 * Autenticação de rotas cron (Vercel Cron / agendador externo).
 */

export function resolveCronSecrets(): string[] {
  const values = [
    String(process.env.CRON_SECRET || '').trim(),
    String(process.env.SAAS_CRON_SECRET || '').trim(),
  ].filter(Boolean);
  return [...new Set(values)];
}

/** @deprecated Prefer resolveCronSecrets — mantido para compatibilidade. */
export function resolveCronSecret(): string {
  return resolveCronSecrets()[0] || '';
}

function extractBearerToken(request: Request): string {
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (!authorization.toLowerCase().startsWith('bearer ')) return '';
  return authorization.slice(7).trim();
}

export function isCronSecretValid(request: Request): boolean {
  const secrets = resolveCronSecrets();
  if (!secrets.length) return false;

  const bearer = extractBearerToken(request);
  if (bearer && secrets.includes(bearer)) return true;

  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  if (headerSecret && secrets.includes(headerSecret)) return true;

  const url = new URL(request.url);
  const querySecret =
    String(url.searchParams.get('secret') || url.searchParams.get('cron_secret') || '').trim();
  if (querySecret && secrets.includes(querySecret)) return true;

  return false;
}

export function describeCronAuthFailure(): string {
  const secrets = resolveCronSecrets();
  if (!secrets.length) {
    return 'CRON_SECRET não configurado na Vercel — o cron não pode autenticar.';
  }
  return 'Segredo cron inválido ou ausente (Authorization Bearer, x-cron-secret ou ?secret=).';
}
