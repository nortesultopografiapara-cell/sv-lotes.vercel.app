/**
 * Modelos de comissão de corretor: PERCENT | FIXED | NONE.
 * Snapshot fica em broker_commissions; cadastro padrão em brokers.
 * Compatibilidade: registros sem mode = PERCENT.
 */

import {
  calculateCommissionAmount,
  readBrokerCommissionPercent,
  resolveSaleValueForCommission,
  withBrokerCommissionMonetaryFields,
} from '@/lib/brokerCommission';

export const BROKER_COMMISSION_MODES = ['PERCENT', 'FIXED', 'NONE'] as const;
export type BrokerCommissionMode = (typeof BROKER_COMMISSION_MODES)[number];

export type BrokerCommissionPlan = {
  mode: BrokerCommissionMode;
  percent: number;
  fixedAmount: number;
  calculationBase: number;
  amount: number;
};

export function normalizeBrokerCommissionMode(
  value?: string | null,
): BrokerCommissionMode {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  if (raw === 'FIXED' || raw === 'FIXO' || raw === 'VALOR_FIXO') return 'FIXED';
  if (raw === 'NONE' || raw === 'SEM' || raw === 'ZERO' || raw === 'NO') {
    return 'NONE';
  }
  // Legado / ausente → percentual
  return 'PERCENT';
}

export function readCommissionFixedAmount(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(Math.max(0, num) * 100) / 100;
}

/** Interpreta cadastro do corretor (legado sem mode = PERCENT). */
export function resolveBrokerDefaultCommissionPlan(broker: {
  commission_mode?: string | null;
  commission_percent?: number | string | null;
  commission_fixed_amount?: number | string | null;
} | null | undefined): BrokerCommissionPlan {
  const mode = normalizeBrokerCommissionMode(broker?.commission_mode);
  const percent = readBrokerCommissionPercent(broker?.commission_percent);
  const fixedAmount = readCommissionFixedAmount(broker?.commission_fixed_amount);

  if (mode === 'NONE') {
    return {
      mode: 'NONE',
      percent: 0,
      fixedAmount: 0,
      calculationBase: 0,
      amount: 0,
    };
  }

  if (mode === 'FIXED') {
    return {
      mode: 'FIXED',
      percent: 0,
      fixedAmount,
      calculationBase: 0,
      amount: fixedAmount,
    };
  }

  return {
    mode: 'PERCENT',
    percent,
    fixedAmount: 0,
    calculationBase: 0,
    amount: 0,
  };
}

/** Calcula plano final para uma venda (com base). */
export function calculateBrokerCommissionPlan(params: {
  mode?: string | null;
  percent?: number | string | null;
  fixedAmount?: number | string | null;
  saleValue: number;
}): BrokerCommissionPlan {
  const mode = normalizeBrokerCommissionMode(params.mode);
  const percent = readBrokerCommissionPercent(params.percent);
  const fixedAmount = readCommissionFixedAmount(params.fixedAmount);
  const base =
    Number.isFinite(params.saleValue) && params.saleValue > 0
      ? Math.round(params.saleValue * 100) / 100
      : 0;

  if (mode === 'NONE') {
    return {
      mode: 'NONE',
      percent: 0,
      fixedAmount: 0,
      calculationBase: 0,
      amount: 0,
    };
  }

  if (mode === 'FIXED') {
    return {
      mode: 'FIXED',
      percent: 0,
      fixedAmount,
      calculationBase: 0,
      amount: fixedAmount,
    };
  }

  const amount = calculateCommissionAmount(base, percent);
  return {
    mode: 'PERCENT',
    percent,
    fixedAmount: 0,
    calculationBase: base,
    amount,
  };
}

export function shouldCreatePendingCommissionFromPlan(
  plan: BrokerCommissionPlan,
): boolean {
  return plan.mode !== 'NONE' && plan.amount > 0;
}

export function brokerCommissionPlanLabel(plan: BrokerCommissionPlan): string {
  if (plan.mode === 'NONE') return 'Sem comissão';
  if (plan.mode === 'FIXED') {
    return `Valor fixo por venda`;
  }
  return `${plan.percent}% sobre a venda`;
}

export function formatBrokerCommissionPreview(plan: BrokerCommissionPlan): {
  modelLabel: string;
  amountLabel: string;
  detail: string;
} {
  const amount = plan.amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  if (plan.mode === 'NONE') {
    return {
      modelLabel: 'Sem comissão',
      amountLabel: amount,
      detail: 'Nenhuma comissão pendente será gerada.',
    };
  }
  if (plan.mode === 'FIXED') {
    return {
      modelLabel: 'Valor fixo por venda',
      amountLabel: amount,
      detail: `Comissão desta venda: ${amount}`,
    };
  }
  const base = plan.calculationBase.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return {
    modelLabel: `${plan.percent}% sobre ${base}`,
    amountLabel: amount,
    detail: `Comissão desta venda: ${amount}`,
  };
}

/** Patch de colunas novas + amount/percent para broker_commissions. */
export function buildCommissionSnapshotFields(plan: BrokerCommissionPlan) {
  return {
    ...withBrokerCommissionMonetaryFields(plan.amount),
    commission_percent: plan.mode === 'PERCENT' ? plan.percent : 0,
    commission_mode: plan.mode,
    commission_fixed_amount: plan.mode === 'FIXED' ? plan.fixedAmount : null,
    calculation_base: plan.mode === 'PERCENT' ? plan.calculationBase : null,
  };
}

/** Payload seguro para brokers.update/insert. */
export function buildBrokerDefaultCommissionFields(params: {
  mode: BrokerCommissionMode;
  percent?: number | string | null;
  fixedAmount?: number | string | null;
}) {
  const mode = normalizeBrokerCommissionMode(params.mode);
  const percent = readBrokerCommissionPercent(params.percent);
  const fixedAmount = readCommissionFixedAmount(params.fixedAmount);

  if (mode === 'FIXED') {
    return {
      commission_mode: 'FIXED' as const,
      commission_percent: 0,
      commission_fixed_amount: fixedAmount,
    };
  }
  if (mode === 'NONE') {
    return {
      commission_mode: 'NONE' as const,
      commission_percent: 0,
      commission_fixed_amount: null,
    };
  }
  return {
    commission_mode: 'PERCENT' as const,
    commission_percent: percent,
    commission_fixed_amount: null,
  };
}

export function inferModeFromCommissionRow(row: {
  commission_mode?: string | null;
  commission_percent?: number | string | null;
  commission_fixed_amount?: number | string | null;
  amount?: number | string | null;
}): BrokerCommissionMode {
  if (row.commission_mode) return normalizeBrokerCommissionMode(row.commission_mode);
  const fixed = readCommissionFixedAmount(row.commission_fixed_amount);
  if (fixed > 0) return 'FIXED';
  const percent = readBrokerCommissionPercent(row.commission_percent);
  if (percent > 0) return 'PERCENT';
  const amount = Number(row.amount);
  if (Number.isFinite(amount) && amount > 0 && percent <= 0) {
    // legado sem % mas com amount → trata como FIXED para exibição
    return 'FIXED';
  }
  return percent <= 0 && (!Number.isFinite(amount) || amount <= 0)
    ? 'NONE'
    : 'PERCENT';
}

export function resolveSaleValueForPlan(
  sale: Record<string, unknown> | null | undefined,
): number {
  return resolveSaleValueForCommission(sale);
}

/**
 * Resolve plano da venda: padrão do corretor OU override manual do formulário.
 * useBrokerDefault !== false → herda cadastro do corretor.
 */
export function resolveSaleCommissionPlan(params: {
  broker?: {
    commission_mode?: string | null;
    commission_percent?: number | string | null;
    commission_fixed_amount?: number | string | null;
  } | null;
  useBrokerDefault?: boolean | null;
  saleCommissionMode?: string | null;
  saleCommissionPercent?: number | string | null;
  saleCommissionFixedAmount?: number | string | null;
  saleValue: number;
}): BrokerCommissionPlan {
  const useDefault = params.useBrokerDefault !== false;
  if (useDefault) {
    const defaults = resolveBrokerDefaultCommissionPlan(params.broker);
    return calculateBrokerCommissionPlan({
      mode: defaults.mode,
      percent: defaults.percent,
      fixedAmount: defaults.fixedAmount,
      saleValue: params.saleValue,
    });
  }
  return calculateBrokerCommissionPlan({
    mode: params.saleCommissionMode,
    percent: params.saleCommissionPercent,
    fixedAmount: params.saleCommissionFixedAmount,
    saleValue: params.saleValue,
  });
}

export function commissionModeLabel(mode: BrokerCommissionMode): string {
  if (mode === 'FIXED') return 'Valor fixo';
  if (mode === 'NONE') return 'Sem comissão';
  return 'Percentual';
}
