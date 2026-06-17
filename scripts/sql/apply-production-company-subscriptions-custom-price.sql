-- APLICAR EM PRODUÇÃO (Supabase SQL Editor)
-- Repara company_subscriptions quando custom_monthly_price/custom_price_enabled não existem.
-- NÃO criar has_custom_price / custom_discount_amount / custom_price_reason — o código usa
-- companies.custom_* + company_subscriptions.custom_price_enabled/custom_monthly_price.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS custom_price_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_monthly_price numeric(12, 2);

COMMENT ON COLUMN public.company_subscriptions.custom_price_enabled IS
  'Indica se a assinatura usa preço personalizado negociado (espelha companies.custom_price_enabled).';

COMMENT ON COLUMN public.company_subscriptions.custom_monthly_price IS
  'Valor mensal personalizado aplicado na assinatura (espelha companies.custom_monthly_price).';

UPDATE public.company_subscriptions cs
SET
  custom_price_enabled = COALESCE(c.custom_price_enabled, false),
  custom_monthly_price = CASE
    WHEN COALESCE(c.custom_price_enabled, false) THEN c.custom_monthly_price
    ELSE NULL
  END,
  monthly_price = CASE
    WHEN COALESCE(c.custom_price_enabled, false) AND c.custom_monthly_price IS NOT NULL
      THEN c.custom_monthly_price
    ELSE cs.monthly_price
  END,
  updated_at = timezone('utc'::text, now())
FROM public.companies c
WHERE c.id = cs.company_id
  AND COALESCE(c.custom_price_enabled, false) = true
  AND c.custom_monthly_price IS NOT NULL;

NOTIFY pgrst, 'reload schema';
