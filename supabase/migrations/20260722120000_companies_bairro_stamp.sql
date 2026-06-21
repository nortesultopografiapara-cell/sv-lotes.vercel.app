-- Campos aditivos nullable — endereço e identidade visual V2.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS company_stamp_url TEXT;

COMMENT ON COLUMN public.companies.bairro IS 'Bairro do endereço da empresa (cadastro V2).';
COMMENT ON COLUMN public.companies.company_stamp_url IS 'Carimbo da empresa (PNG) — identidade visual.';
