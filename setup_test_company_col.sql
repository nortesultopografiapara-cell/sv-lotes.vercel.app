ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_test_company BOOLEAN DEFAULT false;
