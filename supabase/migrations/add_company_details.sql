ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS responsible_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS responsible_cpf text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url text;

-- Add some missing fields to clients for the contract
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS nationality text default 'Brasileira';
