-- Preço mensal personalizado por empresa (plano mantém limites/recursos)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS custom_monthly_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS custom_price_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_price_badge text;

COMMENT ON COLUMN public.companies.custom_monthly_price IS 'Valor mensal negociado (R$) quando custom_price_enabled = true';
COMMENT ON COLUMN public.companies.custom_price_enabled IS 'Se true, cobrança/MRR usa custom_monthly_price em vez do preço padrão do plano';
COMMENT ON COLUMN public.companies.custom_price_badge IS 'desconto_especial | founding_client';
