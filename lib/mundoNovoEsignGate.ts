/**
 * Gate central MUNDO_NOVO e-sign — R R + modelo MUNDO_NOVO.
 *
 * Preview/dev: ON por padrão para a R R na allowlist; false explícito desliga.
 * Production Vercel: só liga com MUNDO_NOVO_ESIGN_ENABLED=true + company na
 * allowlist (default = R R NEGÓCIOS & SERVIÇOS LTDA). Outros tenants = OFF.
 * Preview apontando para banco Production = OFF (não mistura ambientes).
 *
 * Identificação: params.companyId (companies.id), não project id.
 * NÃO reutilizar ARAGUAIA_ESIGN_V2_* nem buildAraguaiaEsignVendorPartyInputs.
 */

import {
  isProductionSupabaseRuntime,
  PRODUCTION_PROJECT_REF,
} from '@/lib/homolog/env';

export const MUNDO_NOVO_ESIGN_ENABLED_ENV = 'MUNDO_NOVO_ESIGN_ENABLED' as const;
export const MUNDO_NOVO_ESIGN_ALLOWED_COMPANY_IDS_ENV =
  'MUNDO_NOVO_ESIGN_ALLOWED_COMPANY_IDS' as const;

/** Tenant R R NEGÓCIOS & SERVIÇOS LTDA (mesmo UUID em DEVELOP e Production). */
export const MUNDO_NOVO_ESIGN_RR_COMPANY_ID =
  'cb9a7547-d7d8-4140-b4ac-893eca69d89f' as const;

export const MUNDO_NOVO_ESIGN_DEFAULT_ALLOWED_COMPANY_IDS: readonly string[] = [
  MUNDO_NOVO_ESIGN_RR_COMPANY_ID,
];

export const MUNDO_NOVO_ESIGN_DISABLED_MESSAGE =
  'E-sign do Chacreamento Mundo Novo não está habilitado neste ambiente.';

export type MundoNovoEsignGateInput = {
  companyId?: string | null;
  contractModel?: string | null;
};

function isMundoNovoContractModel(model?: string | null): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase();
  return key === 'MUNDO_NOVO' || key.includes('MUNDO_NOVO');
}

function parseTruthyEnv(raw: string | undefined | null): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseExplicitFalseEnv(raw: string | undefined | null): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

function parseCompanyIdCsv(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function readSupabaseUrl(env: NodeJS.ProcessEnv): string {
  return String(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '',
  ).trim();
}

function isProductionVercel(env: NodeJS.ProcessEnv): boolean {
  return String(env.VERCEL_ENV || '').toLowerCase() === 'production';
}

function isProductionSupabase(env: NodeJS.ProcessEnv): boolean {
  if (isProductionSupabaseRuntime(readSupabaseUrl(env))) return true;
  const ref = String(env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || '').trim();
  return Boolean(ref && ref === PRODUCTION_PROJECT_REF);
}

/**
 * Preview/dev apontando para banco Production — nunca liga e-sign.
 * Production Vercel não entra aqui: usa flag explícita + allowlist.
 */
export function isMundoNovoEsignProductionLocked(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isProductionVercel(env)) return false;
  return isProductionSupabase(env);
}

export function isMundoNovoEsignEnvExplicitlyDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseExplicitFalseEnv(env[MUNDO_NOVO_ESIGN_ENABLED_ENV]);
}

export function isMundoNovoEsignEnvEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isMundoNovoEsignProductionLocked(env)) return false;
  if (isMundoNovoEsignEnvExplicitlyDisabled(env)) return false;
  if (isProductionVercel(env)) {
    return parseTruthyEnv(env[MUNDO_NOVO_ESIGN_ENABLED_ENV]);
  }
  const raw = env[MUNDO_NOVO_ESIGN_ENABLED_ENV];
  if (raw == null || String(raw).trim() === '') return true;
  return parseTruthyEnv(raw);
}

export function getMundoNovoEsignAllowedCompanyIds(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const fromEnv = parseCompanyIdCsv(
    env[MUNDO_NOVO_ESIGN_ALLOWED_COMPANY_IDS_ENV],
  );
  return [
    ...new Set([...MUNDO_NOVO_ESIGN_DEFAULT_ALLOWED_COMPANY_IDS, ...fromEnv]),
  ];
}

export function isCompanyOnMundoNovoEsignAllowlist(
  companyId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = String(companyId ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return getMundoNovoEsignAllowedCompanyIds(env).some(
    (id) => id.trim().toLowerCase() === normalized,
  );
}

/**
 * Gate único do e-sign Mundo Novo.
 * Production: ENABLED=true + MUNDO_NOVO + companyId na allowlist (default R R).
 * Preview/dev: MUNDO_NOVO + allowlist (default R R), salvo flag false.
 */
export function shouldEnableMundoNovoEsign(
  params: MundoNovoEsignGateInput,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isMundoNovoEsignEnvEnabled(env)) return false;
  if (!isMundoNovoContractModel(params.contractModel)) return false;
  const companyId = String(params.companyId ?? '').trim();
  if (!companyId) return false;
  return isCompanyOnMundoNovoEsignAllowlist(companyId, env);
}
