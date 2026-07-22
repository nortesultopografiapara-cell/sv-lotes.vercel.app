-- Fase 5.1 — Estrutura de etapas/itens + BDI (Master Topografia — exclusivo SUPER_ADMIN)

ALTER TABLE public.master_topography_quotes
  ADD COLUMN IF NOT EXISTS title text NULL,
  ADD COLUMN IF NOT EXISTS bdi_percent numeric(8, 4) NOT NULL DEFAULT 0
    CHECK (bdi_percent >= 0 AND bdi_percent <= 1000),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(8, 4) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100);

COMMENT ON COLUMN public.master_topography_quotes.title IS
  'Título executivo do orçamento (Master Topografia)';
COMMENT ON COLUMN public.master_topography_quotes.bdi_percent IS
  'Percentual de BDI aplicado aos itens do orçamento';
COMMENT ON COLUMN public.master_topography_quotes.discount_percent IS
  'Percentual de desconto sobre o total com BDI';

CREATE TABLE IF NOT EXISTS public.master_topography_quote_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.master_topography_quotes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_quote_stages_name_len CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_quote_stages_quote
  ON public.master_topography_quote_stages (quote_id, sort_order);

ALTER TABLE public.master_topography_quote_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_quote_stages_super_admin
  ON public.master_topography_quote_stages;
CREATE POLICY master_topo_quote_stages_super_admin
  ON public.master_topography_quote_stages
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_quote_stages IS
  'Etapas de orçamento — SV Topografia & Projetos (Master only)';

CREATE TABLE IF NOT EXISTS public.master_topography_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.master_topography_quotes(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.master_topography_quote_stages(id) ON DELETE CASCADE,
  code text NULL,
  price_bank text NULL,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'UN',
  quantity numeric(18, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_value numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_quote_items_price_bank_check CHECK (
    price_bank IS NULL OR price_bank IN (
      'PROPRIO',
      'SINAPI',
      'SICRO',
      'ORSE',
      'SEDOP',
      'SEINFRA',
      'OUTRO'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_quote_items_stage
  ON public.master_topography_quote_items (stage_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_master_topo_quote_items_quote
  ON public.master_topography_quote_items (quote_id);

CREATE INDEX IF NOT EXISTS idx_master_topo_quote_items_price_bank
  ON public.master_topography_quote_items (price_bank);

ALTER TABLE public.master_topography_quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_quote_items_super_admin
  ON public.master_topography_quote_items;
CREATE POLICY master_topo_quote_items_super_admin
  ON public.master_topography_quote_items
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_quote_items IS
  'Itens de orçamento — preparado para bancos de preços futuros (Master only)';
COMMENT ON COLUMN public.master_topography_quote_items.price_bank IS
  'Origem do preço (SINAPI/SICRO/etc.) — integração futura; PROPRIO = item próprio';
COMMENT ON COLUMN public.master_topography_quote_items.unit_value IS
  'Valor unitário sem BDI';

NOTIFY pgrst, 'reload schema';
