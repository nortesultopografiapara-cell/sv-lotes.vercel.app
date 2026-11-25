-- Uma entrada ativa por cobrança Asaas Company.
-- O índice do extrato (asaas_movement_id) e o índice C6 não cobrem charge_id do webhook.
-- Estornos e linhas sem charge_id ficam fora do índice.

DO $$
DECLARE
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_conflicts
  FROM (
    SELECT company_id, metadata->>'charge_id' AS charge_id
    FROM public.cash_movements
    WHERE type = 'entrada'
      AND COALESCE(status, 'ativo') = 'ativo'
      AND metadata->>'provider' = 'ASAAS_COMPANY'
      AND COALESCE(metadata->>'charge_id', '') <> ''
    GROUP BY company_id, metadata->>'charge_id'
    HAVING count(*) > 1
  ) conflicts;
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'Há baixas Asaas Company ativas duplicadas para a mesma cobrança. O índice não foi criado e esta migration foi desfeita.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_company_asaas_charge_unique
  ON public.cash_movements (company_id, (metadata->>'charge_id'))
  WHERE type = 'entrada'
    AND COALESCE(status, 'ativo') = 'ativo'
    AND metadata->>'provider' = 'ASAAS_COMPANY'
    AND COALESCE(metadata->>'charge_id', '') <> '';

COMMENT ON INDEX public.idx_cash_movements_company_asaas_charge_unique IS
  'Uma entrada ativa por cobrança Asaas Company. Webhook e conciliação concorrentes reaproveitam a linha existente.';
