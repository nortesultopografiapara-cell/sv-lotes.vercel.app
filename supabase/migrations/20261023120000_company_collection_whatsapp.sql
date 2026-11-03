-- Cobrança em massa via WhatsApp (Central SV Lotes) — por empresa.
-- Não reutiliza saas_billing_reminder_logs.

CREATE TABLE IF NOT EXISTS public.company_collection_whatsapp_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'zapi_platform',
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sending', 'sent', 'partial', 'failed', 'blocked')
  ),
  customer_count integer NOT NULL DEFAULT 0 CHECK (customer_count >= 0),
  installment_count integer NOT NULL DEFAULT 0 CHECK (installment_count >= 0),
  ready_customer_count integer NOT NULL DEFAULT 0 CHECK (ready_customer_count >= 0),
  total_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT company_collection_whatsapp_batches_idempotency_unique
    UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.company_collection_whatsapp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.company_collection_whatsapp_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone text,
  finance_receipt_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  charge_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  message_body text,
  template_key text NOT NULL DEFAULT 'platform_collection_v1',
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sent', 'skipped', 'failed')
  ),
  skip_reason text,
  error_message text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_company_collection_wa_batches_company
  ON public.company_collection_whatsapp_batches(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_collection_wa_items_batch
  ON public.company_collection_whatsapp_items(batch_id);

CREATE INDEX IF NOT EXISTS idx_company_collection_wa_items_company
  ON public.company_collection_whatsapp_items(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_collection_wa_items_failed
  ON public.company_collection_whatsapp_items(company_id, batch_id)
  WHERE status = 'failed';

ALTER TABLE public.company_collection_whatsapp_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_collection_whatsapp_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_collection_whatsapp_batches_tenant
  ON public.company_collection_whatsapp_batches;
CREATE POLICY company_collection_whatsapp_batches_tenant
  ON public.company_collection_whatsapp_batches
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS company_collection_whatsapp_items_tenant
  ON public.company_collection_whatsapp_items;
CREATE POLICY company_collection_whatsapp_items_tenant
  ON public.company_collection_whatsapp_items
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_collection_whatsapp_batches IS
  'Lotes de cobrança WhatsApp da loteadora via Central SV Lotes (não confundir com saas_billing_reminder_logs)';
COMMENT ON TABLE public.company_collection_whatsapp_items IS
  'Itens (um por cliente) do lote de cobrança WhatsApp — sent nunca é reenviado no retry';

NOTIFY pgrst, 'reload schema';
