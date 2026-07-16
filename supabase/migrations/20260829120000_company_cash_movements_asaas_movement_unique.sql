-- Idempotência para sincronização do extrato Asaas → cash_movements (tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_company_asaas_movement_unique
  ON public.cash_movements (company_id, (metadata->>'financial_account_id'), (metadata->>'asaas_movement_id'))
  WHERE (metadata->>'asaas_movement_id') IS NOT NULL
    AND (metadata->>'asaas_movement_id') <> ''
    AND (metadata->>'financial_account_id') IS NOT NULL
    AND (metadata->>'financial_account_id') <> '';

COMMENT ON INDEX public.idx_cash_movements_company_asaas_movement_unique IS
  'Evita duplicidade na sincronização do extrato Asaas por empresa/conta financeira.';
