ALTER TABLE public.broker_commissions
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS validation_code text;

CREATE INDEX IF NOT EXISTS idx_broker_commissions_validation_code
  ON public.broker_commissions(validation_code)
  WHERE validation_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
