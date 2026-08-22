/**
 * Formatação / apresentação do acerto. Sem cálculo e sem queries.
 */

import { INCOMPLETE_POLICY_MESSAGE } from '@/lib/contract-termination/policyCatalog';
import type {
  TerminationPolicy,
  TerminationSettlement,
} from '@/lib/contract-termination/types';

export function formatRetentionPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(Number(percent))) return '—';
  const n = Number(percent);
  const label = Number.isInteger(n) ? String(n) : String(n);
  return `${label}%`;
}

export function formatAppliedRuleLabel(
  policy: TerminationPolicy,
  settlement: TerminationSettlement,
): string {
  if (policy.policySource === 'missing') {
    return (
      policy.incompleteMessage ||
      'Não foi possível identificar a política de restituição deste contrato.'
    );
  }
  if (policy.status !== 'COMPLETE' || settlement.contractualRetentionPercent == null) {
    return policy.incompleteMessage || INCOMPLETE_POLICY_MESSAGE;
  }

  const parts: string[] = [];
  if (!policy.entryRefundable) {
    parts.push('Entrada não reembolsável, excluída da base da restituição');
  }
  parts.push(
    `Retenção contratual de ${formatRetentionPercent(settlement.contractualRetentionPercent)} sobre a base restituível`,
  );
  if (policy.refundInstallmentCountRule === 'PAID_REGULAR_INSTALLMENTS') {
    parts.push(
      'Quantidade de parcelas de restituição igual às parcelas ordinárias quitadas (sem entrada/sinal)',
    );
  }
  if (policy.creditOtherUnitAllowed) {
    parts.push('Crédito em outra unidade somente se escolhido pelo operador');
  }
  return `${parts.join('. ')}.`;
}

export function formatPolicyOrigin(policy: TerminationPolicy): string {
  if (policy.policySource === 'missing') return 'Política ausente';
  return 'Catálogo homologado';
}
