ALTER TABLE public.brokers 
  RENAME COLUMN company_id TO tenant_id;
  
ALTER TABLE public.brokers 
  RENAME COLUMN full_name TO name;

ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'CORRETOR',
  ADD COLUMN IF NOT EXISTS commission_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());
