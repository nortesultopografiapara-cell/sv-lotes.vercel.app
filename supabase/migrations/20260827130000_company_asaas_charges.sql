-- SV LOTES 2.0 — Cobranças Asaas por empresa (parcelas de compradores)
-- Idempotente · multi-tenant · separado do Asaas Master (SaaS)

CREATE TABLE IF NOT EXISTS public.company_asaas_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  installment_id uuid NOT NULL REFERENCES public.finance_receipts(id) ON DELETE CASCADE,
  asaas_payment_id text NOT NULL,
  billing_type text NOT NULL CHECK (billing_type IN ('PIX', 'BOLETO', 'UNDEFINED')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'REGISTERED', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED', 'OVERDUE')
  ),
  value numeric(14, 2) NOT NULL CHECK (value >= 0),
  due_date date NOT NULL,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_copy_paste text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  cash_movement_id uuid REFERENCES public.cash_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT company_asaas_charges_payment_unique UNIQUE (company_id, asaas_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_company_asaas_charges_company_id
  ON public.company_asaas_charges(company_id);

CREATE INDEX IF NOT EXISTS idx_company_asaas_charges_installment_id
  ON public.company_asaas_charges(installment_id);

CREATE INDEX IF NOT EXISTS idx_company_asaas_charges_status
  ON public.company_asaas_charges(company_id, status)
  WHERE status IN ('PENDING', 'REGISTERED', 'OVERDUE');

CREATE INDEX IF NOT EXISTS idx_company_asaas_charges_asaas_payment_id
  ON public.company_asaas_charges(asaas_payment_id);

CREATE TABLE IF NOT EXISTS public.company_asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  asaas_payment_id text,
  installment_id uuid REFERENCES public.finance_receipts(id) ON DELETE SET NULL,
  charge_id uuid REFERENCES public.company_asaas_charges(id) ON DELETE SET NULL,
  processing_status text NOT NULL DEFAULT 'PENDING' CHECK (
    processing_status IN ('PENDING', 'PROCESSED', 'IGNORED', 'FAILED', 'DUPLICATE')
  ),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT company_asaas_webhook_events_idempotency UNIQUE (company_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_company_asaas_webhook_events_company_id
  ON public.company_asaas_webhook_events(company_id);

CREATE INDEX IF NOT EXISTS idx_company_asaas_webhook_events_payment_id
  ON public.company_asaas_webhook_events(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

ALTER TABLE public.company_asaas_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_asaas_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_asaas_charges_tenant ON public.company_asaas_charges;
CREATE POLICY company_asaas_charges_tenant ON public.company_asaas_charges
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS company_asaas_webhook_events_tenant ON public.company_asaas_webhook_events;
CREATE POLICY company_asaas_webhook_events_tenant ON public.company_asaas_webhook_events
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_asaas_charges IS 'Cobranças Asaas Company — parcelas de compradores por tenant (não confundir com saas_charges Master)';
COMMENT ON TABLE public.company_asaas_webhook_events IS 'Auditoria/idempotência de webhooks Asaas Company por tenant';

NOTIFY pgrst, 'reload schema';
