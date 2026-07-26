-- APPLY PROD/PREVIEW — parcelamento fixo + residual Recanto
-- Fonte: 20260830160000_sales_recanto_fixed_installment_residual.sql

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
