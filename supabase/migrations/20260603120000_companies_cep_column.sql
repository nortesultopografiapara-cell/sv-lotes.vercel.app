-- CEP legado (zip_code é o campo principal)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cep text;

COMMENT ON COLUMN public.companies.cep IS 'CEP (espelho de zip_code quando aplicável)';

UPDATE public.companies
SET cep = zip_code
WHERE cep IS NULL AND zip_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
