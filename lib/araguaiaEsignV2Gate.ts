/**
 * Gate central ARAGUAIA e-sign V2 — homologação controlada por allowlist.
 *
 * V2 (persistir INTERVENIENT / WITNESS_*) só quando:
 * 1. ARAGUAIA_ESIGN_V2_ENABLED (env) estiver ligada;
 * 2. contractModel === ARAGUAIA;
 * 3. companyId estiver na allowlist explícita.
 *
 * Fail closed: sem companyId ⇒ V2 desligada.
 * Empresas fora da allowlist permanecem no fluxo V1 (BUYER + VENDORs [+ SPOUSE n/a]).
 *
 * Preview e Production compartilham o mesmo Supabase — NUNCA ligar V2 global sem allowlist.
 */

import { TOPOGRAFIA_COMPANY_ID } from '@/lib/companySettingsLayout';

/** Liga o gate no ambiente (Preview homologação). Production: ausente/false. */
export const ARAGUAIA_ESIGN_V2_ENABLED_ENV = 'ARAGUAIA_ESIGN_V2_ENABLED' as const;

/**
 * CSV de company UUID extras (além dos defaults).
 * Ex.: incluir R R NEGÓCIOS após confirmar companies.id no SELECT.
 */
export const ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV =
  'ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS' as const;

/**
 * Empresas com ID confirmado no código-fonte (não inventar UUID).
 *
 * - SV Topografia e Projetos: `TOPOGRAFIA_COMPANY_ID` em lib/companySettingsLayout.ts
 *   (mesmo ID de referência Asaas / settings piloto).
 * - R R NEGÓCIOS & SERVIÇOS LTDA: **não há UUID no repositório**.
 *   Resolver via SELECT read-only em public.companies e colocar no env.
 */
export const ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS = {
  SV_TOPOGRAFIA: TOPOGRAFIA_COMPANY_ID,
} as const;

/** Defaults embutidos — só IDs com origem confirmada no repo. */
export const ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS: readonly string[] = [
  ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS.SV_TOPOGRAFIA,
];

export type AraguaiaEsignV2GateInput = {
  companyId?: string | null;
  contractModel?: string | null;
};

function isAraguaiaContractModel(model?: string | null): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase();
  return key === 'ARAGUAIA' || key.includes('ARAGUAIA');
}

function parseTruthyEnv(raw: string | undefined | null): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseCompanyIdCsv(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Flag de ambiente (sem company/modelo). */
export function isAraguaiaEsignV2EnvEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseTruthyEnv(env[ARAGUAIA_ESIGN_V2_ENABLED_ENV]);
}

/**
 * Allowlist efetiva = defaults conhecidos ∪ CSV do env.
 * Passar `env` nos testes para isolamento.
 */
export function getAraguaiaEsignV2AllowedCompanyIds(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const fromEnv = parseCompanyIdCsv(env[ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]);
  const merged = new Set<string>([
    ...ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS,
    ...fromEnv,
  ]);
  return [...merged];
}

export function isCompanyOnAraguaiaEsignV2Allowlist(
  companyId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = String(companyId ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return getAraguaiaEsignV2AllowedCompanyIds(env).some(
    (id) => id.trim().toLowerCase() === normalized,
  );
}

/**
 * Gate único — preferir este helper em todo fluxo de persistência V2.
 */
export function shouldEnableAraguaiaEsignV2(
  params: AraguaiaEsignV2GateInput,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isAraguaiaEsignV2EnvEnabled(env)) return false;
  if (!isAraguaiaContractModel(params.contractModel)) return false;
  const companyId = String(params.companyId ?? '').trim();
  if (!companyId) return false;
  return isCompanyOnAraguaiaEsignV2Allowlist(companyId, env);
}
