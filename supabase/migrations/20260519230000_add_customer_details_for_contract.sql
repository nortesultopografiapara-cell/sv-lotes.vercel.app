ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS rg text,
ADD COLUMN IF NOT EXISTS profession text,
ADD COLUMN IF NOT EXISTS civil_state text,
ADD COLUMN IF NOT EXISTS neighborhood text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state_uf text,
ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS rg text,
ADD COLUMN IF NOT EXISTS profession text,
ADD COLUMN IF NOT EXISTS civil_state text,
ADD COLUMN IF NOT EXISTS neighborhood text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state_uf text,
ADD COLUMN IF NOT EXISTS zip_code text;
