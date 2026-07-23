-- Fase 5.2 — Banco de Preços Inteligente + Catálogo (Master Topografia — exclusivo SUPER_ADMIN)

-- Extensão para busca rápida por descrição (se disponível)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Bancos cadastráveis (novos bancos sem alterar código)
CREATE TABLE IF NOT EXISTS public.master_topography_price_databases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_price_db_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_db_active
  ON public.master_topography_price_databases (is_active, sort_order);

ALTER TABLE public.master_topography_price_databases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_price_db_super_admin ON public.master_topography_price_databases;
CREATE POLICY master_topo_price_db_super_admin ON public.master_topography_price_databases
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

INSERT INTO public.master_topography_price_databases (code, label, sort_order) VALUES
  ('SINAPI', 'SINAPI', 10),
  ('SICRO', 'SICRO', 20),
  ('SBC', 'SBC', 30),
  ('ORSE', 'ORSE', 40),
  ('SEDOP', 'SEDOP', 50),
  ('SEINFRA', 'SEINFRA', 60),
  ('SETOP', 'SETOP', 70),
  ('IOPES', 'IOPES', 80),
  ('SIURB', 'SIURB', 90),
  ('SIURB_INFRA', 'SIURB INFRA', 100),
  ('SUDECAP', 'SUDECAP', 110),
  ('CPOS_CDHU', 'CPOS/CDHU', 120),
  ('FDE', 'FDE', 130),
  ('AGESUL', 'AGESUL', 140),
  ('AGETOP_CIVIL', 'AGETOP CIVIL', 150),
  ('AGETOP_RODOVIARIA', 'AGETOP RODOVIÁRIA', 160),
  ('CAEMA', 'CAEMA', 170),
  ('EMBASA', 'EMBASA', 180),
  ('CAERN', 'CAERN', 190),
  ('COMPESA', 'COMPESA', 200),
  ('EMOP', 'EMOP', 210),
  ('DERPR', 'DERPR', 220),
  ('SCO', 'SCO', 230),
  ('PROPRIO', 'PRÓPRIO', 900)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  updated_at = timezone('utc'::text, now());

-- Imports de planilhas oficiais (mecanismo; sem conexão automática a órgãos)
CREATE TABLE IF NOT EXISTS public.master_topography_price_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id uuid NULL REFERENCES public.master_topography_price_databases(id) ON DELETE SET NULL,
  bank_code text NOT NULL,
  uf text NULL,
  competence text NULL,
  version text NULL,
  source_filename text NULL,
  source_origin text NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  rows_total integer NOT NULL DEFAULT 0,
  rows_ok integer NOT NULL DEFAULT 0,
  rows_error integer NOT NULL DEFAULT 0,
  error_log text NULL,
  imported_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_imports_bank
  ON public.master_topography_price_imports (bank_code, created_at DESC);

ALTER TABLE public.master_topography_price_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_price_imports_super_admin ON public.master_topography_price_imports;
CREATE POLICY master_topo_price_imports_super_admin ON public.master_topography_price_imports
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Catálogo de composições / preços oficiais
CREATE TABLE IF NOT EXISTS public.master_topography_price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id uuid NULL REFERENCES public.master_topography_price_databases(id) ON DELETE SET NULL,
  bank_code text NOT NULL,
  uf text NULL,
  competence text NULL,
  code text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'UN',
  reference_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (reference_price >= 0),
  origin text NULL,
  item_type text NULL DEFAULT 'COMPOSICAO',
  version text NULL,
  import_id uuid NULL REFERENCES public.master_topography_price_imports(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_items_bank_code
  ON public.master_topography_price_items (bank_code, code);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_items_active_bank
  ON public.master_topography_price_items (is_active, bank_code);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_items_desc_trgm
  ON public.master_topography_price_items USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_master_topo_price_items_code_trgm
  ON public.master_topography_price_items USING gin (code gin_trgm_ops);

ALTER TABLE public.master_topography_price_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_price_items_super_admin ON public.master_topography_price_items;
CREATE POLICY master_topo_price_items_super_admin ON public.master_topography_price_items
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Itens próprios reutilizáveis
CREATE TABLE IF NOT EXISTS public.master_topography_custom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  category text NULL,
  unit text NOT NULL DEFAULT 'UN',
  price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (price >= 0),
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_custom_items_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_custom_items_desc_trgm
  ON public.master_topography_custom_items USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_master_topo_custom_items_active
  ON public.master_topography_custom_items (is_active);

ALTER TABLE public.master_topography_custom_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_custom_items_super_admin ON public.master_topography_custom_items;
CREATE POLICY master_topo_custom_items_super_admin ON public.master_topography_custom_items
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Ampliar itens do orçamento: preço referência vs adotado
ALTER TABLE public.master_topography_quote_items
  DROP CONSTRAINT IF EXISTS master_topo_quote_items_price_bank_check;

ALTER TABLE public.master_topography_quote_items
  ADD COLUMN IF NOT EXISTS reference_price numeric(18, 4) NULL CHECK (reference_price IS NULL OR reference_price >= 0),
  ADD COLUMN IF NOT EXISTS adopted_price numeric(18, 4) NULL CHECK (adopted_price IS NULL OR adopted_price >= 0),
  ADD COLUMN IF NOT EXISTS competence text NULL,
  ADD COLUMN IF NOT EXISTS uf text NULL,
  ADD COLUMN IF NOT EXISTS notes text NULL,
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid NULL
    REFERENCES public.master_topography_price_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_item_id uuid NULL
    REFERENCES public.master_topography_custom_items(id) ON DELETE SET NULL;

UPDATE public.master_topography_quote_items
SET
  reference_price = COALESCE(reference_price, unit_value, 0),
  adopted_price = COALESCE(adopted_price, unit_value, 0)
WHERE reference_price IS NULL OR adopted_price IS NULL;

ALTER TABLE public.master_topography_quote_items
  ALTER COLUMN reference_price SET DEFAULT 0,
  ALTER COLUMN adopted_price SET DEFAULT 0;

-- Snapshot de preços do item no orçamento
CREATE TABLE IF NOT EXISTS public.master_topography_budget_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.master_topography_quotes(id) ON DELETE CASCADE,
  quote_item_id uuid NOT NULL REFERENCES public.master_topography_quote_items(id) ON DELETE CASCADE,
  reference_price numeric(18, 4) NOT NULL DEFAULT 0,
  adopted_price numeric(18, 4) NOT NULL DEFAULT 0,
  difference_percent numeric(12, 4) NOT NULL DEFAULT 0,
  difference_value numeric(18, 4) NOT NULL DEFAULT 0,
  competence text NULL,
  uf text NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_budget_item_prices_item_unique UNIQUE (quote_item_id)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_budget_item_prices_quote
  ON public.master_topography_budget_item_prices (quote_id);

ALTER TABLE public.master_topography_budget_item_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_budget_item_prices_super_admin
  ON public.master_topography_budget_item_prices;
CREATE POLICY master_topo_budget_item_prices_super_admin
  ON public.master_topography_budget_item_prices
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Histórico de alterações de itens do orçamento
CREATE TABLE IF NOT EXISTS public.master_topography_budget_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.master_topography_quotes(id) ON DELETE CASCADE,
  quote_item_id uuid NULL REFERENCES public.master_topography_quote_items(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  old_value text NULL,
  new_value text NULL,
  changed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_master_topo_budget_item_history_quote
  ON public.master_topography_budget_item_history (quote_id, created_at DESC);

ALTER TABLE public.master_topography_budget_item_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_topo_budget_item_history_super_admin
  ON public.master_topography_budget_item_history;
CREATE POLICY master_topo_budget_item_history_super_admin
  ON public.master_topography_budget_item_history
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Margem no cabeçalho do orçamento
ALTER TABLE public.master_topography_quotes
  ADD COLUMN IF NOT EXISTS margin_percent numeric(8, 4) NOT NULL DEFAULT 0
    CHECK (margin_percent >= -1000 AND margin_percent <= 1000);

COMMENT ON TABLE public.master_topography_price_databases IS
  'Bancos de preços oficiais — Master Topografia (extensível sem alterar código)';
COMMENT ON TABLE public.master_topography_price_items IS
  'Catálogo de composições importadas — Master Topografia';
COMMENT ON TABLE public.master_topography_price_imports IS
  'Fila/histórico de importação de planilhas oficiais — sem conexão automática a órgãos';
COMMENT ON TABLE public.master_topography_custom_items IS
  'Itens próprios reutilizáveis — Master Topografia';
COMMENT ON TABLE public.master_topography_budget_item_prices IS
  'Snapshot preço referência vs adotado por item de orçamento';
COMMENT ON TABLE public.master_topography_budget_item_history IS
  'Histórico de alterações de itens de orçamento';

-- Seed mínimo para pesquisa inteligente (homologação)
INSERT INTO public.master_topography_price_items
  (bank_code, uf, competence, code, description, unit, reference_price, origin, item_type, version)
SELECT v.bank_code, v.uf, v.competence, v.code, v.description, v.unit, v.reference_price, v.origin, v.item_type, v.version
FROM (VALUES
  ('PROPRIO', 'PA', '2026-07', 'TP-001', 'Levantamento topográfico planimétrico', 'ha', 3500.00, 'SEED', 'SERVICO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'TP-002', 'Levantamento planialtimétrico', 'ha', 4800.00, 'SEED', 'SERVICO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'TP-003', 'Georreferenciamento de imóvel rural SIGEF/INCRA', 'un', 5200.00, 'SEED', 'SERVICO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'TP-004', 'Implantação de marco geodésico', 'un', 850.00, 'SEED', 'SERVICO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'TP-005', 'Demarcação de lotes', 'un', 120.00, 'SEED', 'SERVICO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'OB-010', 'Terraplanagem — corte e aterro', 'm³', 28.50, 'SEED', 'COMPOSICAO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'OB-020', 'Drenagem superficial — meio-fio', 'm', 95.00, 'SEED', 'COMPOSICAO', '1.0'),
  ('PROPRIO', 'PA', '2026-07', 'OB-030', 'Pavimentação asfáltica CBUQ', 'm²', 145.00, 'SEED', 'COMPOSICAO', '1.0'),
  ('SINAPI', 'PA', '2026-06', '87478', 'Serviço de topografia — referência SINAPI (seed)', 'un', 2100.00, 'SEED', 'COMPOSICAO', '2026-06'),
  ('SICRO', 'PA', '2026-06', '4012345', 'Serviço de sinalização viária — referência SICRO (seed)', 'm', 42.00, 'SEED', 'COMPOSICAO', '2026-06')
) AS v(bank_code, uf, competence, code, description, unit, reference_price, origin, item_type, version)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_topography_price_items i
  WHERE i.bank_code = v.bank_code AND i.code = v.code AND i.competence = v.competence
);

NOTIFY pgrst, 'reload schema';
