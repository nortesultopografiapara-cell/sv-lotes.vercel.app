-- Logradouros (street_guides) + frente do lote em blocks

ALTER TABLE public.street_guides
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'Rua',
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS width numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS geometry jsonb;

UPDATE public.street_guides
SET geometry = geometry_geojson
WHERE geometry IS NULL AND geometry_geojson IS NOT NULL;

UPDATE public.street_guides
SET type = COALESCE(type, 'Rua'),
    active = COALESCE(active, true),
    name = COALESCE(NULLIF(trim(name), ''), 'Rua/Eixo sem nome')
WHERE name IS NULL OR trim(name) = '';

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS front_street_id uuid REFERENCES public.street_guides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS front_street_name text,
  ADD COLUMN IF NOT EXISTS front_street_type text,
  ADD COLUMN IF NOT EXISTS front_street_width numeric;

CREATE INDEX IF NOT EXISTS idx_blocks_front_street_id ON public.blocks(front_street_id);
CREATE INDEX IF NOT EXISTS idx_street_guides_project_active ON public.street_guides(project_id, active);

NOTIFY pgrst, 'reload schema';
