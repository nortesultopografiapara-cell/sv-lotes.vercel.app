-- APPLY Preview/Prod: customer_spouses (idempotente).
-- Cadastro reutilizável de cônjuge; snapshot da venda permanece em sales.sale_spouse_*.

CREATE TABLE IF NOT EXISTS public.customer_spouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  nationality text,
  marital_status text,
  profession text,
  rg text,
  rg_issuer text,
  cpf text NOT NULL,
  cpf_digits text NOT NULL,
  phone text,
  email text,
  address text,
  is_current boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  last_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_spouses_cpf_digits_len'
  ) THEN
    ALTER TABLE public.customer_spouses
      ADD CONSTRAINT customer_spouses_cpf_digits_len
      CHECK (char_length(cpf_digits) = 11);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customer_spouses_company_customer_cpf_uidx
  ON public.customer_spouses (company_id, customer_id, cpf_digits);

CREATE INDEX IF NOT EXISTS customer_spouses_company_customer_idx
  ON public.customer_spouses (company_id, customer_id, is_current DESC, last_used_at DESC NULLS LAST);

COMMENT ON TABLE public.customer_spouses IS
  'Cadastro reutilizável de cônjuge por cliente/empresa; contratos usam snapshot em sales.sale_spouse_*';

ALTER TABLE public.customer_spouses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_spouses'
      AND policyname = 'customer_spouses_tenant_all'
  ) THEN
    CREATE POLICY customer_spouses_tenant_all
      ON public.customer_spouses
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;
