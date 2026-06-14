-- Garante coluna monetária canônica `amount` em broker_commissions (produção SV LOTES).
-- Produção NÃO possui `commission_value`; o app grava e lê apenas `amount`.

ALTER TABLE public.broker_commissions
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;

-- Ambientes legados com commission_value: copiar para amount quando amount estiver zerado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'broker_commissions'
      AND column_name = 'commission_value'
  ) THEN
    UPDATE public.broker_commissions
    SET amount = COALESCE(NULLIF(amount, 0), commission_value, 0)
    WHERE amount IS NULL OR amount = 0;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
