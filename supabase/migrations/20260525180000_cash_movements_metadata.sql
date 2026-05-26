ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cash_movements_metadata
  ON public.cash_movements USING gin (metadata);

NOTIFY pgrst, 'reload schema';
