/**
 * Resolução da política a partir de snapshot congelado ou, em legado, do modelo da venda.
 * Não consulta empresa/projeto atuais e não herda ARAGUAIA.
 */

import {
  canonicalizeCatalogKey,
  getCatalogPolicy,
  missingPolicy,
} from '@/lib/contract-termination/policyCatalog';
import {
  buildTerminationPolicyOrigin,
  parseTerminationPolicySnapshot,
  policyFromSnapshot,
} from '@/lib/contract-termination/snapshot';
import type {
  TerminationPersistSource,
  TerminationPolicy,
  TerminationPolicyOrigin,
} from '@/lib/contract-termination/types';

export { canonicalizeCatalogKey };

export type ResolveTerminationPolicyInput = {
  saleContractModel?: string | null;
  contractContractModel?: string | null;
};

export type ResolvedTerminationPolicy = {
  detectedModel: string | null;
  policy: TerminationPolicy;
};

export type ResolveOperationalTerminationPolicyInput = {
  saleSnapshot?: unknown;
  contractSnapshot?: unknown;
  salePersistSource?: string | null;
  contractPersistSource?: string | null;
  saleContractModel?: string | null;
  contractContractModel?: string | null;
};

export type ResolvedOperationalTerminationPolicy = ResolvedTerminationPolicy & {
  origin: TerminationPolicyOrigin;
  usedSnapshot: boolean;
};

function persistSourceOf(
  raw: string | null | undefined,
): TerminationPersistSource | 'missing' | null {
  if (raw === 'catalog' || raw === 'backfill_inferred') return raw;
  if (raw === 'missing') return 'missing';
  return null;
}

/**
 * Inferência legado: somente snapshots de modelo da venda/contrato.
 * Nunca usa o modelo atual da empresa.
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

/**
 * Prioridade operacional do preview:
 * 1. snapshot da venda
 * 2. snapshot do contrato
 * 3. inferência legado pelo contract_model da venda/contrato
 *
 * Snapshot existente (mesmo inválido) NÃO cai no catálogo vigente.
 */
export function resolveOperationalTerminationPolicy(
  input: ResolveOperationalTerminationPolicyInput,
): ResolvedOperationalTerminationPolicy {
  const saleParsed = parseTerminationPolicySnapshot(input.saleSnapshot);
  if (input.saleSnapshot != null && input.saleSnapshot !== '') {
    if (saleParsed.ok) {
      const policy = policyFromSnapshot(saleParsed.snapshot);
      return {
        detectedModel: saleParsed.snapshot.contractModel || saleParsed.snapshot.catalogKey,
        policy,
        usedSnapshot: true,
        origin: buildTerminationPolicyOrigin({
          kind: 'sale_snapshot',
          persistSource:
            persistSourceOf(input.salePersistSource) ||
            persistSourceOf(saleParsed.snapshot.policySource),
          policy,
        }),
      };
    }
    const policy = missingPolicy(null);
    return {
      detectedModel: null,
      policy,
      usedSnapshot: true,
      origin: buildTerminationPolicyOrigin({
        kind: 'sale_snapshot',
        persistSource: persistSourceOf(input.salePersistSource),
        policy,
      }),
    };
  }

  const contractParsed = parseTerminationPolicySnapshot(input.contractSnapshot);
  if (input.contractSnapshot != null && input.contractSnapshot !== '') {
    if (contractParsed.ok) {
      const policy = policyFromSnapshot(contractParsed.snapshot);
      return {
        detectedModel:
          contractParsed.snapshot.contractModel || contractParsed.snapshot.catalogKey,
        policy,
        usedSnapshot: true,
        origin: buildTerminationPolicyOrigin({
          kind: 'contract_snapshot',
          persistSource:
            persistSourceOf(input.contractPersistSource) ||
            persistSourceOf(contractParsed.snapshot.policySource),
          policy,
        }),
      };
    }
    const policy = missingPolicy(null);
    return {
      detectedModel: null,
      policy,
      usedSnapshot: true,
      origin: buildTerminationPolicyOrigin({
        kind: 'contract_snapshot',
        persistSource: persistSourceOf(input.contractPersistSource),
        policy,
      }),
    };
  }

  const inferred = resolveTerminationPolicy({
    saleContractModel: input.saleContractModel,
    contractContractModel: input.contractContractModel,
  });
  const missing = inferred.policy.policySource === 'missing';
  return {
    ...inferred,
    usedSnapshot: false,
    origin: buildTerminationPolicyOrigin({
      kind: missing ? 'missing' : 'legacy_inferred',
      persistSource: missing ? 'missing' : null,
      policy: inferred.policy,
    }),
  };
}
