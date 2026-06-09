/**
 * Campos oficiais de escrita em public.sales — migrations numeradas + schema base.
 * Campos de sales_finance_fields*.sql (órfãs) NÃO entram em UPDATE/INSERT pelo app.
 */

/** Colunas confirmadas em migrations numeradas (20260519100000, 20260608120000) + schema base. */
export const SALES_OFFICIAL_UPDATE_FIELDS = [
  'customer_id',
  'agreed_price',
  'lot_price',
  'discount',
  'total_value',
  'payment_type',
  'down_payment',
  'installments_count',
  'broker_id',
  'notes',
] as const;

/** Colunas só em migrations órfãs — ausentes em produção tipicamente. */
export const SALES_ORPHAN_ONLY_FIELDS = [
  'discount_value',
  'final_value',
  'installment_value',
  'down_payment_due_date',
  'first_installment_due_date',
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
  brokerId: string | null;
  notes: string | null;
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
    broker_id: input.brokerId,
    notes: input.notes,
  };
}

export function salePatchHasOrphanFields(patch: Record<string, unknown>): string[] {
  return SALES_ORPHAN_ONLY_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(patch, f),
  );
}
