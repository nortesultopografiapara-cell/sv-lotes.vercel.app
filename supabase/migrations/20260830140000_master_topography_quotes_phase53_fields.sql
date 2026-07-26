-- Orçamentos Master Topografia — cronograma, metodologia, profissional e notas de cálculo.
-- Idempotente; compatível com orçamentos antigos (colunas nullable / defaults).

ALTER TABLE public.master_topography_quotes
  ADD COLUMN IF NOT EXISTS mobilization_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS field_duration_text text NULL,
  ADD COLUMN IF NOT EXISTS processing_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS delivery_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS total_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS methodology_notes text NULL,
  ADD COLUMN IF NOT EXISTS professional_name text NULL,
  ADD COLUMN IF NOT EXISTS professional_title text NULL,
  ADD COLUMN IF NOT EXISTS professional_council text NULL,
  ADD COLUMN IF NOT EXISTS professional_registration text NULL,
  ADD COLUMN IF NOT EXISTS professional_registration_uf text NULL;

ALTER TABLE public.master_topography_quote_items
  ADD COLUMN IF NOT EXISTS calculation_notes text NULL;

COMMENT ON COLUMN public.master_topography_quotes.mobilization_deadline_text IS
  'Prazo/fase de mobilização (texto livre).';
COMMENT ON COLUMN public.master_topography_quotes.field_duration_text IS
  'Duração/fase de campo (texto livre).';
COMMENT ON COLUMN public.master_topography_quotes.processing_deadline_text IS
  'Prazo/fase de processamento (texto livre).';
COMMENT ON COLUMN public.master_topography_quotes.delivery_deadline_text IS
  'Prazo/fase de entrega (texto livre).';
COMMENT ON COLUMN public.master_topography_quotes.total_deadline_text IS
  'Prazo global estruturado (texto livre); fallback estimado_deadline se vazio.';
COMMENT ON COLUMN public.master_topography_quotes.methodology_notes IS
  'Metodologia (texto livre); distinta de technical_notes.';
COMMENT ON COLUMN public.master_topography_quotes.professional_name IS
  'Snapshot do profissional responsável (PDF analítico).';
COMMENT ON COLUMN public.master_topography_quote_items.calculation_notes IS
  'Justificativa/premissas do item na memória de cálculo.';
