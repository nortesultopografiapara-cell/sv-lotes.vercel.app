/**
 * Campos oficiais de escrita em public.sales — migrations numeradas + schema base.
 * Campos de sales_finance_fields*.sql (órfãs) NÃO entram em UPDATE/INSERT pelo app.
 */

import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  normalizeInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import {
  buildSaleSpouseDbPatch,
  SALE_SPOUSE_DB_FIELDS,
  type SaleSpouseFormFields,
} from '@/lib/saleSpouseFields';

/** Colunas confirmadas em produção (migrations numeradas aplicadas + schema base). */
export const SALES_OFFICIAL_UPDATE_FIELDS = [
  'customer_id',
  'agreed_price',
  'lot_price',
  'discount',
  'total_value',
  'payment_type',
  'down_payment',
  'installments_count',
  'installment_correction_type',
  'broker_id',
  'signal_contract_value',
  'signal_paid_at_sale',
  'signal_remaining_value',
  'signal_remaining_payment_mode',
  'signal_remaining_installments',
  'signal_remaining_installment_value',
  'financial_account_id',
  'use_balloon_installments',
  'balloon_mode',
  'balloon_config',
  ...SALE_SPOUSE_DB_FIELDS,
] as const;

/** Colunas só em migrations órfãs — ausentes em produção tipicamente. */
export const SALES_ORPHAN_ONLY_FIELDS = [
  'discount_value',
  'final_value',
  'installment_value',
  'down_payment_due_date',
  'first_installment_due_date',
] as const;

/** Colunas proibidas no UPDATE (órfãs + notes sem migration aplicada em produção). */
export const SALES_UPDATE_FORBIDDEN_FIELDS = [
  'notes',
  ...SALES_ORPHAN_ONLY_FIELDS,
] as const;

export type OfficialSalesUpdateInput = {
  customerId: string;
  agreedPrice: number;
  lotPrice: number;
  discount: number;
  totalValue: number;
  paymentType: string;
  downPayment: number;
  installmentsCount: number;
  installmentCorrectionType?: string | null;
  brokerId: string | null;
  spouse?: Partial<SaleSpouseFormFields>;
  signalContractValue?: number | null;
  signalPaidAtSale?: number | null;
  signalRemainingValue?: number | null;
  signalRemainingPaymentMode?: string | null;
  signalRemainingInstallments?: number | null;
  signalRemainingInstallmentValue?: number | null;
  financialAccountId?: string | null;
  useBalloonInstallments?: boolean;
  balloonMode?: string | null;
  balloonConfig?: Record<string, unknown> | null;
};

/** Payload seguro para sales.update — somente colunas oficiais. */
export function buildOfficialSalesUpdatePatch(
  input: OfficialSalesUpdateInput,
): Record<string, unknown> {
  return {
    customer_id: input.customerId,
    agreed_price: input.agreedPrice,
    lot_price: input.lotPrice,
    discount: input.discount,
    total_value: input.totalValue,
    payment_type: input.paymentType,
    down_payment: input.downPayment,
    installments_count: input.installmentsCount,
    installment_correction_type: normalizeInstallmentCorrectionType(
      input.installmentCorrectionType ?? DEFAULT_INSTALLMENT_CORRECTION_TYPE,
    ),
    broker_id: input.brokerId,
    signal_contract_value: input.signalContractValue ?? null,
    signal_paid_at_sale: input.signalPaidAtSale ?? null,
    signal_remaining_value: input.signalRemainingValue ?? null,
    signal_remaining_payment_mode: input.signalRemainingPaymentMode ?? null,
    signal_remaining_installments: input.signalRemainingInstallments ?? null,
    signal_remaining_installment_value:
      input.signalRemainingInstallmentValue ?? null,
    financial_account_id: input.financialAccountId ?? null,
    use_balloon_installments: Boolean(input.useBalloonInstallments),
    balloon_mode: input.useBalloonInstallments
      ? input.balloonMode ?? null
      : null,
    balloon_config: input.useBalloonInstallments
      ? input.balloonConfig ?? null
      : null,
    ...buildSaleSpouseDbPatch(input.spouse || {}),
  };
}

export function salePatchHasOrphanFields(patch: Record<string, unknown>): string[] {
  return SALES_ORPHAN_ONLY_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(patch, f),
  );
}

export function salePatchHasForbiddenFields(patch: Record<string, unknown>): string[] {
  return SALES_UPDATE_FORBIDDEN_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(patch, f),
  );
}
