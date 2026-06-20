-- Multa e juros automáticos em cobranças SaaS (Asaas)
ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS fine_percent numeric,
  ADD COLUMN IF NOT EXISTS interest_percent numeric,
  ADD COLUMN IF NOT EXISTS late_fee_enabled boolean,
  ADD COLUMN IF NOT EXISTS late_fee_configured_at timestamptz;

COMMENT ON COLUMN public.saas_charges.fine_percent IS 'Multa por atraso (%) enviada ao Asaas';
COMMENT ON COLUMN public.saas_charges.interest_percent IS 'Juros diário (%) enviado ao Asaas';
COMMENT ON COLUMN public.saas_charges.late_fee_enabled IS 'Indica se multa/juros foram configurados no Asaas';
COMMENT ON COLUMN public.saas_charges.late_fee_configured_at IS 'Quando multa/juros foram aplicados no Asaas';
