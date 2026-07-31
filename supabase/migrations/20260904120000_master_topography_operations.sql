-- Operações / Ordens de serviço — SV Topografia & Projetos (Master only)
-- Fase 1A: estrutura principal (CRUD + status). Equipe/equipamentos/checklist em fases posteriores.
-- Isolado do tenant: sem FK para customers/projects/companies de loteamento.

CREATE TABLE IF NOT EXISTS public.master_topography_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  description text NULL,
  project_id uuid NULL
    REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  quote_id uuid NULL
    REFERENCES public.master_topography_quotes(id) ON DELETE SET NULL,
  client_name text NULL,
  service_type text NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  priority text NOT NULL DEFAULT 'NORMAL',
  scheduled_start timestamptz NULL,
  scheduled_end timestamptz NULL,
  actual_start timestamptz NULL,
  actual_end timestamptz NULL,
  location_name text NULL,
  address text NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  responsible_user_id uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,
  responsible_name text NULL,
  estimated_cost numeric(14, 2) NULL
    CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost numeric(14, 2) NULL
    CHECK (actual_cost IS NULL OR actual_cost >= 0),
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topography_operations_code_unique UNIQUE (code),
  CONSTRAINT master_topography_operations_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT master_topography_operations_status_check CHECK (
    status IN (
      'DRAFT',
      'PLANNED',
      'SCHEDULED',
      'IN_FIELD',
      'PROCESSING',
      'WAITING_CLIENT',
      'COMPLETED',
      'CANCELED'
    )
  ),
  CONSTRAINT master_topography_operations_priority_check CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ),
  CONSTRAINT master_topography_operations_scheduled_range CHECK (
    scheduled_start IS NULL
    OR scheduled_end IS NULL
    OR scheduled_end >= scheduled_start
  ),
  CONSTRAINT master_topography_operations_actual_range CHECK (
    actual_start IS NULL
    OR actual_end IS NULL
    OR actual_end >= actual_start
  ),
  CONSTRAINT master_topography_operations_lat_range CHECK (
    latitude IS NULL OR (latitude >= -90 AND latitude <= 90)
  ),
  CONSTRAINT master_topography_operations_lng_range CHECK (
    longitude IS NULL OR (longitude >= -180 AND longitude <= 180)
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_status
  ON public.master_topography_operations (status);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_priority
  ON public.master_topography_operations (priority);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_archived
  ON public.master_topography_operations (is_archived);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_created_at
  ON public.master_topography_operations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_scheduled_start
  ON public.master_topography_operations (scheduled_start);

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_project
  ON public.master_topography_operations (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_quote
  ON public.master_topography_operations (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_responsible
  ON public.master_topography_operations (responsible_user_id)
  WHERE responsible_user_id IS NOT NULL;

ALTER TABLE public.master_topography_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topography_operations_super_admin
  ON public.master_topography_operations;
CREATE POLICY master_topography_operations_super_admin
  ON public.master_topography_operations
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operations IS
  'Operações / ordens de serviço de campo — SV Topografia & Projetos — exclusivo SUPER_ADMIN / Master. Código OS-YYYY-NNNN.';

-- Contador anual para OS-YYYY-NNNN
CREATE TABLE IF NOT EXISTS public.master_topography_operation_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_topography_operation_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_operation_counters_super_admin
  ON public.master_topography_operation_counters;
CREATE POLICY master_topo_operation_counters_super_admin
  ON public.master_topography_operation_counters
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_topography_operation_code(
  p_year integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer;
  next_num integer;
BEGIN
  y := COALESCE(p_year, EXTRACT(YEAR FROM timezone('utc'::text, now()))::integer);

  INSERT INTO public.master_topography_operation_counters (year, last_number)
  VALUES (y, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.master_topography_operation_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;

  RETURN 'OS-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_topography_operation_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_operation_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_operation_code(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
