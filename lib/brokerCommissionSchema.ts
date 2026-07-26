/**
 * Schema canônico de broker_commissions em produção SV LOTES.
 * Coluna monetária ativa: `amount` (não `commission_value`).
 */

export const BROKER_COMMISSION_AMOUNT_COLUMN = 'amount' as const;

/** Campos usados em SELECT da API de gerenciamento — sem colunas inexistentes em produção. */
export const BROKER_COMMISSION_API_SELECT =
  'id, sale_id, broker_id, amount, commission_percent, commission_mode, commission_fixed_amount, calculation_base, status, paid_at' as const;

/** Estrutura documentada da tabela em produção (Jun/2026 + modos Jul/2026). */
export const BROKER_COMMISSION_PRODUCTION_SCHEMA = [
  { column: 'id', type: 'uuid', constraints: 'PRIMARY KEY, default gen_random_uuid()' },
  { column: 'company_id', type: 'uuid', constraints: 'NOT NULL, escopo tenant' },
  { column: 'tenant_id', type: 'uuid', constraints: 'NOT NULL, escopo tenant' },
  { column: 'broker_id', type: 'uuid', constraints: 'FK brokers(id), ON DELETE SET NULL' },
  { column: 'sale_id', type: 'uuid', constraints: 'FK sales(id)' },
  { column: 'contract_id', type: 'uuid', constraints: 'FK contracts(id), opcional' },
  { column: 'customer_id', type: 'uuid', constraints: 'FK customers(id), opcional' },
  { column: 'amount', type: 'numeric', constraints: 'valor monetário da comissão (produção)' },
  { column: 'commission_percent', type: 'numeric', constraints: 'percentual aplicado' },
  { column: 'commission_mode', type: 'text', constraints: "PERCENT | FIXED | NONE, default PERCENT" },
  { column: 'commission_fixed_amount', type: 'numeric', constraints: 'opcional, modo FIXED' },
  { column: 'calculation_base', type: 'numeric', constraints: 'opcional, base do cálculo PERCENT' },
  { column: 'status', type: 'text', constraints: "default 'pendente' | pago | cancelado" },
  { column: 'due_date', type: 'date', constraints: 'opcional' },
  { column: 'paid_at', type: 'timestamptz', constraints: 'opcional' },
  { column: 'created_at', type: 'timestamptz', constraints: 'NOT NULL, default now()' },
  { column: 'receipt_number', type: 'text', constraints: 'opcional, migration 20260525140000' },
  { column: 'receipt_url', type: 'text', constraints: 'opcional' },
  { column: 'validation_code', type: 'text', constraints: 'opcional' },
] as const;
