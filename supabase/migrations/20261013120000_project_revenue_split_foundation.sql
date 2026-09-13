-- SV LOTES — Split de Recebimentos (Fase 1)
-- Fundação: configuração por empreendimento, snapshot imutável da venda,
-- pernas de execução por cobrança e destinos financeiros multi-provider.
-- Idempotente · multi-tenant · sem emissão Asaas nesta fase.

-- ---------------------------------------------------------------------------
-- Destinos de carteira/conta por provider (sem credenciais/segredos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_account_provider_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL REFERENCES public.company_financial_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  destination_type text NOT NULL DEFAULT 'WALLET_ID' CHECK (
    destination_type IN ('WALLET_ID', 'EXTERNAL_ACCOUNT_ID', 'OTHER')
  ),
  destination_identifier text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT financial_account_provider_destinations_identifier_chk
    CHECK (length(trim(destination_identifier)) > 0),
  CONSTRAINT financial_account_provider_destinations_provider_chk
    CHECK (length(trim(provider)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fa_provider_destinations_account_provider_type
  ON public.financial_account_provider_destinations (financial_account_id, provider, destination_type);

CREATE INDEX IF NOT EXISTS idx_fa_provider_destinations_company_id
  ON public.financial_account_provider_destinations (company_id);

CREATE INDEX IF NOT EXISTS idx_fa_provider_destinations_account_id
  ON public.financial_account_provider_destinations (financial_account_id);

-- ---------------------------------------------------------------------------
-- Configuração atual do empreendimento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_revenue_split_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT project_revenue_split_configs_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_revenue_split_configs_company_id
  ON public.project_revenue_split_configs (company_id);

CREATE INDEX IF NOT EXISTS idx_project_revenue_split_configs_company_enabled
  ON public.project_revenue_split_configs (company_id, enabled)
  WHERE enabled = true AND status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Participantes da regra viva
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_revenue_split_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.project_revenue_split_configs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  party_kind text NOT NULL CHECK (party_kind IN ('ISSUER', 'OWNER', 'PARTNER', 'SPE')),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  financial_account_id uuid REFERENCES public.company_financial_accounts(id) ON DELETE RESTRICT,
  share_percent numeric(7, 4) NOT NULL CHECK (share_percent > 0 AND share_percent <= 100),
  is_issuer_remainder boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT project_revenue_split_participants_name_chk CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_project_revenue_split_participants_config_id
  ON public.project_revenue_split_participants (config_id);

CREATE INDEX IF NOT EXISTS idx_project_revenue_split_participants_company_id
  ON public.project_revenue_split_participants (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_revenue_split_one_issuer_remainder
  ON public.project_revenue_split_participants (config_id)
  WHERE is_issuer_remainder = true AND active = true;

-- ---------------------------------------------------------------------------
-- Snapshot imutável por venda
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_revenue_split_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  source_config_id uuid REFERENCES public.project_revenue_split_configs(id) ON DELETE SET NULL,
  provider text,
  currency text NOT NULL DEFAULT 'BRL',
  frozen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sale_revenue_split_snapshots_sale_unique UNIQUE (sale_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_revenue_split_snapshots_company_id
  ON public.sale_revenue_split_snapshots (company_id);

CREATE INDEX IF NOT EXISTS idx_sale_revenue_split_snapshots_project_id
  ON public.sale_revenue_split_snapshots (project_id);

CREATE TABLE IF NOT EXISTS public.sale_revenue_split_snapshot_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.sale_revenue_split_snapshots(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_participant_id uuid,
  display_name text NOT NULL,
  party_kind text NOT NULL CHECK (party_kind IN ('ISSUER', 'OWNER', 'PARTNER', 'SPE')),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  financial_account_id uuid,
  destination_provider text,
  destination_type text,
  destination_identifier text,
  share_percent numeric(7, 4) NOT NULL CHECK (share_percent > 0 AND share_percent <= 100),
  is_issuer_remainder boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sale_revenue_split_snapshot_participants_name_chk CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_revenue_split_snapshot_parts_snapshot_id
  ON public.sale_revenue_split_snapshot_participants (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_sale_revenue_split_snapshot_parts_company_id
  ON public.sale_revenue_split_snapshot_participants (company_id);

-- ---------------------------------------------------------------------------
-- Execução por cobrança/parcela (não enviada ao gateway nesta fase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charge_revenue_split_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES public.finance_receipts(id) ON DELETE CASCADE,
  charge_id uuid,
  snapshot_id uuid NOT NULL REFERENCES public.sale_revenue_split_snapshots(id) ON DELETE CASCADE,
  snapshot_participant_id uuid NOT NULL REFERENCES public.sale_revenue_split_snapshot_participants(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_split_id text,
  destination_type text,
  destination_identifier text,
  share_percent numeric(7, 4) NOT NULL CHECK (share_percent > 0 AND share_percent <= 100),
  gross_amount_estimate numeric(14, 2),
  net_amount numeric(14, 2),
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED', 'REFUNDED', 'CANCELLED')
  ),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT charge_revenue_split_legs_provider_chk CHECK (length(trim(provider)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_revenue_split_legs_installment_participant
  ON public.charge_revenue_split_legs (installment_id, snapshot_participant_id);

CREATE INDEX IF NOT EXISTS idx_charge_revenue_split_legs_company_id
  ON public.charge_revenue_split_legs (company_id);

CREATE INDEX IF NOT EXISTS idx_charge_revenue_split_legs_sale_id
  ON public.charge_revenue_split_legs (sale_id);

CREATE INDEX IF NOT EXISTS idx_charge_revenue_split_legs_charge_id
  ON public.charge_revenue_split_legs (charge_id)
  WHERE charge_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Imutabilidade do snapshot (aplicação + banco)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_revenue_split_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sale_revenue_split_snapshots is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_revenue_split_snapshots_immutable
  ON public.sale_revenue_split_snapshots;
CREATE TRIGGER trg_sale_revenue_split_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.sale_revenue_split_snapshots
  FOR EACH ROW
  EXECUTE PROCEDURE public.reject_revenue_split_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_sale_revenue_split_snapshot_participants_immutable
  ON public.sale_revenue_split_snapshot_participants;
CREATE TRIGGER trg_sale_revenue_split_snapshot_participants_immutable
  BEFORE UPDATE OR DELETE ON public.sale_revenue_split_snapshot_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.reject_revenue_split_snapshot_mutation();

-- ---------------------------------------------------------------------------
-- RLS tenant
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_account_provider_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_revenue_split_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_revenue_split_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_revenue_split_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_revenue_split_snapshot_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_revenue_split_legs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_account_provider_destinations_tenant
  ON public.financial_account_provider_destinations;
CREATE POLICY financial_account_provider_destinations_tenant
  ON public.financial_account_provider_destinations
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS project_revenue_split_configs_tenant
  ON public.project_revenue_split_configs;
CREATE POLICY project_revenue_split_configs_tenant
  ON public.project_revenue_split_configs
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS project_revenue_split_participants_tenant
  ON public.project_revenue_split_participants;
CREATE POLICY project_revenue_split_participants_tenant
  ON public.project_revenue_split_participants
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS sale_revenue_split_snapshots_select
  ON public.sale_revenue_split_snapshots;
CREATE POLICY sale_revenue_split_snapshots_select
  ON public.sale_revenue_split_snapshots
  FOR SELECT
  USING (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS sale_revenue_split_snapshots_insert
  ON public.sale_revenue_split_snapshots;
CREATE POLICY sale_revenue_split_snapshots_insert
  ON public.sale_revenue_split_snapshots
  FOR INSERT
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS sale_revenue_split_snapshot_participants_select
  ON public.sale_revenue_split_snapshot_participants;
CREATE POLICY sale_revenue_split_snapshot_participants_select
  ON public.sale_revenue_split_snapshot_participants
  FOR SELECT
  USING (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS sale_revenue_split_snapshot_participants_insert
  ON public.sale_revenue_split_snapshot_participants;
CREATE POLICY sale_revenue_split_snapshot_participants_insert
  ON public.sale_revenue_split_snapshot_participants
  FOR INSERT
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS charge_revenue_split_legs_tenant
  ON public.charge_revenue_split_legs;
CREATE POLICY charge_revenue_split_legs_tenant
  ON public.charge_revenue_split_legs
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

-- OWNER: somente leitura (não administra Split)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'financial_account_provider_destinations',
    'project_revenue_split_configs',
    'project_revenue_split_participants',
    'sale_revenue_split_snapshots',
    'sale_revenue_split_snapshot_participants',
    'charge_revenue_split_legs'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_insert ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_owner_readonly_user())',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_update ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_owner_readonly_user()) WITH CHECK (NOT public.is_owner_readonly_user())',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_delete ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_owner_readonly_user())',
      tbl
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.financial_account_provider_destinations IS
  'Destino de split por provider (ex.: Asaas walletId). Nunca armazena API key nem segredo.';
COMMENT ON TABLE public.project_revenue_split_configs IS
  'Regra atual de distribuição de recebimentos do empreendimento. Ausência = sem split.';
COMMENT ON TABLE public.project_revenue_split_participants IS
  'Participantes da regra viva. Percentual NÃO fica em owner_project_access.';
COMMENT ON TABLE public.sale_revenue_split_snapshots IS
  'Snapshot imutável da regra aplicada à venda. Mudança posterior do empreendimento não altera.';
COMMENT ON TABLE public.sale_revenue_split_snapshot_participants IS
  'Participantes congelados do snapshot da venda.';
COMMENT ON TABLE public.charge_revenue_split_legs IS
  'Execução do split por parcela/cobrança. Fase 1 não envia ao gateway.';
COMMENT ON COLUMN public.charge_revenue_split_legs.gross_amount_estimate IS
  'Estimativa informativa (percentual × valor bruto). O líquido real vem do gateway em fases futuras.';
COMMENT ON COLUMN public.charge_revenue_split_legs.charge_id IS
  'Identificador local da cobrança do provider (ex.: company_asaas_charges.id). Sem FK para não acoplar ao Asaas.';

NOTIFY pgrst, 'reload schema';
