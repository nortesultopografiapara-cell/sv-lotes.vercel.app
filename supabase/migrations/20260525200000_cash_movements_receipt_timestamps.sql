ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_type text;

CREATE INDEX IF NOT EXISTS idx_cash_movements_metadata_validation_code
  ON public.cash_movements ((metadata ->> 'validation_code'))
  WHERE metadata ? 'validation_code';

NOTIFY pgrst, 'reload schema';
