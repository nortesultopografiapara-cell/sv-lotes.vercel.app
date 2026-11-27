/**
 * OpenAI Ads — Fase 1.
 * O Pixel só pode ligar fora de Production e com o ID público autorizado.
 * A chave da API de Conversões não entra neste módulo.
 */

export const AUTHORIZED_OPENAI_ADS_PIXEL_ID = '4AveCifSW2pqanzxikfzLy' as const;

export const OPENAI_ADS_SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js' as const;

/** Única rota pública comercial autorizada a carregar o SDK. */
export const PUBLIC_COMMERCIAL_PATH = '/' as const;

const PRODUCTION_HOSTS = new Set(['svlotes.com.br', 'www.svlotes.com.br']);

export type OpenAiAdsEnv = {
  enabledFlag?: string | null;
  pixelId?: string | null;
  debugFlag?: string | null;
  vercelEnv?: string | null;
  hostname?: string | null;
};

export type OpenAiAdsRuntime = {
  active: boolean;
  pixelId: string | null;
  debug: boolean;
  reason:
    | 'production_blocked'
    | 'production_host_blocked'
    | 'disabled'
    | 'pixel_id_not_authorized'
    | 'preview_or_local_enabled';
};

export function isProductionAdsHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return PRODUCTION_HOSTS.has(host);
}

export function resolveOpenAiAdsRuntime(env: OpenAiAdsEnv): OpenAiAdsRuntime {
  const vercelEnv = (env.vercelEnv ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') {
    return { active: false, pixelId: null, debug: false, reason: 'production_blocked' };
  }

  if (isProductionAdsHost(env.hostname)) {
    return { active: false, pixelId: null, debug: false, reason: 'production_host_blocked' };
  }

  const flag = (env.enabledFlag ?? '').trim().toLowerCase();
  if (flag !== 'true' && flag !== '1') {
    return { active: false, pixelId: null, debug: false, reason: 'disabled' };
  }

  const pixelId = (env.pixelId ?? '').trim();
  if (pixelId !== AUTHORIZED_OPENAI_ADS_PIXEL_ID) {
    return { active: false, pixelId: null, debug: false, reason: 'pixel_id_not_authorized' };
  }

  return {
    active: true,
    pixelId,
    debug: (env.debugFlag ?? '').trim().toLowerCase() === 'true',
    reason: 'preview_or_local_enabled',
  };
}

/** Gate do servidor. O hostname de Production é recusado de novo no navegador. */
export function readOpenAiAdsServerGate(): boolean {
  return resolveOpenAiAdsRuntime({
    enabledFlag: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ENABLED,
    pixelId: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID,
    debugFlag: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_DEBUG,
    vercelEnv: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? '',
  }).active;
}
