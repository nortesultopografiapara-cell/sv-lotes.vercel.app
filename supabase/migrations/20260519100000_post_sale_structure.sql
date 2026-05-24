-- 1. BROKERS
CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  creci text,
  role text DEFAULT 'BROKER',
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "tenant_isolation_brokers" ON public.brokers;
    CREATE POLICY "tenant_isolation_brokers" ON public.brokers
      FOR ALL USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());
END
$$;

-- 2. SALES - Adicionando colunas de forma segura para não apagar dados existentes
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.blocks(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS lot_price decimal;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount decimal;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total_value decimal;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_date timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_type text;
-- (down_payment, installments_count, status, created_at já existem no schema ou são genéricos)

-- 3. FINANCE_RECEIPTS
CREATE TABLE IF NOT EXISTS public.finance_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount decimal NOT NULL,
  paid_amount decimal,
  paid_at timestamp with time zone,
  status text CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')) DEFAULT 'pendente',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "tenant_isolation_finance_receipts" ON public.finance_receipts;
    CREATE POLICY "tenant_isolation_finance_receipts" ON public.finance_receipts
      FOR ALL USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());
END
$$;

-- 4. CONTRACTS
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  generated_html text,
  status text CHECK (status IN ('rascunho', 'ativo', 'assinado', 'cancelado')) DEFAULT 'rascunho',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "tenant_isolation_contracts" ON public.contracts;
    CREATE POLICY "tenant_isolation_contracts" ON public.contracts
      FOR ALL USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());
END
$$;

-- Permitir Realtime
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.brokers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_receipts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
