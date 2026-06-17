-- Reparo idempotente: colunas de preço personalizado em company_subscriptions.
-- Produção pode ter a tabela criada antes de custom_monthly_price/custom_price_enabled.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS custom_price_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_monthly_price numeric(12, 2);

COMMENT ON COLUMN public.company_subscriptions.custom_price_enabled IS
  'Indica se a assinatura usa preço personalizado negociado (espelha companies.custom_price_enabled).';

COMMENT ON COLUMN public.company_subscriptions.custom_monthly_price IS
  'Valor mensal personalizado aplicado na assinatura (espelha companies.custom_monthly_price).';

-- Sincroniza assinaturas existentes a partir de companies quando o preço customizado já está cadastrado.
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
