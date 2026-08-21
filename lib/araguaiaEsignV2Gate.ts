/**
 * Gate central ARAGUAIA e-sign V2 — homologação controlada por allowlist.
 *
 * V2 (persistir INTERVENIENT / WITNESS_*) só quando:
 * 1. ARAGUAIA_ESIGN_V2_ENABLED (env) estiver ligada;
 * 2. contractModel === ARAGUAIA;
 * 3. companyId estiver na allowlist explícita.
 *
 * Fail closed: sem companyId ⇒ V2 desligada.
 * Empresas fora da allowlist permanecem no fluxo V1.
 *
 * Preview e Production compartilham o mesmo Supabase — NUNCA ligar V2 global sem allowlist.
 *
 * NÃO reutilizar TOPOGRAFIA_COMPANY_ID (5ebfe934-…) do Asaas/settings:
 * esse UUID NÃO existe em public.companies no banco vivo (Etapa 7 FASE C.1).
 */

/** Liga o gate no ambiente (Preview homologação). Production: ausente/false. */
export const ARAGUAIA_ESIGN_V2_ENABLED_ENV = 'ARAGUAIA_ESIGN_V2_ENABLED' as const;

/**
 * CSV de company UUID extras (além do default de homologação).
 * 1ª homologação: deixar AUSENTE/vazio — só a empresa de teste entra.
 * R R NEGÓCIOS: incluir só após 2ª homologação autorizada.
 */
export const ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV =
  'ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS' as const;

/**
 * Empresa de teste confirmada no Supabase (FASE C.1):
 * S.V TOPOGRAFIA E PROJETO LTDA
 * - companies.id = f26f2331-1885-4ac6-8d0e-4131cc8a8014
 * - is_test_company = true
 * - contract_model = ARAGUAIA
 * - companies.tenant_id = NULL (irrelevante: o gate usa contracts.company_id)
 */
export const ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID =
  'f26f2331-1885-4ac6-8d0e-4131cc8a8014' as const;

/**
 * UUID legado em lib/companySettingsLayout (TOPOGRAFIA_COMPANY_ID).
 * NÃO está em public.companies no banco atual — NÃO autorizar no gate V2.
 */
export const ARAGUAIA_ESIGN_V2_STALE_TOPOGRAFIA_COMPANY_ID =
  '5ebfe934-e1ae-4252-b3dd-808390c32551' as const;

/**
 * IDs conhecidos do gate V2 (homologação).
 * Separado de TOPOGRAFIA_COMPANY_ID (Asaas/settings) de propósito.
 */
export const ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS = {
  /** 1ª homologação — S.V Topografia (teste). */
  SV_TOPOGRAFIA_TEST: ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
} as const;

/** Defaults embutidos — somente a empresa de teste confirmada no banco. */
export const ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS: readonly string[] = [
  ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
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
 * Allowlist efetiva = defaults de homologação ∪ CSV do env.
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
