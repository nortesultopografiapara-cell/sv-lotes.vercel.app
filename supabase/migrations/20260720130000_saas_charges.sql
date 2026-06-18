-- Cobranças SaaS com PIX real (Fase 1)
CREATE TABLE IF NOT EXISTS public.saas_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.master_saas_invoices(id) ON DELETE SET NULL,
  master_payment_id uuid REFERENCES public.master_saas_payments(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED')),
  payment_provider text NOT NULL DEFAULT 'mock',
  payment_id text,
  pix_qr_code text,
  pix_copy_paste text,
  payment_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_saas_charges_company_id
  ON public.saas_charges(company_id);

CREATE INDEX IF NOT EXISTS idx_saas_charges_subscription_id
  ON public.saas_charges(subscription_id);

CREATE INDEX IF NOT EXISTS idx_saas_charges_status
  ON public.saas_charges(status);

CREATE INDEX IF NOT EXISTS idx_saas_charges_payment_id
  ON public.saas_charges(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saas_charges_due_date
  ON public.saas_charges(due_date DESC);

ALTER TABLE public.saas_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_charges_super_admin ON public.saas_charges;
CREATE POLICY saas_charges_super_admin ON public.saas_charges
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS saas_charges_tenant_read ON public.saas_charges;
CREATE POLICY saas_charges_tenant_read ON public.saas_charges
  FOR SELECT
  USING (
    company_id = public.current_tenant_id()
    OR public.is_super_admin()
  );

COMMENT ON TABLE public.saas_charges IS 'Cobranças PIX SaaS — gateway desacoplado (Asaas, Efí, etc.)';

NOTIFY pgrst, 'reload schema';
