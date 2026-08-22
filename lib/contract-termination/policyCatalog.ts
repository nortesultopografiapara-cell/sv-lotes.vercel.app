/**
 * Catálogo explícito de políticas de restituição.
 * Sem fallback silencioso para ARAGUAIA ou percentual global.
 */

import type { TerminationPolicy } from '@/lib/contract-termination/types';

export const POLICY_CATALOG_VERSION = 'termination-policy-catalog.v1';

export const INCOMPLETE_POLICY_MESSAGE =
  'Este contrato não possui política de restituição homologada para cálculo automático.';

export const MISSING_POLICY_MESSAGE =
  'Não foi possível identificar a política de restituição deste contrato.';

const INCOMPLETE_BASE: Omit<
  TerminationPolicy,
  'catalogKey' | 'catalogLabel' | 'policyVersion'
> = {
  status: 'INCOMPLETE',
  policySource: 'catalog',
  clauseReference: null,
  incompleteMessage: INCOMPLETE_POLICY_MESSAGE,
  entryRefundable: false,
  signalRefundable: false,
  otherRefundable: false,
  contractualRetentionPercent: null,
  refundInstallmentCountRule: 'NOT_DEFINED',
  improvementsBlockFinalCalculation: false,
  creditOtherUnitAllowed: false,
  creditOtherUnitAutomatic: false,
};

function incompleteEntry(
  catalogKey: string,
  catalogLabel: string,
  policyVersion: string,
): TerminationPolicy {
  return {
    ...INCOMPLETE_BASE,
    catalogKey,
    catalogLabel,
    policyVersion,
  };
}

/** ARAGUAIA v1 — Cláusula Terceira, item 8. Homologada para cálculo automático. */
export const ARAGUAIA_POLICY_V1: TerminationPolicy = {
  status: 'COMPLETE',
  policyVersion: 'araguaia.clause3.item8.v1',
  policySource: 'catalog',
  catalogKey: 'ARAGUAIA',
  catalogLabel: 'Chacreamento Araguaia',
  clauseReference: 'Cláusula 3 — itens 6 a 9',
  incompleteMessage: null,
  entryRefundable: false,
  signalRefundable: false,
  otherRefundable: false,
  contractualRetentionPercent: 25,
  refundInstallmentCountRule: 'PAID_REGULAR_INSTALLMENTS',
  improvementsBlockFinalCalculation: true,
  creditOtherUnitAllowed: true,
  creditOtherUnitAutomatic: false,
};

export const POLICY_CATALOG: Record<string, TerminationPolicy> = {
  ARAGUAIA: ARAGUAIA_POLICY_V1,
  PADRAO: incompleteEntry('PADRAO', 'Padrão SV LOTES', 'padrao.incomplete.v0'),
  MENESES: incompleteEntry('MENESES', 'Meneses', 'meneses.incomplete.v0'),
  RECANTO_PRIMAVERA: incompleteEntry(
    'RECANTO_PRIMAVERA',
    'Recanto Primavera',
    'recanto_primavera.incomplete.v0',
  ),
  SV_LOTES_2: incompleteEntry('SV_LOTES_2', 'SV LOTES 2.0', 'sv_lotes_2.incomplete.v0'),
  CUSTOM: incompleteEntry('CUSTOM', 'Personalizado', 'custom.incomplete.v0'),
};

export const POLICY_CATALOG_KEYS = Object.keys(POLICY_CATALOG);

export function canonicalizeCatalogKey(raw: unknown): string | null {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
  if (!value) return null;

  if (value.includes('ARAGUAIA')) return 'ARAGUAIA';
  if (
    value === 'SV_LOTES_2' ||
    value === 'SV_LOTES_20' ||
    value.includes('SV_LOTES_2')
  ) {
    return 'SV_LOTES_2';
  }
  if (value.includes('RECANTO')) return 'RECANTO_PRIMAVERA';
  if (value === 'MENESES') return 'MENESES';
  if (value === 'CUSTOM' || value === 'PERSONALIZADO') return 'CUSTOM';
  if (value === 'PADRAO' || value === 'PADRÃO' || value === 'PADRAO_SV_LOTES') {
    return 'PADRAO';
  }
  if (POLICY_CATALOG[value]) return value;
  return value;
}

export function getCatalogPolicy(catalogKey: string | null | undefined): TerminationPolicy | null {
  if (!catalogKey) return null;
  return POLICY_CATALOG[catalogKey] || null;
}

export function missingPolicy(detectedModel: string | null): TerminationPolicy {
  return {
    status: 'INCOMPLETE',
    policyVersion: 'missing',
    policySource: 'missing',
    catalogKey: detectedModel,
    catalogLabel: detectedModel ? `Modelo ${detectedModel}` : 'Modelo não identificado',
    clauseReference: null,
    incompleteMessage: MISSING_POLICY_MESSAGE,
    entryRefundable: false,
    signalRefundable: false,
    otherRefundable: false,
    contractualRetentionPercent: null,
    refundInstallmentCountRule: 'NOT_DEFINED',
    improvementsBlockFinalCalculation: false,
    creditOtherUnitAllowed: false,
    creditOtherUnitAutomatic: false,
  };
}
