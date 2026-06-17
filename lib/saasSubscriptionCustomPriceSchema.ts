/**
 * Compatibilidade quando company_subscriptions em produção ainda não tem colunas de preço customizado.
 */

const CUSTOM_PRICE_COLUMNS = [
  'custom_monthly_price',
  'custom_price_enabled',
  'has_custom_price',
  'custom_discount_amount',
  'custom_price_reason',
] as const;

export function isSubscriptionCustomPriceSchemaError(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.includes('schema cache') && !m.includes('could not find')) return false;
  return CUSTOM_PRICE_COLUMNS.some((col) => m.includes(col));
}

export function omitSubscriptionCustomPriceColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...row };
  for (const col of CUSTOM_PRICE_COLUMNS) {
    delete copy[col];
  }
  return copy;
}
