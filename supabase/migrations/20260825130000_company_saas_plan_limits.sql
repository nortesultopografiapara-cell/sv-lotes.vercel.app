-- Limites adicionais de plano SaaS (lotes totais + observação comercial interna)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_lots integer;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS saas_commercial_note text;

COMMENT ON COLUMN public.companies.max_lots IS 'Limite total de lotes no tenant (plano Personalizado ou override manual)';
COMMENT ON COLUMN public.companies.saas_commercial_note IS 'Observação comercial interna do Master para plano Personalizado';

NOTIFY pgrst, 'reload schema';
