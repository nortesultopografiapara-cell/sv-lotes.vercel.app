/**
 * Cálculo determinístico do acerto de encerramento.
 * Opera sobre a política já resolvida — sem ramificar pelo nome do modelo.
 * Sem queries e sem side effects.
 */

import {
  INCOMPLETE_POLICY_MESSAGE,
  MISSING_POLICY_MESSAGE,
} from '@/lib/contract-termination/policyCatalog';
import {
  classifyTerminationReceipts,
  countPaidByKind,
  sumPaidByKind,
} from '@/lib/contract-termination/receipts';
import type {
  CalculateTerminationSettlementInput,
  SettlementDestination,
  TerminationSettlement,
} from '@/lib/contract-termination/types';

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptySettlement(
  input: CalculateTerminationSettlementInput,
  status: TerminationSettlement['calculationStatus'],
  warnings: string[],
): TerminationSettlement {
  const policy = input.policy;
  return {
    totalPaid: 0,
    entryPaid: 0,
    signalPaid: 0,
    installmentPaid: 0,
    otherPaid: 0,
    paidInstallmentCount: 0,
    nonRefundableAmount: 0,
    refundableBase: 0,
    contractualRetentionPercent: null,
    contractualRetentionAmount: 0,
    contractualRefundAmount: 0,
    agreedRefundAmount: null,
    refundInstallmentCount: null,
    calculationStatus: status,
    warnings,
    policyVersion: policy.policyVersion,
    policySource: policy.policySource,
    clauseReference: policy.clauseReference,
    catalogKey: policy.catalogKey,
    destination: input.destination,
    creditOtherUnitAutomatic: false,
    exceptionApplied: false,
    isFinal: false,
  };
}

function resolveDestination(
  requested: SettlementDestination,
  allowed: boolean,
  warnings: string[],
): SettlementDestination {
  if (requested !== 'CREDIT_OTHER_UNIT') return 'REFUND_CUSTOMER';
  if (!allowed) {
    warnings.push(
      'Crédito em outra unidade não é permitido por esta política; destino tratado como restituição ao cliente.',
    );
    return 'REFUND_CUSTOMER';
  }
  warnings.push(
    'Simulação — nenhuma transferência financeira será realizada nesta etapa.',
  );
  return 'CREDIT_OTHER_UNIT';
}

function applyException(
  contractualRefundAmount: number,
  override: CalculateTerminationSettlementInput['exceptionOverride'],
  refundableBase: number,
  warnings: string[],
): { agreedRefundAmount: number | null; exceptionApplied: boolean } {
  if (!override?.enabled) {
    return { agreedRefundAmount: contractualRefundAmount, exceptionApplied: false };
  }

  const justification = String(override.justification || '').trim();
  if (!justification) {
    warnings.push(
      'Condição excepcional ativada sem justificativa; o valor acordado não foi aplicado.',
    );
    return { agreedRefundAmount: contractualRefundAmount, exceptionApplied: false };
  }

  if (override.refundAmount != null && Number.isFinite(Number(override.refundAmount))) {
    return {
      agreedRefundAmount: roundMoney(Number(override.refundAmount)),
      exceptionApplied: true,
    };
  }

  if (
    override.retentionPercent != null &&
    Number.isFinite(Number(override.retentionPercent))
  ) {
    const pct = Number(override.retentionPercent);
    const retained = roundMoney(refundableBase * (pct / 100));
    return {
      agreedRefundAmount: roundMoney(Math.max(0, refundableBase - retained)),
      exceptionApplied: true,
    };
  }

  warnings.push(
    'Condição excepcional sem valor ou percentual acordado; mantido apenas o cálculo contratual.',
  );
  return { agreedRefundAmount: contractualRefundAmount, exceptionApplied: false };
}

export function calculateTerminationSettlement(
  input: CalculateTerminationSettlementInput,
): TerminationSettlement {
  const policy = input.policy;
  const warnings: string[] = [];

  if (policy.policySource === 'missing') {
    return emptySettlement(input, 'MISSING_POLICY', [
      policy.incompleteMessage || MISSING_POLICY_MESSAGE,
    ]);
  }

  if (policy.status !== 'COMPLETE' || policy.contractualRetentionPercent == null) {
    const classified = classifyTerminationReceipts(input.receipts);
    const entryPaid = roundMoney(sumPaidByKind(classified, 'entry'));
    const signalPaid = roundMoney(sumPaidByKind(classified, 'signal'));
    const installmentPaid = roundMoney(sumPaidByKind(classified, 'installment'));
    const otherPaid = roundMoney(sumPaidByKind(classified, 'other'));
    const totalPaid = roundMoney(entryPaid + signalPaid + installmentPaid + otherPaid);
    return {
      ...emptySettlement(input, 'INCOMPLETE', [
        policy.incompleteMessage || INCOMPLETE_POLICY_MESSAGE,
      ]),
      totalPaid,
      entryPaid,
      signalPaid,
      installmentPaid,
      otherPaid,
      paidInstallmentCount: countPaidByKind(classified, 'installment'),
      contractualRetentionPercent: null,
    };
  }

  const classified = classifyTerminationReceipts(input.receipts);
  const entryPaid = roundMoney(sumPaidByKind(classified, 'entry'));
  const signalPaid = roundMoney(sumPaidByKind(classified, 'signal'));
  const installmentPaid = roundMoney(sumPaidByKind(classified, 'installment'));
  const otherPaid = roundMoney(sumPaidByKind(classified, 'other'));
  const totalPaid = roundMoney(entryPaid + signalPaid + installmentPaid + otherPaid);
  const paidInstallmentCount = countPaidByKind(classified, 'installment');

  const nonRefundableAmount = roundMoney(
    (policy.entryRefundable ? 0 : entryPaid) +
      (policy.signalRefundable ? 0 : signalPaid) +
      (policy.otherRefundable ? 0 : otherPaid),
  );

  const refundableBase = roundMoney(
    (policy.entryRefundable ? entryPaid : 0) +
      (policy.signalRefundable ? signalPaid : 0) +
      installmentPaid +
      (policy.otherRefundable ? otherPaid : 0),
  );

  const retentionPercent = policy.contractualRetentionPercent;
  const contractualRetentionAmount = roundMoney(
    refundableBase * (retentionPercent / 100),
  );
  const contractualRefundAmount = roundMoney(
    Math.max(0, refundableBase - contractualRetentionAmount),
  );

  const destination = resolveDestination(
    input.destination,
    policy.creditOtherUnitAllowed,
    warnings,
  );

  const waitingImprovements =
    Boolean(input.hasImprovements) && policy.improvementsBlockFinalCalculation;

  if (waitingImprovements) {
    warnings.push(
      'O contrato exige avaliação técnica das benfeitorias antes do acerto definitivo.',
    );
  }

  const { agreedRefundAmount, exceptionApplied } = waitingImprovements
    ? { agreedRefundAmount: null as number | null, exceptionApplied: false }
    : applyException(
        contractualRefundAmount,
        input.exceptionOverride,
        refundableBase,
        warnings,
      );

  if (waitingImprovements && input.exceptionOverride?.enabled) {
    warnings.push(
      'Condição excepcional não fecha o cálculo enquanto a avaliação de benfeitorias estiver pendente.',
    );
  }

  const refundInstallmentCount =
    policy.refundInstallmentCountRule === 'PAID_REGULAR_INSTALLMENTS'
      ? paidInstallmentCount
      : null;

  return {
    totalPaid,
    entryPaid,
    signalPaid,
    installmentPaid,
    otherPaid,
    paidInstallmentCount,
    nonRefundableAmount,
    refundableBase,
    contractualRetentionPercent: retentionPercent,
    contractualRetentionAmount,
    contractualRefundAmount,
    agreedRefundAmount,
    refundInstallmentCount,
    calculationStatus: waitingImprovements
      ? 'WAITING_IMPROVEMENT_APPRAISAL'
      : 'CALCULATED',
    warnings,
    policyVersion: policy.policyVersion,
    policySource: policy.policySource,
    clauseReference: policy.clauseReference,
    catalogKey: policy.catalogKey,
    destination,
    creditOtherUnitAutomatic: false,
    exceptionApplied,
    isFinal: !waitingImprovements && !exceptionApplied,
  };
}
