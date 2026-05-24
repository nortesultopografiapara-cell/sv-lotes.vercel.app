-- SAAS MULTI-TENANT UPDATE

-- 1. ADD COLUMNS TO COMPANIES
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS plan jsonb,
ADD COLUMN IF NOT EXISTS broker_limit int default 5,
ADD COLUMN IF NOT EXISTS project_limit int default 2,
ADD COLUMN IF NOT EXISTS admin_limit int default 1,
ADD COLUMN IF NOT EXISTS is_active boolean default true,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- In case plan is just a text column
ALTER TABLE public.companies DROP COLUMN plan;
ALTER TABLE public.companies ADD COLUMN plan text default 'Básico';

-- 2. CREATE BROKERS TABLE
CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  full_name text not null,
  cpf text unique,
  creci text unique,
  phone text,
  email text,
  status text default 'Ativo',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. RLS FOR BROKERS
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_brokers" ON public.brokers
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "company_manage_brokers" ON public.brokers
  FOR ALL USING (company_id = public.current_tenant_id() OR company_id = (select tenant_id from auth.users where id = auth.uid()));

