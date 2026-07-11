/**
 * Modalidade de pagamento da venda — fonte única de verdade.
 * Valores persistidos em sales.payment_type (texto, sem enum PG).
 */

export function normalizeSalePaymentType(paymentType: unknown): string {
  return String(paymentType || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Pagamento imediato na assinatura (legado “À vista”). */
export const PAYMENT_TYPE_IMMEDIATE_CASH = 'À vista';

/** Um único recebível com vencimento futuro (não quita na assinatura). */
export const PAYMENT_TYPE_SINGLE_FUTURE = 'Pagamento único futuro';

/** Parcelamento mensal. */
export const PAYMENT_TYPE_INSTALLMENT = 'Parcelado';

export type SalePaymentMode =
  | 'IMMEDIATE_CASH'
  | 'SINGLE_FUTURE'
  | 'INSTALLMENT';

export type SalePaymentModeResolution = {
  mode: SalePaymentMode;
  normalizedType: string;
  persistedType: string;
  isImmediateCash: boolean;
  isSingleFuture: boolean;
  isInstallment: boolean;
  /** Compat: true somente para pagamento imediato (não inclui único futuro). */
  isCashPayment: boolean;
  label: string;
};

function isExplicitSingleFuture(normalized: string): boolean {
  if (!normalized) return false;
  if (normalized === 'pagamento unico futuro') return true;
  if (normalized.includes('unico futuro')) return true;
  if (normalized.includes('pagamento unico') && !normalized.includes('parcel')) {
    return true;
  }
  if (normalized.includes('single future') || normalized.includes('single_payment')) {
    return true;
  }
  return false;
}

function isExplicitInstallment(normalized: string): boolean {
  if (!normalized) return false;
  return (
    normalized === 'parcelado' ||
    normalized === 'parcelada' ||
    normalized === 'installment' ||
    normalized.includes('parcel')
  );
}

function isExplicitImmediateCash(normalized: string): boolean {
  if (!normalized) return false;
  if (isExplicitSingleFuture(normalized)) return false;
  if (isExplicitInstallment(normalized)) return false;
  return (
    normalized === 'a vista' ||
    normalized === 'avista' ||
    normalized === 'cash' ||
    (normalized.includes('vista') && !normalized.includes('parcel'))
  );
}

/**
 * Resolve a modalidade sem inferir “único futuro” só pela quantidade de parcelas.
 * Vendas antigas “À vista” (mesmo com vencimento futuro) permanecem IMMEDIATE_CASH
 * até conversão controlada do payment_type.
 */
export function resolveSalePaymentMode(sale: {
  payment_type?: unknown;
  installments_count?: unknown;
  down_payment?: unknown;
}): SalePaymentModeResolution {
  const normalizedType = normalizeSalePaymentType(sale?.payment_type);

  if (isExplicitSingleFuture(normalizedType)) {
    return {
      mode: 'SINGLE_FUTURE',
      normalizedType,
      persistedType: PAYMENT_TYPE_SINGLE_FUTURE,
      isImmediateCash: false,
      isSingleFuture: true,
      isInstallment: false,
      isCashPayment: false,
      label: 'Pagamento único com vencimento futuro',
    };
  }

  if (isExplicitInstallment(normalizedType)) {
    return {
      mode: 'INSTALLMENT',
      normalizedType,
      persistedType: PAYMENT_TYPE_INSTALLMENT,
      isImmediateCash: false,
      isSingleFuture: false,
      isInstallment: true,
      isCashPayment: false,
      label: 'Parcelado',
    };
  }

  if (isExplicitImmediateCash(normalizedType)) {
    return {
      mode: 'IMMEDIATE_CASH',
      normalizedType,
      persistedType: PAYMENT_TYPE_IMMEDIATE_CASH,
      isImmediateCash: true,
      isSingleFuture: false,
      isInstallment: false,
      isCashPayment: true,
      label: 'À vista',
    };
  }

  const installments = Math.max(1, Number(sale?.installments_count) || 1);
  const downPayment = Number(sale?.down_payment || 0);
  if (installments <= 1 && downPayment <= 0) {
    return {
      mode: 'IMMEDIATE_CASH',
      normalizedType,
      persistedType: PAYMENT_TYPE_IMMEDIATE_CASH,
      isImmediateCash: true,
      isSingleFuture: false,
      isInstallment: false,
      isCashPayment: true,
      label: 'À vista',
    };
  }

  return {
    mode: 'INSTALLMENT',
    normalizedType,
    persistedType: PAYMENT_TYPE_INSTALLMENT,
    isImmediateCash: false,
    isSingleFuture: false,
    isInstallment: true,
    isCashPayment: false,
    label: 'Parcelado',
  };
}

export function isImmediateCashPaymentType(paymentType: unknown): boolean {
  return resolveSalePaymentMode({ payment_type: paymentType }).isImmediateCash;
}

export function isSingleFuturePaymentType(paymentType: unknown): boolean {
  return resolveSalePaymentMode({ payment_type: paymentType }).isSingleFuture;
}

export function isInstallmentPaymentType(paymentType: unknown): boolean {
  return resolveSalePaymentMode({ payment_type: paymentType }).isInstallment;
}

/** Entrada de venda parcelada (não confundir com vencimento de pagamento único). */
export function isParcelEntryDueDateField(paymentType: unknown): boolean {
  return isInstallmentPaymentType(paymentType);
}

/** Vencimento do pagamento único (à vista imediato ou único futuro). */
export function isSinglePaymentDueDateField(paymentType: unknown): boolean {
  const mode = resolveSalePaymentMode({ payment_type: paymentType });
  return mode.isImmediateCash || mode.isSingleFuture;
}

export function salePaymentModeSelectOptions(): Array<{
  value: string;
  label: string;
}> {
  return [
    { value: PAYMENT_TYPE_IMMEDIATE_CASH, label: 'À vista — pagamento imediato' },
    {
      value: PAYMENT_TYPE_SINGLE_FUTURE,
      label: 'Pagamento único com vencimento futuro',
    },
    { value: PAYMENT_TYPE_INSTALLMENT, label: 'Parcelado' },
  ];
}
