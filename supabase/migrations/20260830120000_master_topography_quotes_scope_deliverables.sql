-- Escopo técnico e entregáveis estruturados nos orçamentos Master Topografia.
-- Snapshot jsonb no próprio orçamento (preserva histórico; Equipamentos ainda é placeholder).

ALTER TABLE public.master_topography_quotes
  ADD COLUMN IF NOT EXISTS technical_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deliverables jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.master_topography_quotes
  DROP CONSTRAINT IF EXISTS master_topo_quotes_technical_resources_is_array;

ALTER TABLE public.master_topography_quotes
  ADD CONSTRAINT master_topo_quotes_technical_resources_is_array
  CHECK (jsonb_typeof(technical_resources) = 'array');

ALTER TABLE public.master_topography_quotes
  DROP CONSTRAINT IF EXISTS master_topo_quotes_deliverables_is_array;

ALTER TABLE public.master_topography_quotes
  ADD CONSTRAINT master_topo_quotes_deliverables_is_array
  CHECK (jsonb_typeof(deliverables) = 'array');

COMMENT ON COLUMN public.master_topography_quotes.technical_resources IS
  'Snapshot ordenado de equipamentos/recursos técnicos [{id,label,source}].';

COMMENT ON COLUMN public.master_topography_quotes.deliverables IS
  'Snapshot ordenado de produtos/dados entregues [{id,label,source}].';
