'use client';

import type { ReactNode } from 'react';
import type { CorporateFinanceSemanticTone } from '@/lib/master/corporateFinance/semantic';
import styles from './corporateFinanceSemantic.module.css';

const TONE_CLASS: Record<CorporateFinanceSemanticTone, string> = {
  income: styles.toneIncome,
  received: styles.toneReceived,
  expense: styles.toneExpense,
  paid: styles.tonePaid,
  open: styles.toneOpen,
  partial: styles.tonePartial,
  overdue: styles.toneOverdue,
  dueMonth: styles.toneDueMonth,
  transfer: styles.toneTransfer,
  balance: styles.toneBalance,
  balancePositive: styles.toneBalancePositive,
  balanceNegative: styles.toneBalanceNegative,
  canceled: styles.toneCanceled,
  archived: styles.toneArchived,
  alert: styles.toneAlert,
  neutral: styles.toneNeutral,
  resultPositive: styles.toneResultPositive,
  resultNegative: styles.toneResultNegative,
};

const VALUE_CLASS: Record<CorporateFinanceSemanticTone, string> = {
  income: styles.valueIncome,
  received: styles.valueReceived,
  expense: styles.valueExpense,
  paid: styles.valuePaid,
  open: styles.valueOpen,
  partial: styles.valuePartial,
  overdue: styles.valueOverdue,
  dueMonth: styles.valueDueMonth,
  transfer: styles.valueTransfer,
  balance: styles.valueBalance,
  balancePositive: styles.valueBalancePositive,
  balanceNegative: styles.valueBalanceNegative,
  canceled: styles.valueCanceled,
  archived: styles.valueArchived,
  alert: styles.valueAlert,
  neutral: styles.valueNeutral,
  resultPositive: styles.valueResultPositive,
  resultNegative: styles.valueResultNegative,
};

export function CorporateFinanceSemanticKpi(props: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone: CorporateFinanceSemanticTone;
}) {
  return (
    <div className={`${styles.semanticKpi} ${TONE_CLASS[props.tone]}`}>
      <p className={styles.semanticKpiLabel}>{props.label}</p>
      <p className={`${styles.semanticKpiValue} ${VALUE_CLASS[props.tone]}`}>{props.value}</p>
      {props.hint ? <p className={styles.semanticKpiHint}>{props.hint}</p> : null}
    </div>
  );
}

export function CorporateFinanceSemanticBadge(props: {
  children: ReactNode;
  tone: CorporateFinanceSemanticTone;
}) {
  return (
    <span className={`${styles.semanticBadge} ${TONE_CLASS[props.tone]}`}>{props.children}</span>
  );
}

export function corporateFinanceValueClass(tone: CorporateFinanceSemanticTone): string {
  return VALUE_CLASS[tone];
}

export function corporateFinanceToneClass(tone: CorporateFinanceSemanticTone): string {
  return TONE_CLASS[tone];
}
