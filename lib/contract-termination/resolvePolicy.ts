/**
 * Resolução da política a partir do snapshot da venda/contrato.
 * Não consulta empresa/projeto atuais e não herda ARAGUAIA.
 */

import {
  getCatalogPolicy,
  missingPolicy,
  POLICY_CATALOG,
} from '@/lib/contract-termination/policyCatalog';
import type { TerminationPolicy } from '@/lib/contract-termination/types';

export type ResolveTerminationPolicyInput = {
  saleContractModel?: string | null;
  contractContractModel?: string | null;
};

export type ResolvedTerminationPolicy = {
  detectedModel: string | null;
  policy: TerminationPolicy;
};

function canonicalizeCatalogKey(raw: unknown): string | null {
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

/**
 * Snapshot da venda tem prioridade sobre o snapshot do contrato.
 * Ausência de ambos → política missing (erro controlado), nunca PADRAO/ARAGUAIA.
 */
export function resolveTerminationPolicy(
  input: ResolveTerminationPolicyInput,
): ResolvedTerminationPolicy {
  const saleKey = canonicalizeCatalogKey(input.saleContractModel);
  const contractKey = canonicalizeCatalogKey(input.contractContractModel);
  const detectedModel = saleKey || contractKey;

  if (!detectedModel) {
    return { detectedModel: null, policy: missingPolicy(null) };
  }

  const fromCatalog = getCatalogPolicy(detectedModel);
  if (fromCatalog) {
    return { detectedModel, policy: fromCatalog };
  }

  return { detectedModel, policy: missingPolicy(detectedModel) };
}
