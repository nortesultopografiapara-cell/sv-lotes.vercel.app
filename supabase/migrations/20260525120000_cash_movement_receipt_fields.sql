ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS validation_code text;

CREATE INDEX IF NOT EXISTS idx_cash_movements_validation_code
  ON public.cash_movements(validation_code)
  WHERE validation_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
