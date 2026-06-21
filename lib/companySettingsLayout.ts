/**
 * Layout da tela Configurações — legacy preservado para empresas ativas;
 * v2 piloto em SV Topografia; novas empresas nascem com v2.
 */

import { MENESES_COMPANY_ID } from '@/lib/saasContractContent';

/** SV TOPOGRAFIA E PROJETOS LTDA — empresa piloto do layout v2. */
export const TOPOGRAFIA_COMPANY_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';

/** Ivanilde de Moura Silva (PF) — preservar layout legacy por CPF. */
export const IVANILDE_LEGACY_CPF = '32641281104';

const LEGACY_SETTINGS_COMPANY_IDS = new Set<string>([
  MENESES_COMPANY_ID,
]);

/** Empresas criadas a partir desta data usam layout v2 (exceto legacy explícito). */
export const SETTINGS_V2_ROLLOUT_ISO = '2026-06-08T00:00:00.000Z';

export type CompanySettingsLayout = 'legacy' | 'v2';

export function isLegacySettingsCompanyDocument(documentRaw?: string | null): boolean {
  const digits = String(documentRaw ?? '').replace(/\D/g, '');
  return digits === IVANILDE_LEGACY_CPF;
}

export function isLegacySettingsCompany(
  companyId: string,
  options?: { documentRaw?: string | null },
): boolean {
  if (LEGACY_SETTINGS_COMPANY_IDS.has(companyId)) return true;
  return isLegacySettingsCompanyDocument(options?.documentRaw);
}

export function resolveCompanySettingsLayout(
  companyId: string,
  options?: {
    documentRaw?: string | null;
    createdAt?: string | null;
    settingsLayout?: string | null;
  },
): CompanySettingsLayout {
  const stored = String(options?.settingsLayout ?? '').trim().toLowerCase();
  if (stored === 'legacy') return 'legacy';
  if (stored === 'v2') return 'v2';

  if (isLegacySettingsCompany(companyId, options)) return 'legacy';

  if (companyId === TOPOGRAFIA_COMPANY_ID) return 'v2';

  const createdAt = options?.createdAt ? new Date(options.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const rollout = new Date(SETTINGS_V2_ROLLOUT_ISO);
    if (createdAt >= rollout) return 'v2';
  }

  return 'legacy';
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

export function companySettingsLayoutLabel(layout: CompanySettingsLayout): string {
  return layout === 'v2' ? 'Configurações v2' : 'Configurações clássicas';
}
