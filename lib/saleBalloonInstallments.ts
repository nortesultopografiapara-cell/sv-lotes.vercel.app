/**
 * Parcelas balão — camada opcional sobre o parcelamento existente.
 * NÃO altera saleInstallmentCalc: só compõe valores quando habilitado.
 *
 * Regra: principal − Σ balões = saldo parcelável → divide normalmente →
 * depois soma o valor do balão apenas nas parcelas configuradas.
 */

import { splitInstallmentAmounts } from '@/lib/saleInstallmentCalc';
import { formatCurrencyBRL, parseCurrencyBRLNumber } from '@/lib/currencyBrl';

export type SaleBalloonMode = 'MANUAL' | 'FINAL' | 'RECURRENT';

export type SaleBalloonInstallmentInput = {
  installmentNumber: number;
  additionalAmount: number;
  dueDate?: string | null;
};

export type SaleBalloonPlan = {
  enabled: boolean;
  mode: SaleBalloonMode;
  items: SaleBalloonInstallmentInput[];
  /** Metadados do formulário (edição / regeneração de UI). */
  config?: SaleBalloonFormConfig | null;
};

export type SaleBalloonFormConfig = {
  mode: SaleBalloonMode;
  /** MANUAL */
  manualCount?: number;
  manualRows?: Array<{
    installmentNumber: string;
    additionalAmount: string;
    dueDate?: string;
  }>;
  /** FINAL */
  finalUseLast?: boolean;
  finalAmountMode?: 'VALUE' | 'PERCENT';
  finalValue?: string;
  finalPercent?: string;
  /** RECURRENT */
  recurrentEnabled?: boolean;
  recurrentIntervalMonths?: 6 | 12 | 18 | 24;
  recurrentQuantity?: string;
  recurrentValue?: string;
};

export type BalloonAmountComposition = {
  baseAmount: number;
  balloonAddonAmount: number;
  amount: number;
  dueDateOverride?: string | null;
};

export type BalloonFinancePreview = {
  saleTotal: number;
  entryAmount: number;
  balloonTotal: number;
  parcelableBalance: number;
  installmentsCount: number;
  baseInstallmentValue: number;
  balloonRows: Array<{
    installmentNumber: number;
    baseAmount: number;
    balloonAddonAmount: number;
    finalAmount: number;
    dueDateOverride?: string | null;
  }>;
  compositions: BalloonAmountComposition[];
  installmentsSum: number;
  grandTotal: number;
  totalsMatch: boolean;
  diffCents: number;
};

/** Centavos inteiros — evita float em validações monetárias. */
export function toCents(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

function money(n: number): number {
  return fromCents(toCents(n));
}

export function emptyBalloonFormConfig(): SaleBalloonFormConfig {
  return {
    mode: 'MANUAL',
    manualCount: 1,
    manualRows: [{ installmentNumber: '', additionalAmount: '', dueDate: '' }],
    finalUseLast: false,
    finalAmountMode: 'VALUE',
    finalValue: '',
    finalPercent: '',
    recurrentEnabled: false,
    recurrentIntervalMonths: 12,
    recurrentQuantity: '',
    recurrentValue: '',
  };
}

function isValidIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Resolve plano a partir do formulário. Sem checkbox → enabled false (no-op). */
export function resolveSaleBalloonPlan(params: {
  useBalloon: boolean;
  installmentsCount: number;
  contractValue: number;
  config?: SaleBalloonFormConfig | null;
}): SaleBalloonPlan {
  if (!params.useBalloon) {
    return { enabled: false, mode: 'MANUAL', items: [], config: null };
  }

  const config = params.config || emptyBalloonFormConfig();
  const N = Math.max(0, Number(params.installmentsCount) || 0);
  const contractValue = Math.max(0, Number(params.contractValue) || 0);
  const mode = config.mode || 'MANUAL';

  if (mode === 'FINAL' && config.finalUseLast) {
    if (N <= 0) {
      return { enabled: true, mode, items: [], config };
    }
    let additional = 0;
    if (config.finalAmountMode === 'PERCENT') {
      const pct = Number(String(config.finalPercent || '').replace(',', '.')) || 0;
      additional = money((contractValue * pct) / 100);
    } else {
      additional = money(parseCurrencyBRLNumber(String(config.finalValue || '')));
    }
    if (additional <= 0) {
      return { enabled: true, mode, items: [], config };
    }
    return {
      enabled: true,
      mode,
      items: [{ installmentNumber: N, additionalAmount: additional }],
      config,
    };
  }

  if (mode === 'RECURRENT' && config.recurrentEnabled) {
    const interval = Number(config.recurrentIntervalMonths) || 12;
    const qty = Math.max(0, Math.floor(Number(config.recurrentQuantity) || 0));
    const value = money(parseCurrencyBRLNumber(String(config.recurrentValue || '')));
    if (qty <= 0 || value <= 0 || interval <= 0 || N <= 0) {
      return { enabled: true, mode, items: [], config };
    }
    const items: SaleBalloonInstallmentInput[] = [];
    for (let i = 1; i <= qty; i++) {
      const num = interval * i;
      if (num > N) break;
      items.push({ installmentNumber: num, additionalAmount: value });
    }
    return { enabled: true, mode, items, config };
  }

  // MANUAL (default) — itens válidos únicos; duplicatas/invalidos são bloqueados na validação.
  const rows = config.manualRows || [];
  const items: SaleBalloonInstallmentInput[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const num = Math.floor(Number(row.installmentNumber) || 0);
    const additional = money(parseCurrencyBRLNumber(String(row.additionalAmount || '')));
    if (num < 1 || additional <= 0) continue;
    if (N > 0 && num > N) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    const due = String(row.dueDate || '').trim();
    items.push({
      installmentNumber: num,
      additionalAmount: additional,
      dueDate: due || null,
    });
  }

  return {
    enabled: true,
    mode: 'MANUAL',
    items: items.sort((a, b) => a.installmentNumber - b.installmentNumber),
    config,
  };
}

export type ValidateBalloonParams = {
  plan: SaleBalloonPlan;
  paymentType: string;
  installmentsCount: number;
  /** Principal = saldo após entrada (PADRAO) ou total (Recanto). */
  principal: number;
  finalValue: number;
  entryAmount?: number;
  saleDateIso?: string | null;
  firstInstallmentDueDate?: string | null;
  /** Default true (PADRAO). Recanto = false. */
  entryReducesPrincipal?: boolean;
};

/**
 * Validação completa do formulário de balão (regras de negócio).
 * Sem balão → sempre válido.
 */
export function validateSaleBalloonPlan(
  plan: SaleBalloonPlan,
  installmentsCount: number,
  principal: number,
): { valid: true } | { valid: false; message: string } {
  return validateSaleBalloonConfiguration({
    plan,
    paymentType: 'Parcelado',
    installmentsCount,
    principal,
    finalValue: principal,
  });
}

export function validateSaleBalloonConfiguration(
  params: ValidateBalloonParams,
): { valid: true } | { valid: false; message: string } {
  const plan = params.plan;
  if (!plan.enabled) return { valid: true };

  const paymentType = String(params.paymentType || '');
  if (paymentType === 'À vista' || /vista/i.test(paymentType) && !/parcel/i.test(paymentType)) {
    return {
      valid: false,
      message: 'Parcelas balão não podem ser usadas em venda à vista.',
    };
  }

  const N = Math.max(0, Number(params.installmentsCount) || 0);
  if (N <= 0) {
    return {
      valid: false,
      message: 'Informe a quantidade de parcelas antes de utilizar parcelas balão.',
    };
  }

  const config = plan.config || emptyBalloonFormConfig();
  const mode = plan.mode || config.mode || 'MANUAL';
  const principalCents = toCents(params.principal);

  if (mode === 'FINAL') {
    if (!config.finalUseLast) {
      return {
        valid: false,
        message: 'Marque “Última parcela será balão” ou escolha outro modo.',
      };
    }
    if (config.finalAmountMode === 'PERCENT') {
      const pct = Number(String(config.finalPercent || '').replace(',', '.'));
      if (!Number.isFinite(pct) || pct <= 0) {
        return {
          valid: false,
          message: 'O percentual do balão final deve ser maior que zero.',
        };
      }
      if (pct > 100) {
        return {
          valid: false,
          message: 'O percentual do balão final não pode ser maior que 100%.',
        };
      }
    } else {
      const value = money(parseCurrencyBRLNumber(String(config.finalValue || '')));
      if (value <= 0) {
        return {
          valid: false,
          message: 'O valor do balão final deve ser maior que zero.',
        };
      }
    }
  }

  if (mode === 'RECURRENT') {
    if (!config.recurrentEnabled) {
      return {
        valid: false,
        message: 'Marque “Gerar balão recorrente” ou escolha outro modo.',
      };
    }
    const interval = Number(config.recurrentIntervalMonths) || 0;
    if (![6, 12, 18, 24].includes(interval)) {
      return { valid: false, message: 'Intervalo de balão recorrente inválido.' };
    }
    const qty = Math.floor(Number(config.recurrentQuantity) || 0);
    if (qty <= 0) {
      return {
        valid: false,
        message: 'Informe uma quantidade válida de balões recorrentes.',
      };
    }
    const value = money(parseCurrencyBRLNumber(String(config.recurrentValue || '')));
    if (value <= 0) {
      return {
        valid: false,
        message: 'O valor de cada balão recorrente deve ser maior que zero.',
      };
    }
    const lastNumber = interval * qty;
    if (lastNumber > N) {
      return {
        valid: false,
        message: `A recorrência gera a parcela ${lastNumber}, acima do limite de ${N} parcelas.`,
      };
    }
  }

  if (mode === 'MANUAL') {
    const rows = (config.manualRows || []).filter(
      (r) =>
        String(r.installmentNumber || '').trim() !== '' ||
        String(r.additionalAmount || '').trim() !== '',
    );
    if (rows.length === 0) {
      return {
        valid: false,
        message: 'Configure ao menos uma parcela balão com valor adicional.',
      };
    }
    const seen = new Set<number>();
    for (const row of rows) {
      const num = Math.floor(Number(row.installmentNumber) || 0);
      const additional = money(parseCurrencyBRLNumber(String(row.additionalAmount || '')));
      if (num < 1) {
        return {
          valid: false,
          message: 'O número da parcela balão deve ser maior ou igual a 1.',
        };
      }
      if (num > N) {
        return {
          valid: false,
          message: `Parcela balão ${num} está fora do intervalo 1–${N}.`,
        };
      }
      if (additional <= 0) {
        return {
          valid: false,
          message: `Valor adicional da parcela ${num} deve ser maior que zero.`,
        };
      }
      if (seen.has(num)) {
        return {
          valid: false,
          message: `Há duas configurações manuais para a parcela ${num}.`,
        };
      }
      seen.add(num);

      const due = String(row.dueDate || '').trim();
      if (due) {
        if (!isValidIsoDate(due)) {
          return {
            valid: false,
            message: `Data de vencimento inválida na parcela balão ${num}.`,
          };
        }
        const minDate =
          String(params.saleDateIso || '').split('T')[0] ||
          String(params.firstInstallmentDueDate || '').split('T')[0] ||
          todayIsoDate();
        if (isValidIsoDate(minDate) && due < minDate) {
          return {
            valid: false,
            message: `A data da parcela balão ${num} não pode ser anterior à data da venda (${minDate.split('-').reverse().join('/')}).`,
          };
        }
      }
    }
  }

  // Itens resolvidos (após regras de modo)
  const resolved = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: N,
    contractValue: params.finalValue,
    config,
  });

  if (resolved.items.length === 0) {
    return {
      valid: false,
      message: 'Configure ao menos uma parcela balão com valor adicional.',
    };
  }

  for (const item of resolved.items) {
    if (item.installmentNumber < 1 || item.installmentNumber > N) {
      return {
        valid: false,
        message: `Parcela balão ${item.installmentNumber} está fora do intervalo 1–${N}.`,
      };
    }
    if (item.additionalAmount <= 0) {
      return {
        valid: false,
        message: `Valor adicional da parcela ${item.installmentNumber} deve ser maior que zero.`,
      };
    }
  }

  const balloonTotalCents = resolved.items.reduce(
    (s, i) => s + toCents(i.additionalAmount),
    0,
  );

  if (balloonTotalCents <= 0) {
    return {
      valid: false,
      message: 'Configure ao menos uma parcela balão com valor adicional.',
    };
  }

  if (balloonTotalCents >= principalCents) {
    return {
      valid: false,
      message:
        'A soma dos balões deve ser menor que o saldo financiado, para manter parcelas base.',
    };
  }

  if (balloonTotalCents > principalCents) {
    return {
      valid: false,
      message:
        'A soma dos valores das parcelas balão não pode ser maior que o saldo parcelável.',
    };
  }

  const totals = validateBalloonFinanceTotals({
    finalValue: params.finalValue,
    entryAmount: params.entryAmount ?? 0,
    principal: params.principal,
    installmentsCount: N,
    plan: resolved,
    entryReducesPrincipal: params.entryReducesPrincipal,
  });
  if (!totals.valid) {
    return totals;
  }

  return { valid: true };
}

export function validateBalloonFinanceTotals(params: {
  finalValue: number;
  entryAmount: number;
  principal: number;
  installmentsCount: number;
  plan: SaleBalloonPlan;
  /** PADRAO/Meneses: entrada abate. Recanto: false (sinal não abate). */
  entryReducesPrincipal?: boolean;
}): { valid: true } | { valid: false; message: string } {
  const preview = buildBalloonFinancePreview(params);
  // Parcelas finais devem fechar o principal (saldo financiado).
  if (Math.abs(toCents(preview.installmentsSum) - toCents(preview.parcelableBalance + preview.balloonTotal)) > 1) {
    return {
      valid: false,
      message: BALLOON_FINANCE_MISMATCH_MESSAGE,
    };
  }
  if (Math.abs(toCents(preview.installmentsSum) - toCents(params.principal)) > 1) {
    return {
      valid: false,
      message: BALLOON_FINANCE_MISMATCH_MESSAGE,
    };
  }
  // PADRAO: entrada + parcelas = valor final
  if (params.entryReducesPrincipal !== false) {
    if (Math.abs(preview.diffCents) > 1) {
      return {
        valid: false,
        message: BALLOON_FINANCE_MISMATCH_MESSAGE,
      };
    }
  }
  return { valid: true };
}

/**
 * Prévia financeira para o formulário (BRL).
 * Fórmula: final − entrada = principal; principal − balões = saldo parcelável.
 * Desconto já deve estar no finalValue — não subtrair de novo.
 */
export function buildBalloonFinancePreview(params: {
  finalValue: number;
  entryAmount: number;
  principal: number;
  installmentsCount: number;
  plan: SaleBalloonPlan | null | undefined;
}): BalloonFinancePreview {
  const saleTotal = money(params.finalValue);
  const entryAmount = money(Math.max(0, params.entryAmount));
  const principal = money(Math.max(0, params.principal));
  const count = Math.max(0, Number(params.installmentsCount) || 0);
  const plan = params.plan;

  const compositions = applyBalloonToInstallmentAmounts(principal, count, plan);
  const balloonTotal = money(
    compositions.reduce((s, c) => s + c.balloonAddonAmount, 0),
  );
  const parcelableBalance = money(Math.max(0, principal - balloonTotal));
  const baseInstallmentValue = compositions[0]?.baseAmount ?? 0;
  const installmentsSum = money(compositions.reduce((s, c) => s + c.amount, 0));
  const grandTotal = money(entryAmount + installmentsSum);

  // Em PADRAO: entry + installmentsSum deve = saleTotal.
  // principal pode ser saleTotal - entry; installmentsSum deve = principal.
  const expected = money(entryAmount + principal);
  // Preferir fechar contra saleTotal quando entry+principal ≈ saleTotal
  const targetCents =
    Math.abs(toCents(expected) - toCents(saleTotal)) <= 1
      ? toCents(saleTotal)
      : toCents(entryAmount) + toCents(principal);
  const actualCents = toCents(entryAmount) + toCents(installmentsSum);
  const diffCents = actualCents - targetCents;

  return {
    saleTotal,
    entryAmount,
    balloonTotal,
    parcelableBalance,
    installmentsCount: count,
    baseInstallmentValue,
    balloonRows: compositions
      .map((c, idx) => ({
        installmentNumber: idx + 1,
        baseAmount: c.baseAmount,
        balloonAddonAmount: c.balloonAddonAmount,
        finalAmount: c.amount,
        dueDateOverride: c.dueDateOverride,
      }))
      .filter((r) => r.balloonAddonAmount > 0),
    compositions,
    installmentsSum,
    grandTotal,
    totalsMatch: Math.abs(diffCents) <= 1,
    diffCents,
  };
}

export function formatBalloonFinancePreviewLines(preview: BalloonFinancePreview): string[] {
  const lines = [
    `Valor da venda: ${formatCurrencyBRL(preview.saleTotal)}`,
    `Entrada: ${formatCurrencyBRL(preview.entryAmount)}`,
    `Total dos balões: ${formatCurrencyBRL(preview.balloonTotal)}`,
    `Saldo parcelável: ${formatCurrencyBRL(preview.parcelableBalance)}`,
    `${preview.installmentsCount} parcelas base de ${formatCurrencyBRL(preview.baseInstallmentValue)}`,
  ];
  for (const row of preview.balloonRows) {
    lines.push(
      `Parcela ${row.installmentNumber}: base ${formatCurrencyBRL(row.baseAmount)} + balão ${formatCurrencyBRL(row.balloonAddonAmount)} = ${formatCurrencyBRL(row.finalAmount)}`,
    );
  }
  lines.push(`Soma total final: ${formatCurrencyBRL(preview.grandTotal)}`);
  return lines;
}

/**
 * Compõe valores: reduz o principal pelos balões, divide o saldo, depois
 * adiciona o balão nas parcelas indicadas. Sem itens → retorna bases intactas.
 */
export function applyBalloonToInstallmentAmounts(
  principal: number,
  installmentsCount: number,
  plan: SaleBalloonPlan | null | undefined,
): BalloonAmountComposition[] {
  const count = Math.max(0, Number(installmentsCount) || 0);
  if (count <= 0) return [];

  const principalMoney = money(Math.max(0, principal));

  if (!plan?.enabled || !plan.items.length) {
    return splitInstallmentAmounts(principalMoney, count).map((baseAmount) => ({
      baseAmount,
      balloonAddonAmount: 0,
      amount: baseAmount,
      dueDateOverride: null,
    }));
  }

  // Deduplica por número (última ocorrência / soma) só na composição — validação já bloqueia duplicata manual
  const addonByNumber = new Map<number, { amount: number; dueDate?: string | null }>();
  for (const item of plan.items) {
    if (item.installmentNumber < 1 || item.installmentNumber > count) continue;
    if (item.additionalAmount <= 0) continue;
    const prev = addonByNumber.get(item.installmentNumber);
    addonByNumber.set(item.installmentNumber, {
      amount: money((prev?.amount || 0) + item.additionalAmount),
      dueDate: item.dueDate || prev?.dueDate || null,
    });
  }

  const balloonTotal = money(
    Array.from(addonByNumber.values()).reduce((s, v) => s + v.amount, 0),
  );
  const parcelable = money(Math.max(0, principalMoney - balloonTotal));
  const baseAmounts = splitInstallmentAmounts(parcelable, count);

  return baseAmounts.map((baseAmount, index) => {
    const installmentNumber = index + 1;
    const addon = addonByNumber.get(installmentNumber);
    const balloonAddonAmount = money(addon?.amount || 0);
    return {
      baseAmount,
      balloonAddonAmount,
      amount: money(baseAmount + balloonAddonAmount),
      dueDateOverride: addon?.dueDate || null,
    };
  });
}

/** Total dos acréscimos de balão (para quadro / validação). */
export function sumBalloonAdditionalAmounts(plan: SaleBalloonPlan | null | undefined): number {
  if (!plan?.enabled) return 0;
  return money(plan.items.reduce((s, i) => s + i.additionalAmount, 0));
}

/** Monta config de formulário a partir das linhas persistidas (edição). */
export function balloonFormConfigFromRows(
  rows: Array<{
    installment_number: number;
    additional_amount: number;
    due_date?: string | null;
  }>,
  mode?: SaleBalloonMode | null,
  storedConfig?: SaleBalloonFormConfig | null,
): SaleBalloonFormConfig {
  if (storedConfig && storedConfig.mode) {
    return { ...emptyBalloonFormConfig(), ...storedConfig };
  }
  const base = emptyBalloonFormConfig();
  if (!rows.length) return base;
  base.mode = mode || 'MANUAL';
  base.manualCount = rows.length;
  base.manualRows = rows.map((r) => ({
    installmentNumber: String(r.installment_number),
    additionalAmount: String(r.additional_amount ?? ''),
    dueDate: r.due_date ? String(r.due_date).split('T')[0] : '',
  }));
  return base;
}

export const BALLOON_EDIT_LOCKED_MESSAGE =
  'Esta venda já possui cobranças geradas. Para alterar o parcelamento ou as parcelas balão, primeiro cancele as cobranças existentes.';

export const BALLOON_MIGRATION_REQUIRED_MESSAGE =
  'Parcelas balão ainda não estão disponíveis neste ambiente. Atualize o banco de dados antes de utilizar esta opção.';

export const BALLOON_FINANCE_MISMATCH_MESSAGE =
  'Não foi possível validar o parcelamento. A soma da entrada, parcelas e balões não corresponde ao valor final da venda.';
