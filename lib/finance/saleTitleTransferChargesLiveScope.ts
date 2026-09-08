/**
 * LIVE do cancelamento externo da Transferência de titularidade — fail closed.
 * Isolado de LOT_SWAP_EXTERNAL_CHARGES_LIVE.
 * Production: Asaas homologado ON; Inter remoto BLOCKED (sem POST /cancelar).
 * LIVE=true global: inválido.
 * DEVELOP sem LIVE=scoped: cancela Asaas/Inter automaticamente (homologação).
 */

import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';
import {
  EXTERNAL_CHARGE_PROVIDER_ASAAS,
  EXTERNAL_CHARGE_PROVIDER_INTER,
  normalizeExternalChargeProviderCode,
} from '@/lib/finance/externalCharges/types';
import { TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING_MESSAGE } from '@/lib/finance/saleTitleTransferExecute';

export const TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE_ENV =
  'TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE';
export const TITLE_TRANSFER_CHARGES_LIVE_PROVIDERS_ENV =
  'TITLE_TRANSFER_CHARGES_LIVE_PROVIDERS';
export const TITLE_TRANSFER_CHARGES_LIVE_COMPANY_IDS_ENV =
  'TITLE_TRANSFER_CHARGES_LIVE_COMPANY_IDS';
export const TITLE_TRANSFER_CHARGES_LIVE_SALE_IDS_ENV =
  'TITLE_TRANSFER_CHARGES_LIVE_SALE_IDS';

export const TITLE_TRANSFER_CHARGES_LIVE_MODE_SCOPED = 'scoped';

const FORBIDDEN_TOKENS = new Set(['true', 'false', 'all', '*', 'any', 'scoped']);
const ID_TOKEN = /^[a-z0-9][a-z0-9_-]{1,62}$/i;
const PROVIDER_TOKEN = /^[A-Z][A-Z0-9]{1,15}$/;

export type TitleTransferChargesLiveScopeInput = {
  companyId?: string | null;
  saleId?: string | null;
  provider?: string | null;
  supabaseUrl?: string | null;
};

export type TitleTransferChargesLiveScopeResult = {
  live: boolean;
  liveScoped: boolean;
  reason: string;
  provider: string | null;
};

let envOverrideForTests: Record<string, string | undefined> | null = null;

export function setTitleTransferChargesLiveScopeEnvForTests(
  env: Record<string, string | undefined> | null,
): void {
  envOverrideForTests = env ? { ...env } : null;
}

function readEnv(name: string): string {
  const src = envOverrideForTests || process.env;
  return String(src[name] ?? '').trim();
}

function supabaseUrlFrom(input: TitleTransferChargesLiveScopeInput): string {
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
  return { ok: true, values: [...new Set(values)] };
}

export function resolveTitleTransferExternalChargesLiveScope(
  input: TitleTransferChargesLiveScopeInput,
): TitleTransferChargesLiveScopeResult {
  const url = supabaseUrlFrom(input);
  const productionRuntime =
    isProductionSupabaseRuntime(url) ||
    String(readEnv('VERCEL_ENV') || '').toLowerCase() === 'production';
  const developRuntime = isDevelopHomologRuntime(url);
  const mode = readEnv(TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE_ENV);
  const modeScoped = mode === TITLE_TRANSFER_CHARGES_LIVE_MODE_SCOPED;
  const provider = normalizeExternalChargeProviderCode(input.provider);

  if (productionRuntime) {
    if (provider === EXTERNAL_CHARGE_PROVIDER_ASAAS) {
      return {
        live: true,
        liveScoped: false,
        reason: 'PRODUCTION_ASAAS_HOMOLOGATED',
        provider,
      };
    }
    return { live: false, liveScoped: false, reason: 'PRODUCTION', provider };
  }
  if (mode === 'true') {
    return { live: false, liveScoped: false, reason: 'MODE_GLOBAL_TRUE', provider };
  }
  if (!modeScoped) {
    if (developRuntime) {
      return { live: true, liveScoped: false, reason: 'DEVELOP_HOMOLOG_AUTO', provider };
    }
    return { live: false, liveScoped: false, reason: 'MODE_NOT_SCOPED', provider };
  }
  if (!developRuntime) {
    return { live: false, liveScoped: true, reason: 'NOT_DEVELOP', provider };
  }
  const providers = parseCsv(readEnv(TITLE_TRANSFER_CHARGES_LIVE_PROVIDERS_ENV), 'provider');
  const companies = parseCsv(readEnv(TITLE_TRANSFER_CHARGES_LIVE_COMPANY_IDS_ENV), 'id');
  const sales = parseCsv(readEnv(TITLE_TRANSFER_CHARGES_LIVE_SALE_IDS_ENV), 'id');
  const companyId = String(input.companyId || '').trim().toLowerCase();
  const saleId = String(input.saleId || '').trim().toLowerCase();
  if (!providers.ok || !provider || !providers.values.includes(provider)) {
    return { live: false, liveScoped: true, reason: 'PROVIDER_NOT_ALLOWED', provider };
  }
  if (!companies.ok || !companyId || !companies.values.includes(companyId)) {
    return { live: false, liveScoped: true, reason: 'COMPANY_NOT_ALLOWED', provider };
  }
  if (!sales.ok || !saleId || !sales.values.includes(saleId)) {
    return { live: false, liveScoped: true, reason: 'SALE_NOT_ALLOWED', provider };
  }
  return { live: true, liveScoped: true, reason: 'SCOPED_MATCH', provider };
}

export function isTitleTransferExternalChargesLiveAuthorized(input: {
  companyId?: string | null;
  saleId?: string | null;
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
    const empty = resolveTitleTransferExternalChargesLiveScope({
      companyId: input.companyId,
      saleId: input.saleId,
      provider: null,
      supabaseUrl: input.supabaseUrl,
    });
    return { live: false, liveScoped: empty.liveScoped, provider: null };
  }
  let liveScoped = false;
  let lastProvider: string | null = null;
  for (const provider of unique) {
    const result = resolveTitleTransferExternalChargesLiveScope({
      companyId: input.companyId,
      saleId: input.saleId,
      provider,
      supabaseUrl: input.supabaseUrl,
    });
    liveScoped = liveScoped || result.liveScoped;
    lastProvider = result.provider;
    if (!result.live) {
      return { live: false, liveScoped: result.liveScoped, provider: result.provider };
    }
  }
  return { live: true, liveScoped, provider: lastProvider };
}

export function isTitleTransferProductionRuntime(supabaseUrl?: string | null): boolean {
  const url = String(
    supabaseUrl ||
      readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
      readEnv('SUPABASE_URL') ||
      '',
  ).trim();
  if (isProductionSupabaseRuntime(url)) return true;
  return String(readEnv('VERCEL_ENV') || '').toLowerCase() === 'production';
}

export function isTitleTransferOrphanResolveUiEnabled(supabaseUrl?: string | null): boolean {
  if (isTitleTransferProductionRuntime(supabaseUrl)) return false;
  const url = String(
    supabaseUrl ||
      readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
      readEnv('SUPABASE_URL') ||
      '',
  ).trim();
  return isDevelopHomologRuntime(url);
}

function isInterChargeRow(row: { provider?: string | null }): boolean {
  return normalizeExternalChargeProviderCode(row.provider) === EXTERNAL_CHARGE_PROVIDER_INTER;
}

export function titleTransferHasProductionInterRemoteCancelPending(input: {
  open?: Array<{ provider?: string | null }>;
  orphans?: Array<{ provider?: string | null }>;
  wouldCancel?: Array<{ provider?: string | null }>;
  supabaseUrl?: string | null;
}): boolean {
  if (!isTitleTransferProductionRuntime(input.supabaseUrl)) return false;
  const rows = [
    ...(input.open || []),
    ...(input.orphans || []),
    ...(input.wouldCancel || []),
  ];
  return rows.some(isInterChargeRow);
}

export { TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING_MESSAGE };
