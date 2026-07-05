/**
 * Colunas confirmadas em public.cash_movements (develop).
 * Não usar colunas listadas em CASH_MOVEMENTS_MISSING_COLUMNS.
 */
export const CASH_MOVEMENTS_EXISTING_COLUMNS = [
  'id',
  'tenant_id',
  'company_id',
  'project_id',
  'type',
  'category',
  'description',
  'amount',
  'customer_id',
  'sale_id',
  'contract_id',
  'movement_date',
  'status',
  'created_by',
  'created_at',
  'updated_at',
  'receipt_number',
  'receipt_url',
  'validation_code',
  'metadata',
  'receipt_generated_at',
  'receipt_type',
] as const;

/** Colunas referenciadas no código/migrations mas ausentes no banco develop. */
export const CASH_MOVEMENTS_MISSING_COLUMNS = [
  'source_table',
  'source_id',
  'broker_id',
  'finance_receipt_id',
] as const;

export type CashMovementExistingColumn = (typeof CASH_MOVEMENTS_EXISTING_COLUMNS)[number];

/** Payload de entrada compatível com o schema real (sem colunas ausentes). */
export function buildCashMovementEntradaPayload(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(CASH_MOVEMENTS_EXISTING_COLUMNS);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowed.has(key) && value !== undefined) {
      payload[key] = value;
    }
  }
  return payload;
}

/** Vínculo parcela em cash_movements — coluna legada ou metadata jsonb. */
export function resolveCashMovementInstallmentId(row: {
  finance_receipt_id?: unknown;
  metadata?: unknown;
}): string | null {
  const legacy = String(row.finance_receipt_id || '').trim();
  if (legacy) return legacy;
  if (!row.metadata || typeof row.metadata !== 'object') return null;
  const md = row.metadata as Record<string, unknown>;
  return String(md.installment_id || md.receipt_id || '').trim() || null;
}

/** Entrada manual do Financeiro — parcela primeiro, caixa opcional (sem finance_receipt_id). */
export function buildManualFinanceReceiptCashMovement(input: {
  tenantId: string;
  receiptId: string;
  amount: number;
  installmentNumber?: number | string | null;
  contractNumber?: string | null;
  customerId?: string | null;
  saleId?: string | null;
  projectId?: string | null;
  userId: string;
  paidAt?: string;
}): Record<string, unknown> {
  const paidAt = input.paidAt || new Date().toISOString();
  return buildCashMovementEntradaPayload({
    tenant_id: input.tenantId,
    company_id: input.tenantId,
    project_id: input.projectId ?? null,
    type: 'entrada',
    category: 'Venda de Lote',
    description: `Pagamento de Parcela ${input.installmentNumber || '1'} - CT ${input.contractNumber || 'S/N'}`,
    amount: input.amount,
    customer_id: input.customerId ?? null,
    sale_id: input.saleId ?? null,
    movement_date: paidAt.split('T')[0],
    status: 'ativo',
    created_by: input.userId,
    metadata: {
      provider: 'MANUAL_FINANCE',
      installment_id: input.receiptId,
      receipt_id: input.receiptId,
    },
  });
}
