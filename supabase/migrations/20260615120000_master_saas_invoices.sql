-- Faturas SaaS recorrentes (painel Master)
CREATE TABLE IF NOT EXISTS public.master_saas_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  reference_month text NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  discount_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount numeric(10, 2) NOT NULL CHECK (final_amount >= 0),
  due_date date NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO')),
  payment_method text,
  pix_code text,
  pix_qrcode text,
  external_charge_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_saas_invoices_company_month
  ON public.master_saas_invoices(company_id, reference_month);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_saas_invoices_number
  ON public.master_saas_invoices(invoice_number);

CREATE INDEX IF NOT EXISTS idx_master_saas_invoices_status
  ON public.master_saas_invoices(status);

CREATE INDEX IF NOT EXISTS idx_master_saas_invoices_due_date
  ON public.master_saas_invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_master_saas_invoices_reference_month
  ON public.master_saas_invoices(reference_month);

ALTER TABLE public.master_saas_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_saas_invoices_super_admin ON public.master_saas_invoices;
CREATE POLICY master_saas_invoices_super_admin ON public.master_saas_invoices
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_saas_invoices IS 'Faturas mensais SaaS — cobrança recorrente Master';

-- Sequência transacional de numeração FAT-NNNNN/YYYY-MM
CREATE TABLE IF NOT EXISTS public.master_saas_invoice_counters (
  year_month text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_next_saas_invoice_number(p_reference_month text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  INSERT INTO public.master_saas_invoice_counters (year_month, last_number)
  VALUES (p_reference_month, 0)
  ON CONFLICT (year_month) DO NOTHING;

  UPDATE public.master_saas_invoice_counters
  SET last_number = last_number + 1
  WHERE year_month = p_reference_month
  RETURNING last_number INTO next_num;

  RETURN lpad(next_num::text, 5, '0') || '/' || p_reference_month;
END;
$$;

NOTIFY pgrst, 'reload schema';
