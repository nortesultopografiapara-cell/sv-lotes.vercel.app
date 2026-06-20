-- Logs de lembretes automáticos de cobrança SaaS (e-mail / WhatsApp futuro)
CREATE TABLE IF NOT EXISTS public.saas_billing_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  saas_charge_id uuid NOT NULL REFERENCES public.saas_charges(id) ON DELETE CASCADE,
  asaas_payment_id text,
  reminder_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  sent_to text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_billing_reminder_logs_unique_sent
  ON public.saas_billing_reminder_logs(saas_charge_id, reminder_type, channel)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_saas_billing_reminder_logs_company
  ON public.saas_billing_reminder_logs(company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_billing_reminder_logs_type
  ON public.saas_billing_reminder_logs(reminder_type, channel, sent_at DESC);

COMMENT ON TABLE public.saas_billing_reminder_logs IS 'Auditoria de lembretes automáticos SaaS — evita duplicidade por cobrança/tipo/canal';
