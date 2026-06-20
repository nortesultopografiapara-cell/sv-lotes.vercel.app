-- Uma cobrança ativa por fatura — canceladas/deletadas não entram no índice
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_charges_active_invoice_unique
  ON public.saas_charges(invoice_id)
  WHERE invoice_id IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('CANCELLED', 'DELETED', 'REFUNDED');

COMMENT ON INDEX public.idx_saas_charges_active_invoice_unique IS
  'Impede duas cobranças ativas na mesma fatura; canceladas/deletadas liberam nova emissão';
