/**
 * LIVE da Fase 5B — fail closed.
 * Production: sempre OFF.
 * LIVE=true global: inválido.
 * DEVELOP sem LIVE=scoped: cancela Asaas/Inter automaticamente (como Limpar lote).
 * LIVE=scoped: allowlist company/provider/sale/swap no DEVELOP.
 * Sem IDs de homologação neste arquivo. Sem if/switch de banco.
 */

import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';
import { normalizeExternalChargeProviderCode } from '@/lib/finance/externalCharges/types';

export const LOT_SWAP_EXTERNAL_CHARGES_LIVE_ENV = 'LOT_SWAP_EXTERNAL_CHARGES_LIVE';
export const LOT_SWAP_CHARGES_LIVE_PROVIDERS_ENV = 'LOT_SWAP_CHARGES_LIVE_PROVIDERS';
export const LOT_SWAP_CHARGES_LIVE_COMPANY_IDS_ENV = 'LOT_SWAP_CHARGES_LIVE_COMPANY_IDS';
export const LOT_SWAP_CHARGES_LIVE_SALE_IDS_ENV = 'LOT_SWAP_CHARGES_LIVE_SALE_IDS';
export const LOT_SWAP_CHARGES_LIVE_SWAP_IDS_ENV = 'LOT_SWAP_CHARGES_LIVE_SWAP_IDS';

export const LOT_SWAP_CHARGES_LIVE_MODE_SCOPED = 'scoped';

const FORBIDDEN_TOKENS = new Set(['true', 'false', 'all', '*', 'any', 'scoped']);
const ID_TOKEN = /^[a-z0-9][a-z0-9_-]{1,62}$/i;
const PROVIDER_TOKEN = /^[A-Z][A-Z0-9]{1,15}$/;

export type LotSwapChargesLiveScopeInput = {
  companyId?: string | null;
  saleId?: string | null;
  swapId?: string | null;
  provider?: string | null;
  supabaseUrl?: string | null;
};

export type LotSwapChargesLiveScopeMatches = {
  developRuntime: boolean;
  productionRuntime: boolean;
  modeScoped: boolean;
  provider: boolean;
  company: boolean;
  sale: boolean;
  swap: boolean;
};

export type LotSwapChargesLiveScopeResult = {
  live: boolean;
  liveScoped: boolean;
  reason: string;
  provider: string | null;
  matches: LotSwapChargesLiveScopeMatches;
};

let envOverrideForTests: Record<string, string | undefined> | null = null;

export function setLotSwapChargesLiveScopeEnvForTests(
  env: Record<string, string | undefined> | null,
): void {
  envOverrideForTests = env ? { ...env } : null;
}

function readEnv(name: string): string {
  const src = envOverrideForTests || process.env;
  return String(src[name] ?? '').trim();
}

function supabaseUrlFrom(input: LotSwapChargesLiveScopeInput): string {
  return String(
    input.supabaseUrl ||
      readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
      readEnv('SUPABASE_URL') ||
      '',
  ).trim();
}

function parseCsv(raw: string, kind: 'id' | 'provider'): { ok: boolean; values: string[] } {
  const parts = String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { ok: false, values: [] };
  const values: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (FORBIDDEN_TOKENS.has(lower)) return { ok: false, values: [] };
    if (kind === 'provider') {
      const code = normalizeExternalChargeProviderCode(part);
      if (!code || !PROVIDER_TOKEN.test(code)) return { ok: false, values: [] };
      values.push(code);
      continue;
    }
    if (!ID_TOKEN.test(part)) return { ok: false, values: [] };
    values.push(part.toLowerCase());
  }
  if (!values.length) return { ok: false, values: [] };
  return { ok: true, values: [...new Set(values)] };
}

function off(
  reason: string,
  extra: Partial<LotSwapChargesLiveScopeResult> & {
    matches: LotSwapChargesLiveScopeMatches;
  },
): LotSwapChargesLiveScopeResult {
  return {
    live: false,
    liveScoped: Boolean(extra.liveScoped),
    provider: extra.provider ?? null,
    reason,
    matches: extra.matches,
  };
}

export function resolveLotSwapExternalChargesLiveScope(
  input: LotSwapChargesLiveScopeInput,
): LotSwapChargesLiveScopeResult {
  const url = supabaseUrlFrom(input);
  const productionRuntime = isProductionSupabaseRuntime(url);
  const developRuntime = isDevelopHomologRuntime(url);
  const mode = readEnv(LOT_SWAP_EXTERNAL_CHARGES_LIVE_ENV);
  const modeScoped = mode === LOT_SWAP_CHARGES_LIVE_MODE_SCOPED;
  const provider = normalizeExternalChargeProviderCode(input.provider);
  const matches: LotSwapChargesLiveScopeMatches = {
    developRuntime,
    productionRuntime,
    modeScoped,
    provider: false,
    company: false,
    sale: false,
    swap: false,
  };

  if (productionRuntime) {
    return off('PRODUCTION', { provider, matches });
  }
  if (mode === 'true') {
    return off('MODE_GLOBAL_TRUE', { provider, matches });
  }
  if (!modeScoped) {
    if (developRuntime) {
      return {
        live: true,
        liveScoped: false,
        reason: 'DEVELOP_HOMOLOG_AUTO',
        provider,
        matches: { ...matches, developRuntime: true },
      };
    }
    return off('MODE_NOT_SCOPED', { provider, matches });
  }
  if (!developRuntime) {
    return off('NOT_DEVELOP', { provider, matches: { ...matches, modeScoped: true } });
  }

  const providers = parseCsv(readEnv(LOT_SWAP_CHARGES_LIVE_PROVIDERS_ENV), 'provider');
  const companies = parseCsv(readEnv(LOT_SWAP_CHARGES_LIVE_COMPANY_IDS_ENV), 'id');
  const sales = parseCsv(readEnv(LOT_SWAP_CHARGES_LIVE_SALE_IDS_ENV), 'id');
  const swapRaw = readEnv(LOT_SWAP_CHARGES_LIVE_SWAP_IDS_ENV);
  const swaps = swapRaw ? parseCsv(swapRaw, 'id') : { ok: true, values: [] as string[] };

  const companyId = String(input.companyId || '').trim().toLowerCase();
  const saleId = String(input.saleId || '').trim().toLowerCase();
  const swapId = String(input.swapId || '').trim().toLowerCase();

  const scopedMatches: LotSwapChargesLiveScopeMatches = {
    developRuntime: true,
    productionRuntime: false,
    modeScoped: true,
    provider: Boolean(provider && providers.ok && providers.values.includes(provider)),
    company: Boolean(companyId && companies.ok && companies.values.includes(companyId)),
    sale: Boolean(saleId && sales.ok && sales.values.includes(saleId)),
    swap: swapRaw
      ? Boolean(swapId && swaps.ok && swaps.values.includes(swapId))
      : true,
  };

  const fail = (reason: string) =>
    off(reason, { provider, matches: scopedMatches, liveScoped: true });

  if (!providers.ok) {
    return fail(readEnv(LOT_SWAP_CHARGES_LIVE_PROVIDERS_ENV) ? 'PROVIDERS_INVALID' : 'PROVIDERS_EMPTY');
  }
  if (!provider) return fail('PROVIDER_MISSING');
  if (!scopedMatches.provider) return fail('PROVIDER_NOT_ALLOWED');
  if (!companies.ok) {
    return fail(readEnv(LOT_SWAP_CHARGES_LIVE_COMPANY_IDS_ENV) ? 'COMPANY_INVALID' : 'COMPANY_EMPTY');
  }
  if (!scopedMatches.company) return fail(companyId ? 'COMPANY_NOT_ALLOWED' : 'COMPANY_EMPTY');
  if (!sales.ok) {
    return fail(readEnv(LOT_SWAP_CHARGES_LIVE_SALE_IDS_ENV) ? 'SALE_INVALID' : 'SALE_EMPTY');
  }
  if (!scopedMatches.sale) return fail(saleId ? 'SALE_NOT_ALLOWED' : 'SALE_EMPTY');
  if (swapRaw) {
    if (!swaps.ok) return fail('SWAP_INVALID');
    if (!scopedMatches.swap) return fail(swapId ? 'SWAP_NOT_ALLOWED' : 'SWAP_EMPTY');
  }

  return {
    live: true,
    liveScoped: true,
    reason: 'SCOPED_MATCH',
    provider,
    matches: scopedMatches,
  };
}

export function isLotSwapExternalChargesLiveAuthorized(input: {
  companyId?: string | null;
  saleId?: string | null;
  swapId?: string | null;
  providers: Array<string | null | undefined>;
  supabaseUrl?: string | null;
}): { live: boolean; liveScoped: boolean; provider: string | null } {
  const unique = [
    ...new Set(
      (input.providers || [])
        .map((code) => normalizeExternalChargeProviderCode(code))
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  if (!unique.length) {
    const empty = resolveLotSwapExternalChargesLiveScope({
      companyId: input.companyId,
      saleId: input.saleId,
      swapId: input.swapId,
      provider: null,
      supabaseUrl: input.supabaseUrl,
    });
    return { live: false, liveScoped: empty.liveScoped, provider: null };
  }
  let liveScoped = false;
  let lastProvider: string | null = null;
  for (const provider of unique) {
    const result = resolveLotSwapExternalChargesLiveScope({
      companyId: input.companyId,
      saleId: input.saleId,
      swapId: input.swapId,
      provider,
      supabaseUrl: input.supabaseUrl,
    });
    liveScoped = liveScoped || result.liveScoped;
    lastProvider = result.provider;
    if (!result.live) {
      return { live: false, liveScoped: result.liveScoped, provider: result.provider };
    }
  }
  return { live: true, liveScoped: liveScoped || true, provider: lastProvider };
}

export function logLotSwapChargesLiveScopeSanitized(result: {
  live: boolean;
  liveScoped: boolean;
  provider: string | null;
  matches?: Partial<LotSwapChargesLiveScopeMatches>;
}): void {
  console.info('[lot-swap 5B live-scope]', {
    live: result.live,
    liveScoped: result.liveScoped,
    provider: result.provider,
    company: Boolean(result.matches?.company),
    sale: Boolean(result.matches?.sale),
    swap: Boolean(result.matches?.swap),
  });
}
