-- SV LOTES 2.0 — Módulo Bancário Fase 1 (estrutura base, sem banco real)
-- Idempotente · multi-tenant por company_id · RLS padrão SV LOTES

-- ---------------------------------------------------------------------------
-- bank_integrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    provider IN (
      'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'ASAAS_COMPANY', 'MOCK'
    )
  ),
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED', 'ERROR')),
  label text,
  bank_code text,
  agency text,
  account_number text,
  account_type text,
  covenant_code text,
  pix_key text,
  webhook_url text,
  is_default boolean NOT NULL DEFAULT false,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bank_integrations_company_id
  ON public.bank_integrations(company_id);

CREATE INDEX IF NOT EXISTS idx_bank_integrations_company_provider
  ON public.bank_integrations(company_id, provider);

CREATE INDEX IF NOT EXISTS idx_bank_integrations_status
  ON public.bank_integrations(status)
  WHERE status IN ('ACTIVE', 'ERROR');

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_integrations_company_default
  ON public.bank_integrations(company_id)
  WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- bank_credentials (nunca texto puro — apenas ciphertext)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.bank_integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  credential_type text NOT NULL CHECK (
    credential_type IN ('oauth', 'certificate', 'api_key', 'webhook_secret', 'other')
  ),
  encrypted_payload text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT bank_credentials_encrypted_not_empty CHECK (length(trim(encrypted_payload)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_bank_credentials_integration_id
  ON public.bank_credentials(integration_id);

CREATE INDEX IF NOT EXISTS idx_bank_credentials_company_id
  ON public.bank_credentials(company_id);

-- ---------------------------------------------------------------------------
-- bank_charges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.bank_integrations(id) ON DELETE RESTRICT,
  finance_receipt_id uuid REFERENCES public.finance_receipts(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  charge_type text NOT NULL CHECK (charge_type IN ('BOLETO', 'PIX', 'BOLETO_PIX')),
  provider text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  external_id text,
  our_number text,
  txid text,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'REGISTERED', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED')
  ),
  barcode text,
  digitable_line text,
  pix_qr_code text,
  pix_copy_paste text,
  payment_url text,
  pdf_url text,
  paid_at timestamptz,
  paid_amount numeric(14, 2),
  fee_amount numeric(14, 2),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT bank_charges_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bank_charges_company_id
  ON public.bank_charges(company_id);

CREATE INDEX IF NOT EXISTS idx_bank_charges_integration_id
  ON public.bank_charges(integration_id);

CREATE INDEX IF NOT EXISTS idx_bank_charges_finance_receipt_id
  ON public.bank_charges(finance_receipt_id)
  WHERE finance_receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_charges_status
  ON public.bank_charges(status);

CREATE INDEX IF NOT EXISTS idx_bank_charges_external_id
  ON public.bank_charges(provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_charges_due_date
  ON public.bank_charges(due_date DESC);

-- ---------------------------------------------------------------------------
-- bank_webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  integration_id uuid REFERENCES public.bank_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  external_event_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean,
  processing_status text NOT NULL DEFAULT 'PENDING' CHECK (
    processing_status IN ('PENDING', 'PROCESSED', 'IGNORED', 'FAILED', 'DUPLICATE')
  ),
  processed_at timestamptz,
  error_message text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT bank_webhook_events_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bank_webhook_events_company_id
  ON public.bank_webhook_events(company_id);

CREATE INDEX IF NOT EXISTS idx_bank_webhook_events_integration_id
  ON public.bank_webhook_events(integration_id);

CREATE INDEX IF NOT EXISTS idx_bank_webhook_events_processing_status
  ON public.bank_webhook_events(processing_status)
  WHERE processing_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_bank_webhook_events_created_at
  ON public.bank_webhook_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- bank_cash_movements (ponte bancário → cash_movements)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_movement_id uuid REFERENCES public.cash_movements(id) ON DELETE SET NULL,
  bank_charge_id uuid REFERENCES public.bank_charges(id) ON DELETE SET NULL,
  webhook_event_id uuid REFERENCES public.bank_webhook_events(id) ON DELETE SET NULL,
  movement_kind text NOT NULL CHECK (
    movement_kind IN ('payment', 'fee', 'transfer', 'refund')
  ),
  bank_reference text,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bank_cash_movements_company_id
  ON public.bank_cash_movements(company_id);

CREATE INDEX IF NOT EXISTS idx_bank_cash_movements_bank_charge_id
  ON public.bank_cash_movements(bank_charge_id);

CREATE INDEX IF NOT EXISTS idx_bank_cash_movements_cash_movement_id
  ON public.bank_cash_movements(cash_movement_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.bank_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_integrations_tenant ON public.bank_integrations;
CREATE POLICY bank_integrations_tenant ON public.bank_integrations
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS bank_credentials_tenant ON public.bank_credentials;
CREATE POLICY bank_credentials_tenant ON public.bank_credentials
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS bank_charges_tenant ON public.bank_charges;
CREATE POLICY bank_charges_tenant ON public.bank_charges
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS bank_webhook_events_tenant ON public.bank_webhook_events;
CREATE POLICY bank_webhook_events_tenant ON public.bank_webhook_events
  FOR ALL
  USING (
    public.is_super_admin()
    OR company_id IS NULL
    OR company_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR company_id IS NULL
    OR company_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS bank_cash_movements_tenant ON public.bank_cash_movements;
CREATE POLICY bank_cash_movements_tenant ON public.bank_cash_movements
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

COMMENT ON TABLE public.bank_integrations IS 'Integrações bancárias por empresa — SV LOTES 2.0';
COMMENT ON TABLE public.bank_credentials IS 'Credenciais criptografadas — nunca armazenar segredo em texto puro';
COMMENT ON TABLE public.bank_charges IS 'Cobranças boleto/Pix vinculadas a parcelas (finance_receipts)';
COMMENT ON TABLE public.bank_webhook_events IS 'Auditoria de webhooks/retornos bancários';
COMMENT ON TABLE public.bank_cash_movements IS 'Ponte entre eventos bancários e cash_movements';

NOTIFY pgrst, 'reload schema';
