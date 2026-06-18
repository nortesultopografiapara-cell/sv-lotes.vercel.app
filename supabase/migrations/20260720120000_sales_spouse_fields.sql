-- Campos de cônjuge vinculados à venda (Recanto Primavera e demais fluxos).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_spouse_name text,
  ADD COLUMN IF NOT EXISTS sale_spouse_nationality text,
  ADD COLUMN IF NOT EXISTS sale_spouse_marital_status text,
  ADD COLUMN IF NOT EXISTS sale_spouse_profession text,
  ADD COLUMN IF NOT EXISTS sale_spouse_rg text,
  ADD COLUMN IF NOT EXISTS sale_spouse_rg_issuer text,
  ADD COLUMN IF NOT EXISTS sale_spouse_cpf text,
  ADD COLUMN IF NOT EXISTS sale_spouse_phone text,
  ADD COLUMN IF NOT EXISTS sale_spouse_email text,
  ADD COLUMN IF NOT EXISTS sale_spouse_address text;

COMMENT ON COLUMN public.sales.sale_spouse_name IS 'Nome do cônjuge anuente na venda';
COMMENT ON COLUMN public.sales.sale_spouse_cpf IS 'CPF do cônjuge anuente na venda';
