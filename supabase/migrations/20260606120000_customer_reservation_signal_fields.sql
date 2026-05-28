-- Campos de RG emissor e sinal de reserva (blocks + reservation_logs)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS rg_issuer text,
  ADD COLUMN IF NOT EXISTS rg_issuer_state text;

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS signal_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_date date,
  ADD COLUMN IF NOT EXISTS signal_payment_method text,
  ADD COLUMN IF NOT EXISTS signal_notes text;

ALTER TABLE public.reservation_logs
  ADD COLUMN IF NOT EXISTS signal_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_date date,
  ADD COLUMN IF NOT EXISTS signal_payment_method text,
  ADD COLUMN IF NOT EXISTS signal_notes text;

NOTIFY pgrst, 'reload schema';
