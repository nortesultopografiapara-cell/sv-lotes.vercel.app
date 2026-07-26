-- APPLY Preview/Prod: modos de comissão PERCENT | FIXED | NONE (idempotente).

ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS commission_mode text,
  ADD COLUMN IF NOT EXISTS commission_fixed_amount numeric;

ALTER TABLE public.broker_commissions
  ADD COLUMN IF NOT EXISTS commission_mode text,
  ADD COLUMN IF NOT EXISTS commission_fixed_amount numeric,
  ADD COLUMN IF NOT EXISTS calculation_base numeric;

UPDATE public.brokers
SET commission_mode = 'PERCENT'
WHERE commission_mode IS NULL OR btrim(commission_mode) = '';

UPDATE public.broker_commissions
SET commission_mode = 'PERCENT'
WHERE commission_mode IS NULL OR btrim(commission_mode) = '';

ALTER TABLE public.brokers
  ALTER COLUMN commission_mode SET DEFAULT 'PERCENT';

ALTER TABLE public.broker_commissions
  ALTER COLUMN commission_mode SET DEFAULT 'PERCENT';

COMMENT ON COLUMN public.brokers.commission_mode IS
  'PERCENT | FIXED | NONE — padrão do corretor para novas vendas';
COMMENT ON COLUMN public.brokers.commission_fixed_amount IS
  'Valor fixo por venda quando commission_mode = FIXED';
COMMENT ON COLUMN public.broker_commissions.commission_mode IS
  'Snapshot do modelo na época da venda: PERCENT | FIXED | NONE';
COMMENT ON COLUMN public.broker_commissions.commission_fixed_amount IS
  'Snapshot do valor fixo quando mode = FIXED';
COMMENT ON COLUMN public.broker_commissions.calculation_base IS
  'Base da venda usada no cálculo percentual (snapshot)';
