-- Assinaturas SaaS por empresa + contrato
CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_type text NOT NULL DEFAULT 'basic',
  monthly_price numeric(10, 2) NOT NULL DEFAULT 0,
  custom_price_enabled boolean NOT NULL DEFAULT false,
  custom_monthly_price numeric(10, 2),
  billing_cycle text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT (CURRENT_DATE),
  next_due_date date,
  payment_status text NOT NULL DEFAULT 'pending',
  contract_status text NOT NULL DEFAULT 'active',
  contract_number text,
  contract_pdf_url text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT company_subscriptions_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_id
  ON public.company_subscriptions(company_id);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_next_due
  ON public.company_subscriptions(next_due_date);

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_company_subscriptions_all" ON public.company_subscriptions;
CREATE POLICY "master_company_subscriptions_all" ON public.company_subscriptions
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "tenant_read_own_subscription" ON public.company_subscriptions;
CREATE POLICY "tenant_read_own_subscription" ON public.company_subscriptions
  FOR SELECT
  USING (company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_subscriptions IS 'Assinatura SaaS mensal por tenant';
