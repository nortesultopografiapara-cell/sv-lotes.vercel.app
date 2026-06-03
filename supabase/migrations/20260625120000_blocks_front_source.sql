-- Origem da frente oficial do lote (manual | street_guide | auto)
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS front_source text;

COMMENT ON COLUMN public.blocks.front_source IS
  'Origem da frente: manual, street_guide, auto';
