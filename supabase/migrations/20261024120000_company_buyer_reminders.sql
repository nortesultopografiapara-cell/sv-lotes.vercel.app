-- Lembretes automáticos ao comprador (D-3 / D0 / pós-vencimento).
-- Histórico separado da cobrança WhatsApp em massa.
-- Não reutiliza saas_billing_reminder_logs e não referencia saas_charges.

CREATE TABLE IF NOT EXISTS public.company_buyer_reminder_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  due_soon_enabled boolean NOT NULL DEFAULT true,
  due_soon_days integer NOT NULL DEFAULT 3 CHECK (due_soon_days BETWEEN 1 AND 30),
  due_today_enabled boolean NOT NULL DEFAULT true,
  overdue_enabled boolean NOT NULL DEFAULT true,
  overdue_days integer NOT NULL DEFAULT 3 CHECK (overdue_days BETWEEN 1 AND 30),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.company_buyer_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  finance_receipt_id uuid NOT NULL REFERENCES public.finance_receipts(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('due_soon', 'due_today', 'overdue_friendly')),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
  skip_reason text,
  message_body text,
  template_key text NOT NULL DEFAULT 'buyer_reminder_v1',
  provider_message_id text,
  error_message text,
  customer_name text,
  project_name text,
  parcel_label text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS company_buyer_reminder_logs_sent_unique
  ON public.company_buyer_reminder_logs (
    company_id,
    finance_receipt_id,
    channel,
    event_type,
    due_date
  )
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_company_buyer_reminder_logs_company
  ON public.company_buyer_reminder_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_buyer_reminder_logs_receipt
  ON public.company_buyer_reminder_logs(company_id, finance_receipt_id, event_type, channel);

ALTER TABLE public.company_buyer_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_buyer_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_buyer_reminder_settings_tenant
  ON public.company_buyer_reminder_settings;
CREATE POLICY company_buyer_reminder_settings_tenant
  ON public.company_buyer_reminder_settings
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS company_buyer_reminder_logs_tenant
  ON public.company_buyer_reminder_logs;
CREATE POLICY company_buyer_reminder_logs_tenant
  ON public.company_buyer_reminder_logs
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_buyer_reminder_settings IS
  'Configuração por empresa dos lembretes automáticos ao comprador (Central SV Lotes)';
COMMENT ON TABLE public.company_buyer_reminder_logs IS
  'Histórico idempotente dos lembretes automáticos ao comprador — distinto da cobrança WhatsApp em massa';

NOTIFY pgrst, 'reload schema';
