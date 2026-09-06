/**
 * Pré-condições da operação Inadimplência.
 * Aditivo: não altera Desistência/Distrato nem o motor de settlement.
 */

import {
  INCOMPLETE_POLICY_MESSAGE,
  MISSING_POLICY_MESSAGE,
} from '@/lib/contract-termination/policyCatalog';
import {
  buildReleaseReceiptsSnapshot,
  type ReleaseReceiptSnapshotRow,
} from '@/lib/finance/saleReleaseSettlement';

export const INADIMPLENCIA_NO_DEFAULT_MESSAGE =
  'Esta venda não possui parcelas vencidas ou condição de inadimplência suficiente para este encerramento.';

export type InadimplenciaDefaultSnapshot = {
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  paidAmount: number;
  markedDefault: boolean;
};

export function isMarkedInadimplenteStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st.includes('inadimpl');
}

export function buildInadimplenciaDefaultSnapshot(
  receipts: ReleaseReceiptSnapshotRow[],
  saleStatus?: string | null,
): InadimplenciaDefaultSnapshot {
  const snap = buildReleaseReceiptsSnapshot(receipts);
  return {
    overdueCount: snap.overdue.count,
    overdueAmount: snap.overdue.amount,
    paidCount: snap.paid.count,
    paidAmount: snap.paid.amount,
    markedDefault: isMarkedInadimplenteStatus(saleStatus),
  };
}

export function hasEffectiveInadimplencia(
  receipts: ReleaseReceiptSnapshotRow[],
  saleStatus?: string | null,
): boolean {
  const snap = buildInadimplenciaDefaultSnapshot(receipts, saleStatus);
  return snap.overdueCount > 0 || snap.markedDefault;
}

export function evaluateInadimplenciaPolicy(calculationStatus?: string | null): {
  ok: boolean;
  error: string | null;
  code: 'MISSING_POLICY' | 'INCOMPLETE_POLICY' | null;
} {
  const status = String(calculationStatus || '')
    .trim()
    .toUpperCase();
  if (status === 'MISSING_POLICY') {
    return { ok: false, error: MISSING_POLICY_MESSAGE, code: 'MISSING_POLICY' };
  }
  if (status === 'INCOMPLETE') {
    return { ok: false, error: INCOMPLETE_POLICY_MESSAGE, code: 'INCOMPLETE_POLICY' };
  }
  return { ok: true, error: null, code: null };
}

export function evaluateInadimplenciaPreconditions(input: {
  receipts: ReleaseReceiptSnapshotRow[];
  saleStatus?: string | null;
  calculationStatus?: string | null;
}):
  | { ok: true; snapshot: InadimplenciaDefaultSnapshot }
  | { ok: false; error: string; code: string; snapshot: InadimplenciaDefaultSnapshot } {
  const snapshot = buildInadimplenciaDefaultSnapshot(input.receipts, input.saleStatus);
  if (!hasEffectiveInadimplencia(input.receipts, input.saleStatus)) {
    return {
      ok: false,
      error: INADIMPLENCIA_NO_DEFAULT_MESSAGE,
      code: 'INADIMPLENCIA_NOT_DEFAULT',
      snapshot,
    };
  }
  const policy = evaluateInadimplenciaPolicy(input.calculationStatus);
  if (!policy.ok) {
    return {
      ok: false,
      error: policy.error || MISSING_POLICY_MESSAGE,
      code: policy.code || 'MISSING_POLICY',
      snapshot,
    };
  }
  return { ok: true, snapshot };
}
