ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_test_company BOOLEAN DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status_operacional TEXT DEFAULT 'Ativa';

-- If necessary, also update the schema cache to reflect the changes immediately
NOTIFY pgrst, 'reload schema';
