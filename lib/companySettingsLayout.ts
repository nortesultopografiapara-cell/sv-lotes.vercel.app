/**
 * Layout da tela Configurações — padrão único v2 (menu lateral) para todas as empresas.
 */

/** SV TOPOGRAFIA E PROJETOS LTDA — referência de empresa piloto (Asaas, contratos, etc.). */
export const TOPOGRAFIA_COMPANY_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';

/** Ivanilde de Moura Silva (PF) — CPF legado usado em contratos Recanto. */
export const IVANILDE_LEGACY_CPF = '32641281104';

/** @deprecated Rollout concluído — todas as empresas usam v2. */
export const SETTINGS_V2_ROLLOUT_ISO = '2026-06-08T00:00:00.000Z';

export type CompanySettingsLayout = 'legacy' | 'v2';

/** @deprecated Layout legacy removido — mantido apenas para compatibilidade de tipos. */
export function isLegacySettingsCompanyDocument(_documentRaw?: string | null): boolean {
  return false;
}

/** @deprecated Layout legacy removido — mantido apenas para compatibilidade de tipos. */
export function isLegacySettingsCompany(_companyId: string, _options?: { documentRaw?: string | null }): boolean {
  return false;
}

/** Todas as empresas utilizam o layout v2 com menu lateral interno. */
export function resolveCompanySettingsLayout(
  _companyId: string,
  _options?: {
    documentRaw?: string | null;
    createdAt?: string | null;
    settingsLayout?: string | null;
  },
): CompanySettingsLayout {
  return 'v2';
}

/** @deprecated Use resolveCompanySettingsLayout — policy unificada. */
export function resolveCompanySettingsLayoutPolicy(
  companyId: string,
  options?: {
    documentRaw?: string | null;
    createdAt?: string | null;
    settingsLayout?: string | null;
  },
): CompanySettingsLayout {
  return resolveCompanySettingsLayout(companyId, options);
}

export function companySettingsLayoutLabel(_layout: CompanySettingsLayout): string {
  return 'Configurações v2';
}
