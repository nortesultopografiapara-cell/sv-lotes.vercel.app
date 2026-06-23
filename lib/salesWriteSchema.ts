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
