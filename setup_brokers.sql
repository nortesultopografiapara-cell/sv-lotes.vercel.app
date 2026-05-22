CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid default gen_random_uuid() primary key,
  company_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  auth_user_id uuid,
  name text NOT NULL,
  cpf text,
  creci text,
  phone text,
  email text,
  commission_percent numeric default 0,
  status text default 'ativo',
  avatar_url text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL
);

-- Note: we use NOT EXISTS syntax but for columns if table exists we just ALTER
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS creci text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS commission_percent numeric default 0;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS status text default 'ativo';
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL;

CREATE TABLE IF NOT EXISTS public.broker_commissions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  broker_id uuid REFERENCES public.brokers(id),
  sale_id uuid REFERENCES public.sales(id),
  contract_id uuid REFERENCES public.contracts(id),
  customer_id uuid REFERENCES public.customers(id),
  amount_sale numeric default 0,
  commission_percent numeric default 0,
  commission_value numeric default 0,
  status text default 'pendente',
  due_date date,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL
);

NOTIFY pgrst, 'reload schema';
