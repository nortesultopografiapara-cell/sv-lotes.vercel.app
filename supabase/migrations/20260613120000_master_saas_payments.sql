-- Pagamentos de assinatura SaaS (painel Master)
CREATE TABLE IF NOT EXISTS public.master_saas_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  paid_at date NOT NULL,
  payment_method text NOT NULL DEFAULT 'manual',
  reference_month text NOT NULL,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'canceled', 'refunded')),
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_master_saas_payments_company_id
  ON public.master_saas_payments(company_id);

CREATE INDEX IF NOT EXISTS idx_master_saas_payments_paid_at
  ON public.master_saas_payments(paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_saas_payments_reference_month
  ON public.master_saas_payments(reference_month);

ALTER TABLE public.master_saas_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_saas_payments_super_admin ON public.master_saas_payments;
CREATE POLICY master_saas_payments_super_admin ON public.master_saas_payments
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_saas_payments IS 'Pagamentos de assinatura SaaS registrados pelo painel Master';

-- Pagamento real MENESES — Maio/2026
INSERT INTO public.master_saas_payments (
  company_id,
  subscription_id,
  amount,
  paid_at,
  payment_method,
  reference_month,
  status,
  notes
)
SELECT
  '59d38b25-61bb-4114-a8c1-8e34d9c78c2c',
  cs.id,
  549.99,
  '2026-05-27'::date,
  'manual',
  '2026-05',
  'paid',
  'Pagamento referência Maio/2026 — MENESES IMOBILIARIA LTDA'
FROM public.company_subscriptions cs
WHERE cs.company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c'
  AND NOT EXISTS (
    SELECT 1 FROM public.master_saas_payments p
    WHERE p.company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c'
      AND p.reference_month = '2026-05'
      AND p.amount = 549.99
  );

UPDATE public.company_subscriptions
SET
  payment_status = 'paid',
  updated_at = timezone('utc'::text, now())
WHERE company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c'
  AND EXISTS (
    SELECT 1 FROM public.master_saas_payments p
    WHERE p.company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c'
      AND p.status = 'paid'
  );

NOTIFY pgrst, 'reload schema';
