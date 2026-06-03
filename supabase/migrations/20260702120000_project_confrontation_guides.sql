-- GIS-005: guias de confrontante reutilizáveis por projeto

CREATE TABLE IF NOT EXISTS public.project_confrontation_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  geometry jsonb,
  applies_to text,
  created_by uuid,
  created_at timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_project_confrontation_guides_project
  ON public.project_confrontation_guides(project_id);

COMMENT ON TABLE public.project_confrontation_guides IS
  'Confrontantes manuais reutilizáveis (área remanescente, APP, etc.)';

NOTIFY pgrst, 'reload schema';
