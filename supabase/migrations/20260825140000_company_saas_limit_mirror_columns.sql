-- Espelhos opcionais dos limites (canônicos: project_limit, broker_limit)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_projects integer;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_brokers integer;

COMMENT ON COLUMN public.companies.max_projects IS 'Espelho de project_limit para leitura Master/API';
COMMENT ON COLUMN public.companies.max_brokers IS 'Espelho de broker_limit para leitura Master/API';

NOTIFY pgrst, 'reload schema';
