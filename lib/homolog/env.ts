/**
 * Identidade de ambiente SV LOTES.
 * Helpers de project ref — não autorizam escrita e não copiam dados entre bancos.
 */

export const DEVELOP_PROJECT_REF = 'hoynysmynxncdlptuzub';
export const PRODUCTION_PROJECT_REF = 'aezktedncttwpqeunjej';
/** Clone DEVELOP anterior — não autoriza escrita de homologação. */
export const RETIRED_DEVELOP_PROJECT_REF = 'zumwvcxgrpxggyxomzic';

export const HOMOLOG_OUTBOUND_BLOCKED_MESSAGE =
  'Ambiente de homologação: operação externa bloqueada (sem e-mail, WhatsApp, PIX ou cobrança real).';

export function resolveSupabaseProjectRef(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
): string | null {
  const raw = String(url || '').trim();
  if (!raw || /SENSITIVE|REDACTED/i.test(raw)) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function isDevelopHomologRuntime(url?: string): boolean {
  return resolveSupabaseProjectRef(url) === DEVELOP_PROJECT_REF;
}

export function isProductionSupabaseRuntime(url?: string): boolean {
  return resolveSupabaseProjectRef(url) === PRODUCTION_PROJECT_REF;
}

export function homologOutboundBlockedMessage(): string {
  return HOMOLOG_OUTBOUND_BLOCKED_MESSAGE;
}

export function assertHomologOutboundAllowed(): void {
  if (isDevelopHomologRuntime()) {
    throw new Error(HOMOLOG_OUTBOUND_BLOCKED_MESSAGE);
  }
}
