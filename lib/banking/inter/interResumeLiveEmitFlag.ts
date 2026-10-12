/**
 * Flag administrativa de emissão live Inter (retomada).
 * Off por padrão. Só Vercel env INTER_RESUME_LIVE_EMIT_ENABLED=true libera POST real.
 * Não há toggle na UI da empresa — ativação é operação de plataforma.
 */

export const INTER_RESUME_LIVE_EMIT_FLAG_ENV = 'INTER_RESUME_LIVE_EMIT_ENABLED';

export const INTER_RESUME_LIVE_EMIT_DISABLED_MESSAGE =
  'Emissão live Banco Inter desabilitada. A retomada pode persistir e o cron pode avançar, mas nenhum POST /cobrancas é enviado até autorização da flag INTER_RESUME_LIVE_EMIT_ENABLED.';

export function isInterResumeLiveEmitFlagEnabled(
  raw: string | null | undefined = process.env.INTER_RESUME_LIVE_EMIT_ENABLED,
): boolean {
  return String(raw || '').trim().toLowerCase() === 'true';
}
