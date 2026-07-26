-- Parcelamento fixo + residual (RECANTO_PRIMAVERA).
-- Idempotente; NULL/default = BY_COUNT (comportamento legado).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS installment_definition_mode text NULL,
  ADD COLUMN IF NOT EXISTS regular_installment_amount numeric(15, 2) NULL,
  ADD COLUMN IF NOT EXISTS has_residual_installment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS residual_installment_amount numeric(15, 2) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_installment_definition_mode_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_installment_definition_mode_check
      CHECK (
        installment_definition_mode IS NULL
        OR installment_definition_mode IN ('BY_COUNT', 'FIXED_AMOUNT')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.sales.installment_definition_mode IS
  'RECANTO: BY_COUNT (média) ou FIXED_AMOUNT (valor fixo + residual opcional).';
COMMENT ON COLUMN public.sales.regular_installment_amount IS
  'RECANTO FIXED_AMOUNT: valor de cada parcela regular do lote.';
COMMENT ON COLUMN public.sales.has_residual_installment IS
  'RECANTO: gera parcela final de ajuste após as regulares.';
COMMENT ON COLUMN public.sales.residual_installment_amount IS
  'RECANTO: valor da parcela final de ajuste (snapshot).';
