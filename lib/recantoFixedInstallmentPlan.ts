/**
 * Parcelamento do lote RECANTO_PRIMAVERA — modos BY_COUNT (média) e FIXED_AMOUNT (+ residual).
 * Toda aritmética monetária em centavos inteiros. Não afeta PADRAO/Meneses.
 */

export const RECANTO_INSTALLMENT_DEFINITION_MODES = ['BY_COUNT', 'FIXED_AMOUNT'] as const;

export type RecantoInstallmentDefinitionMode =
  (typeof RECANTO_INSTALLMENT_DEFINITION_MODES)[number];

export function toMoneyCents(value: number): number {
  return Math.round(Math.max(0, Number(value) || 0) * 100);
}

export function fromMoneyCents(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

export function normalizeRecantoInstallmentDefinitionMode(
  value?: string | null,
): RecantoInstallmentDefinitionMode {
  const mode = String(value || '')
    .trim()
    .toUpperCase();
  if (mode === 'FIXED_AMOUNT') return 'FIXED_AMOUNT';
  return 'BY_COUNT';
}

export type RecantoLotInstallmentPlanInput = {
  lotValue: number;
  regularCount: number;
  mode?: string | null;
  /** Valor fixo da parcela regular (modo FIXED_AMOUNT). */
  regularAmount?: number | null;
  /** Gerar parcela final com residual positivo. */
  generateResidual?: boolean;
  /** Incompatível com FIXED_AMOUNT. */
  useBalloon?: boolean;
};

export type RecantoLotInstallmentPlan = {
  mode: RecantoInstallmentDefinitionMode;
  lotValue: number;
  regularCount: number;
  regularAmount: number;
  regularSubtotal: number;
  residualAmount: number;
  hasResidual: boolean;
  /** Quantidade de vencimentos mensais do lote (regulares + residual). */
  totalDueDates: number;
  /** Bases do lote (sem complemento do sinal): regulares + residual opcional. */
  baseAmounts: number[];
  alerts: string[];
  errors: string[];
  ok: boolean;
};

function money(value: number): number {
  return fromMoneyCents(toMoneyCents(value));
}

/**
 * Resolve plano de parcelamento do lote (sem sinal).
 * BY_COUNT: divide o lote em N parcelas com ajuste de centavos na última (compatível com splitInstallmentAmounts).
 * FIXED_AMOUNT: N × valor fixo + residual opcional.
 */
export function resolveRecantoLotInstallmentPlan(
  input: RecantoLotInstallmentPlanInput,
): RecantoLotInstallmentPlan {
  const mode = normalizeRecantoInstallmentDefinitionMode(input.mode);
  const lotCents = toMoneyCents(input.lotValue);
  const lotValue = fromMoneyCents(lotCents);
  const regularCount = Math.max(0, Math.floor(Number(input.regularCount) || 0));
  const alerts: string[] = [];
  const errors: string[] = [];

  if (regularCount <= 0) {
    return {
      mode,
      lotValue,
      regularCount: 0,
      regularAmount: 0,
      regularSubtotal: 0,
      residualAmount: 0,
      hasResidual: false,
      totalDueDates: 0,
      baseAmounts: [],
      alerts,
      errors: ['Informe a quantidade de parcelas regulares.'],
      ok: false,
    };
  }

  if (input.useBalloon && mode === 'FIXED_AMOUNT') {
    errors.push(
      'O modo “Fixar valor da parcela” não pode ser combinado com parcelas balão. Desative o balão ou use o cálculo pela quantidade.',
    );
  }

  if (mode === 'BY_COUNT') {
    // Mesma lógica de splitInstallmentAmounts, em centavos.
    const baseUnit = Math.round(lotCents / regularCount);
    const amountsCents: number[] = [];
    let accumulated = 0;
    for (let i = 0; i < regularCount; i++) {
      const isLast = i === regularCount - 1;
      const current = isLast ? lotCents - accumulated : baseUnit;
      amountsCents.push(current);
      accumulated += current;
    }
    const baseAmounts = amountsCents.map(fromMoneyCents);
    const regularAmount = baseAmounts[0] ?? 0;
    const regularSubtotal = fromMoneyCents(amountsCents.reduce((s, c) => s + c, 0));
    return {
      mode,
      lotValue,
      regularCount,
      regularAmount,
      regularSubtotal,
      residualAmount: 0,
      hasResidual: false,
      totalDueDates: regularCount,
      baseAmounts,
      alerts,
      errors,
      ok: errors.length === 0 && Math.abs(regularSubtotal - lotValue) < 0.001,
    };
  }

  // FIXED_AMOUNT
  const regularAmountCents = toMoneyCents(Number(input.regularAmount) || 0);
  if (regularAmountCents <= 0) {
    errors.push('Informe o valor fixo da parcela regular.');
  }

  const regularSubtotalCents = regularAmountCents * regularCount;
  const residualCents = lotCents - regularSubtotalCents;
  const generateResidual = Boolean(input.generateResidual);

  if (residualCents < 0) {
    errors.push(
      'O valor fixo multiplicado pela quantidade ultrapassa o valor do lote. Reduza o valor ou a quantidade.',
    );
  }

  if (residualCents > 0 && !generateResidual) {
    errors.push(
      'Há saldo residual. Marque “Gerar parcela final com o saldo residual” para fechar o valor do lote, ou ajuste quantidade/valor.',
    );
  }

  if (residualCents > 0 && generateResidual && residualCents >= regularAmountCents) {
    alerts.push(
      'O residual é igual ou maior que a parcela fixa. Confira se a quantidade e o valor estão corretos.',
    );
  }

  if (regularSubtotalCents > lotCents) {
    alerts.push('O subtotal das parcelas regulares ultrapassa o valor do lote.');
  }

  const hasResidual = residualCents > 0 && generateResidual && residualCents >= 0;
  const regularAmount = fromMoneyCents(regularAmountCents);
  const regularSubtotal = fromMoneyCents(regularSubtotalCents);
  const residualAmount = hasResidual ? fromMoneyCents(residualCents) : 0;

  const baseAmounts: number[] = Array.from({ length: regularCount }, () => regularAmount);
  if (hasResidual) baseAmounts.push(residualAmount);

  const sumBases = fromMoneyCents(
    baseAmounts.reduce((s, v) => s + toMoneyCents(v), 0),
  );
  if (errors.length === 0 && Math.abs(sumBases - lotValue) > 0.001) {
    errors.push(
      `A soma das parcelas do lote (${sumBases.toFixed(2)}) não fecha com o valor do lote (${lotValue.toFixed(2)}).`,
    );
  }

  return {
    mode,
    lotValue,
    regularCount,
    regularAmount,
    regularSubtotal,
    residualAmount,
    hasResidual,
    totalDueDates: regularCount + (hasResidual ? 1 : 0),
    baseAmounts,
    alerts,
    errors,
    ok: errors.length === 0,
  };
}

export function validateRecantoLotInstallmentPlan(
  input: RecantoLotInstallmentPlanInput,
): { valid: true; plan: RecantoLotInstallmentPlan } | { valid: false; message: string; plan: RecantoLotInstallmentPlan } {
  const plan = resolveRecantoLotInstallmentPlan(input);
  if (!plan.ok) {
    return {
      valid: false,
      message: plan.errors[0] || 'Parcelamento do lote inválido.',
      plan,
    };
  }
  return { valid: true, plan };
}

export function formatRecantoLotInstallmentPreview(plan: RecantoLotInstallmentPlan): {
  regularLine: string;
  residualLine: string | null;
  totalLine: string;
  dueDatesLine: string;
} {
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  return {
    regularLine: `Parcelas regulares: ${plan.regularCount} × ${fmt(plan.regularAmount)}`,
    residualLine: plan.hasResidual
      ? `Parcela final de ajuste: ${fmt(plan.residualAmount)}`
      : null,
    totalLine: `Total financiado: ${fmt(plan.lotValue)}`,
    dueDatesLine: `Total de vencimentos: ${plan.totalDueDates}`,
  };
}

/** Texto contratual do parcelamento do imóvel (sem sinal). */
export function buildRecantoLotParcelamentoClauseText(plan: RecantoLotInstallmentPlan): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  if (plan.regularCount <= 0) return '';
  if (plan.hasResidual) {
    return `${plan.regularCount} parcelas mensais de ${fmt(plan.regularAmount)} e uma parcela final de ajuste no valor de ${fmt(plan.residualAmount)}.`;
  }
  if (plan.mode === 'FIXED_AMOUNT') {
    return `${plan.regularCount} parcelas mensais de ${fmt(plan.regularAmount)}.`;
  }
  return `${plan.regularCount} parcelas mensais de ${fmt(plan.regularAmount)} (valores com eventual ajuste de centavos na última parcela).`;
}

/** Snapshot para colunas sales.* do parcelamento Recanto (create/edit). */
export function buildRecantoInstallmentSalesSnapshot(input: {
  contractModel?: string | null;
  mode?: string | null;
  lotValue: number;
  regularCount: number;
  regularAmount?: number | null;
  generateResidual?: boolean;
  useBalloon?: boolean;
}): {
  installment_definition_mode: RecantoInstallmentDefinitionMode | null;
  regular_installment_amount: number | null;
  has_residual_installment: boolean;
  residual_installment_amount: number | null;
  plan: RecantoLotInstallmentPlan | null;
  error: string | null;
} {
  const model = String(input.contractModel || '')
    .trim()
    .toUpperCase();
  if (model !== 'RECANTO_PRIMAVERA') {
    return {
      installment_definition_mode: null,
      regular_installment_amount: null,
      has_residual_installment: false,
      residual_installment_amount: null,
      plan: null,
      error: null,
    };
  }

  const mode = normalizeRecantoInstallmentDefinitionMode(input.mode);
  if (mode === 'BY_COUNT') {
    return {
      installment_definition_mode: 'BY_COUNT',
      regular_installment_amount: null,
      has_residual_installment: false,
      residual_installment_amount: null,
      plan: resolveRecantoLotInstallmentPlan({
        lotValue: input.lotValue,
        regularCount: input.regularCount,
        mode: 'BY_COUNT',
      }),
      error: null,
    };
  }

  const plan = resolveRecantoLotInstallmentPlan({
    lotValue: input.lotValue,
    regularCount: input.regularCount,
    mode: 'FIXED_AMOUNT',
    regularAmount: input.regularAmount,
    generateResidual: input.generateResidual !== false,
    useBalloon: Boolean(input.useBalloon),
  });

  if (!plan.ok) {
    return {
      installment_definition_mode: 'FIXED_AMOUNT',
      regular_installment_amount: plan.regularAmount || null,
      has_residual_installment: false,
      residual_installment_amount: null,
      plan,
      error: plan.errors[0] || 'Parcelamento fixo inválido.',
    };
  }

  return {
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: plan.regularAmount,
    has_residual_installment: plan.hasResidual,
    residual_installment_amount: plan.hasResidual ? plan.residualAmount : null,
    plan,
    error: null,
  };
}
