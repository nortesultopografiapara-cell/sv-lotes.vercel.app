-- Idempotência para sincronização do extrato Asaas (asaas_movement_id em metadata)
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_cash_movements_asaas_movement_id_unique
  ON public.saas_cash_movements ((metadata->>'asaas_movement_id'))
  WHERE (metadata->>'asaas_movement_id') IS NOT NULL
    AND (metadata->>'asaas_movement_id') <> '';

COMMENT ON INDEX public.idx_saas_cash_movements_asaas_movement_id_unique IS
  'Evita duplicidade ao sincronizar movimentações do extrato Asaas';

NOTIFY pgrst, 'reload schema';
