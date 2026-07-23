-- Fase 7.1 — Fundação Asaas Corporativo (MASTER SV Topografia & Projetos)
-- Isolado: sem FK tenant, sem company_asaas_*, sem saas_charges, sem alteração de webhooks SaaS/tenant.
-- Domínio: MASTER_CORPORATE_FINANCE · external_reference = MCF:{receivable_id}[:{suffix}]

-- ---------------------------------------------------------------------------
-- Clientes Asaas (cache local da conta corporativa SV Topografia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_corporate_asaas_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  cpf_cnpj text NOT NULL,
  email text NULL,
  phone text NULL,
  mobile_phone text NULL,
  postal_code text NULL,
  address text NULL,
  address_number text NULL,
  complement text NULL,
  province text NULL,
  city text NULL,
  state text NULL,
  asaas_customer_id text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_asaas_customers_name_len CHECK (char_length(trim(customer_name)) > 0),
  CONSTRAINT master_corp_asaas_customers_doc_len CHECK (char_length(trim(cpf_cnpj)) >= 11),
  CONSTRAINT master_corp_asaas_customers_asaas_id_unique UNIQUE (asaas_customer_id),
  CONSTRAINT master_corp_asaas_customers_doc_env_unique UNIQUE (cpf_cnpj, environment)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_customers_doc
  ON public.master_corporate_asaas_customers (cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_customers_env
  ON public.master_corporate_asaas_customers (environment);

ALTER TABLE public.master_corporate_asaas_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_asaas_customers_super_admin
  ON public.master_corporate_asaas_customers;
CREATE POLICY master_corp_asaas_customers_super_admin
  ON public.master_corporate_asaas_customers
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_asaas_customers IS
  'Cache de clientes Asaas do Financeiro Corporativo MASTER (não confundir com clientes tenant/SaaS)';

-- ---------------------------------------------------------------------------
-- Cobranças Asaas corporativas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_corporate_asaas_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL
    REFERENCES public.master_corporate_receivables(id) ON DELETE RESTRICT,
  project_id uuid NULL
    REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  quote_id uuid NULL
    REFERENCES public.master_topography_quotes(id) ON DELETE SET NULL,
  financial_account_id uuid NOT NULL
    REFERENCES public.master_corporate_financial_accounts(id) ON DELETE RESTRICT,
  corporate_customer_id uuid NULL
    REFERENCES public.master_corporate_asaas_customers(id) ON DELETE SET NULL,
  asaas_customer_id text NOT NULL,
  asaas_payment_id text NOT NULL,
  billing_type text NOT NULL
    CHECK (billing_type IN ('PIX', 'BOLETO')),
  local_status text NOT NULL DEFAULT 'PENDING'
    CHECK (local_status IN (
      'PENDING',
      'AWAITING_PAYMENT',
      'RECEIVED',
      'CONFIRMED',
      'OVERDUE',
      'CANCELLED',
      'REFUNDED',
      'ERROR'
    )),
  asaas_status text NULL,
  original_value numeric(14, 2) NOT NULL,
  net_value numeric(14, 2) NULL,
  due_date date NOT NULL,
  description text NOT NULL,
  domain text NOT NULL DEFAULT 'MASTER_CORPORATE_FINANCE'
    CHECK (domain = 'MASTER_CORPORATE_FINANCE'),
  external_reference text NOT NULL,
  idempotency_key text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  invoice_url text NULL,
  bank_slip_url text NULL,
  transaction_receipt_url text NULL,
  identification_field text NULL,
  pix_payload text NULL,
  pix_qr_code text NULL,
  pix_expiration_at timestamptz NULL,
  paid_at timestamptz NULL,
  confirmed_at timestamptz NULL,
  canceled_at timestamptz NULL,
  refunded_at timestamptz NULL,
  last_sync_at timestamptz NULL,
  last_error text NULL,
  receivable_payment_id uuid NULL
    REFERENCES public.master_corporate_receivable_payments(id) ON DELETE SET NULL,
  cash_movement_id uuid NULL
    REFERENCES public.master_corporate_cash_movements(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_asaas_charges_value_pos CHECK (original_value > 0),
  CONSTRAINT master_corp_asaas_charges_payment_unique UNIQUE (asaas_payment_id),
  CONSTRAINT master_corp_asaas_charges_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT master_corp_asaas_charges_ext_ref_unique UNIQUE (external_reference),
  CONSTRAINT master_corp_asaas_charges_ext_ref_prefix CHECK (
    external_reference LIKE 'MCF:%'
  ),
  CONSTRAINT master_corp_asaas_charges_desc_len CHECK (char_length(trim(description)) > 0)
);

-- No máximo uma cobrança "ativa" por recebível (não cancelada/estornada/arquivada)
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_corp_asaas_charges_active_receivable
  ON public.master_corporate_asaas_charges (receivable_id)
  WHERE is_archived = false
    AND local_status IN ('PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'ERROR');

CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_receivable
  ON public.master_corporate_asaas_charges (receivable_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_project
  ON public.master_corporate_asaas_charges (project_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_status
  ON public.master_corporate_asaas_charges (local_status);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_due
  ON public.master_corporate_asaas_charges (due_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_ext_ref
  ON public.master_corporate_asaas_charges (external_reference);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_asaas_payment
  ON public.master_corporate_asaas_charges (asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_account
  ON public.master_corporate_asaas_charges (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_env
  ON public.master_corporate_asaas_charges (environment);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_charges_created
  ON public.master_corporate_asaas_charges (created_at DESC);

ALTER TABLE public.master_corporate_asaas_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_asaas_charges_super_admin
  ON public.master_corporate_asaas_charges;
CREATE POLICY master_corp_asaas_charges_super_admin
  ON public.master_corporate_asaas_charges
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_asaas_charges IS
  'Cobranças Asaas do Financeiro Corporativo MASTER — domínio MASTER_CORPORATE_FINANCE (não SaaS, não tenant)';

-- ---------------------------------------------------------------------------
-- Event store de webhooks (idempotência forte)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_corporate_asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  asaas_payment_id text NULL,
  charge_id uuid NULL
    REFERENCES public.master_corporate_asaas_charges(id) ON DELETE SET NULL,
  receivable_id uuid NULL
    REFERENCES public.master_corporate_receivables(id) ON DELETE SET NULL,
  external_reference text NULL,
  domain text NOT NULL DEFAULT 'MASTER_CORPORATE_FINANCE'
    CHECK (domain = 'MASTER_CORPORATE_FINANCE'),
  processing_status text NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN (
      'PENDING', 'PROCESSED', 'IGNORED', 'FAILED', 'DUPLICATE', 'REJECTED'
    )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_asaas_webhook_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_webhook_payment
  ON public.master_corporate_asaas_webhook_events (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_webhook_charge
  ON public.master_corporate_asaas_webhook_events (charge_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_webhook_status
  ON public.master_corporate_asaas_webhook_events (processing_status);
CREATE INDEX IF NOT EXISTS idx_master_corp_asaas_webhook_created
  ON public.master_corporate_asaas_webhook_events (created_at DESC);

ALTER TABLE public.master_corporate_asaas_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_asaas_webhook_events_super_admin
  ON public.master_corporate_asaas_webhook_events;
CREATE POLICY master_corp_asaas_webhook_events_super_admin
  ON public.master_corporate_asaas_webhook_events
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_asaas_webhook_events IS
  'Event store/idempotência do webhook Asaas Corporativo MASTER (endpoint dedicado)';

-- ---------------------------------------------------------------------------
-- Campos leves em Contas a Receber (integração)
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_corporate_receivables
  ADD COLUMN IF NOT EXISTS asaas_integration_status text NULL
    CHECK (
      asaas_integration_status IS NULL
      OR asaas_integration_status IN (
        'NONE',
        'PENDING',
        'AWAITING_PAYMENT',
        'RECEIVED',
        'CONFIRMED',
        'OVERDUE',
        'CANCELLED',
        'REFUNDED',
        'ERROR'
      )
    );

ALTER TABLE public.master_corporate_receivables
  ADD COLUMN IF NOT EXISTS asaas_active_charge_id uuid NULL
    REFERENCES public.master_corporate_asaas_charges(id) ON DELETE SET NULL;

ALTER TABLE public.master_corporate_receivables
  ADD COLUMN IF NOT EXISTS asaas_last_sync_at timestamptz NULL;

ALTER TABLE public.master_corporate_receivables
  ADD COLUMN IF NOT EXISTS asaas_last_error text NULL;

CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_asaas_status
  ON public.master_corporate_receivables (asaas_integration_status)
  WHERE asaas_integration_status IS NOT NULL;

COMMENT ON COLUMN public.master_corporate_receivables.asaas_integration_status IS
  'Espelho leve do status da cobrança Asaas ativa (Fase 7.1) — não substitui AR status';
COMMENT ON COLUMN public.master_corporate_receivables.asaas_active_charge_id IS
  'Última cobrança Asaas ativa vinculada ao título';
COMMENT ON COLUMN public.master_corporate_receivables.asaas_last_error IS
  'Último erro sanitizado de integração Asaas (sem tokens/payload sensível)';

NOTIFY pgrst, 'reload schema';
