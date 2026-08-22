/**
 * Snapshot imutável da política de encerramento vigente na data da venda.
 * Puro: sem queries. A persistência fica nos fluxos de criação/backfill.
 */

import {
  canonicalizeCatalogKey,
  getCatalogPolicy,
  missingPolicy,
  POLICY_CATALOG_VERSION,
} from '@/lib/contract-termination/policyCatalog';
import type {
  TerminationPersistSource,
  TerminationPolicy,
  TerminationPolicyOrigin,
  TerminationPolicySnapshot,
  TerminationSnapshotStatus,
} from '@/lib/contract-termination/types';

export type BuildTerminationPolicySnapshotInput = {
  contractModel?: string | null;
  persistSource: TerminationPersistSource;
  capturedAt?: string;
  warnings?: string[];
};

export type TerminationPolicyPersistColumns = {
  termination_policy_snapshot: TerminationPolicySnapshot;
  termination_policy_version: string;
  termination_policy_source: TerminationPersistSource;
};

function retentionBaseRuleFor(policy: TerminationPolicy): TerminationPolicySnapshot['retentionBaseRule'] {
  if (policy.status !== 'COMPLETE') return 'NOT_DEFINED';
  if (!policy.entryRefundable || !policy.signalRefundable) return 'EXCLUDE_NON_REFUNDABLE';
  return 'NOT_DEFINED';
}

function snapshotStatus(policy: TerminationPolicy): TerminationSnapshotStatus {
  if (policy.policySource === 'missing') return 'MISSING_POLICY';
  return policy.status;
}

export function isTerminationPolicySnapshot(
  value: unknown,
): value is TerminationPolicySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.policyVersion === 'string' && typeof row.status === 'string';
}

export function parseTerminationPolicySnapshot(
  raw: unknown,
): { ok: true; snapshot: TerminationPolicySnapshot } | { ok: false; reason: string } {
  if (raw == null || raw === '') {
    return { ok: false, reason: 'empty' };
  }
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
  }
  if (!isTerminationPolicySnapshot(value)) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, snapshot: value };
}

/**
 * Captura a policy ATUAL do catálogo para o modelo efetivo da venda.
 * INCOMPLETE/MISSING ainda geram snapshot explícito — nunca inventa percentual.
 */
export function buildTerminationPolicySnapshot(
  input: BuildTerminationPolicySnapshotInput,
): TerminationPolicyPersistColumns {
  const detectedModel = canonicalizeCatalogKey(input.contractModel);
  const fromCatalog = detectedModel ? getCatalogPolicy(detectedModel) : null;
  const policy = fromCatalog || missingPolicy(detectedModel);
  const capturedAt = input.capturedAt || new Date().toISOString();
  const warnings = [...(input.warnings || [])];

  const snapshot: TerminationPolicySnapshot = {
    status: snapshotStatus(policy),
    policyVersion: policy.policyVersion,
    policySource:
      policy.policySource === 'missing' ? 'missing' : input.persistSource,
    catalogKey: policy.catalogKey,
    catalogLabel: policy.catalogLabel,
    contractModel: detectedModel,
    clauseReference: policy.clauseReference,
    entryRefundable: policy.entryRefundable,
    signalRefundable: policy.signalRefundable,
    otherRefundable: policy.otherRefundable,
    contractualRetentionPercent: policy.contractualRetentionPercent,
    retentionBaseRule: retentionBaseRuleFor(policy),
    refundInstallmentCountRule: policy.refundInstallmentCountRule,
    improvementsBlockFinalCalculation: policy.improvementsBlockFinalCalculation,
    creditOtherUnitAllowed: policy.creditOtherUnitAllowed,
    creditOtherUnitAutomatic: false,
    createdFromPolicyCatalogVersion: POLICY_CATALOG_VERSION,
    capturedAt,
    incompleteMessage: policy.incompleteMessage,
    warnings: warnings.length ? warnings : undefined,
  };

  return {
    termination_policy_snapshot: snapshot,
    termination_policy_version: snapshot.policyVersion,
    termination_policy_source:
      snapshot.policySource === 'missing' ? input.persistSource : input.persistSource,
  };
}

/**
 * Reconstrói a policy do JSON congelado. Nunca consulta o catálogo vigente.
 */
export function policyFromSnapshot(
  snapshot: TerminationPolicySnapshot,
): TerminationPolicy {
  const missing = snapshot.status === 'MISSING_POLICY' || snapshot.policySource === 'missing';
  if (missing) {
    return {
      ...missingPolicy(snapshot.catalogKey || snapshot.contractModel),
      policyVersion: snapshot.policyVersion || 'missing',
      catalogLabel: snapshot.catalogLabel || missingPolicy(null).catalogLabel,
      clauseReference: snapshot.clauseReference,
    };
  }

  return {
    status: snapshot.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
    policyVersion: snapshot.policyVersion,
    policySource: 'catalog',
    catalogKey: snapshot.catalogKey,
    catalogLabel: snapshot.catalogLabel,
    clauseReference: snapshot.clauseReference,
    incompleteMessage: snapshot.incompleteMessage || null,
    entryRefundable: Boolean(snapshot.entryRefundable),
    signalRefundable: Boolean(snapshot.signalRefundable),
    otherRefundable: Boolean(snapshot.otherRefundable),
    contractualRetentionPercent:
      snapshot.contractualRetentionPercent == null
        ? null
        : Number(snapshot.contractualRetentionPercent),
    refundInstallmentCountRule:
      snapshot.refundInstallmentCountRule === 'PAID_REGULAR_INSTALLMENTS'
        ? 'PAID_REGULAR_INSTALLMENTS'
        : 'NOT_DEFINED',
    improvementsBlockFinalCalculation: Boolean(
      snapshot.improvementsBlockFinalCalculation,
    ),
    creditOtherUnitAllowed: Boolean(snapshot.creditOtherUnitAllowed),
    creditOtherUnitAutomatic: false,
  };
}

export function copyTerminationPolicyPersistFromSale(
  sale: Record<string, unknown> | null | undefined,
): Partial<TerminationPolicyPersistColumns> {
  if (!sale) return {};
  const parsed = parseTerminationPolicySnapshot(sale.termination_policy_snapshot);
  if (!parsed.ok) return {};
  const source = sale.termination_policy_source;
  const persistSource: TerminationPersistSource =
    source === 'backfill_inferred' ? 'backfill_inferred' : 'catalog';
  return {
    termination_policy_snapshot: parsed.snapshot,
    termination_policy_version:
      String(sale.termination_policy_version || parsed.snapshot.policyVersion),
    termination_policy_source: persistSource,
  };
}

export function resolveLegacyModelForBackfill(input: {
  saleContractModel?: unknown;
  contractContractModel?: unknown;
  projectContractModel?: unknown;
  companyContractModel?: unknown;
}): string | null {
  return (
    canonicalizeCatalogKey(input.saleContractModel) ||
    canonicalizeCatalogKey(input.contractContractModel) ||
    canonicalizeCatalogKey(input.projectContractModel) ||
    canonicalizeCatalogKey(input.companyContractModel)
  );
}

export function formatFrozenPolicyModelLine(policy: TerminationPolicy): string {
  if (policy.catalogKey === 'ARAGUAIA') return 'ARAGUAIA v1';
  return policy.catalogLabel || policy.catalogKey || 'Modelo não identificado';
}

export function buildTerminationPolicyOrigin(input: {
  kind: TerminationPolicyOrigin['kind'];
  persistSource?: TerminationPersistSource | 'missing' | null;
  policy: TerminationPolicy;
}): TerminationPolicyOrigin {
  const persistSource = input.persistSource || null;
  const frozen = input.kind === 'sale_snapshot' || input.kind === 'contract_snapshot';
  const inferred =
    persistSource === 'backfill_inferred' || input.kind === 'legacy_inferred';
  const badge = frozen
    ? inferred
      ? 'LEGADO INFERIDO'
      : 'CONGELADA'
    : input.kind === 'legacy_inferred'
      ? 'LEGADO INFERIDO'
      : null;

  let title = 'Política de encerramento';
  if (frozen && inferred) title = 'Política inferida para venda legada';
  else if (frozen) title = 'Política contratual congelada na venda';
  else if (input.kind === 'legacy_inferred') {
    title = 'Política inferida para venda legada';
  } else if (input.kind === 'missing') {
    title = 'Política de encerramento não identificada';
  }

  return {
    kind: input.kind,
    persistSource,
    frozen,
    badge,
    title,
    modelLine: formatFrozenPolicyModelLine(input.policy),
    clauseLine: input.policy.clauseReference || '—',
  };
}
