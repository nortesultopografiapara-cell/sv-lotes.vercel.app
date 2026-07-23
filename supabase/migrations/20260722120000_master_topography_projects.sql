-- Projetos e Serviços corporativos — SV Topografia & Projetos (Master only)
-- Isolado do tenant: sem FK para customers/projects/companies de loteamento.

CREATE TABLE IF NOT EXISTS public.master_topography_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  client_name text NOT NULL,
  client_contact_name text NULL,
  client_phone text NULL,
  client_email text NULL,
  category text NOT NULL,
  service_type text NOT NULL,
  origin text NULL,
  description text NULL,
  status text NOT NULL,
  priority text NOT NULL DEFAULT 'NORMAL',
  financial_situation text NOT NULL DEFAULT 'NAO_FATURADO',
  city text NULL,
  state text NULL,
  address text NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  distance_from_parauapebas_km numeric NULL,
  contract_date date NULL,
  planned_start_date date NULL,
  planned_end_date date NULL,
  actual_end_date date NULL,
  contract_value numeric(14, 2) NULL CHECK (contract_value IS NULL OR contract_value >= 0),
  payment_terms text NULL,
  origin_budget_number text NULL,
  internal_manager text NULL,
  technical_manager text NULL,
  team_notes text NULL,
  progress_percent integer NOT NULL DEFAULT 0
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  physical_progress_percent integer NOT NULL DEFAULT 0
    CHECK (physical_progress_percent >= 0 AND physical_progress_percent <= 100),
  current_stage text NULL,
  technical_notes text NULL,
  pending_items text NULL,
  next_action text NULL,
  next_action_date date NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topography_projects_code_unique UNIQUE (code),
  CONSTRAINT master_topography_projects_category_check CHECK (
    category IN (
      'TOPOGRAFIA',
      'GEORREFERENCIAMENTO',
      'DRONE',
      'LIDAR',
      'PROJETOS',
      'REGULARIZACAO',
      'OBRAS',
      'CONSULTORIA'
    )
  ),
  CONSTRAINT master_topography_projects_priority_check CHECK (
    priority IN ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')
  ),
  CONSTRAINT master_topography_projects_origin_check CHECK (
    origin IS NULL OR origin IN (
      'SITE',
      'WHATSAPP',
      'INSTAGRAM',
      'FACEBOOK',
      'INDICACAO',
      'CLIENTE_ANTIGO',
      'COMERCIAL',
      'OUTRO'
    )
  ),
  CONSTRAINT master_topography_projects_financial_check CHECK (
    financial_situation IN ('NAO_FATURADO', 'PARCIAL', 'FATURADO', 'RECEBIDO')
  ),
  CONSTRAINT master_topography_projects_status_check CHECK (
    status IN (
      'RASCUNHO',
      'PROPOSTA',
      'AGUARDANDO_APROVACAO',
      'APROVADO',
      'PLANEJAMENTO',
      'EM_MOBILIZACAO',
      'EM_CAMPO',
      'EM_PROCESSAMENTO',
      'EM_ANALISE',
      'AGUARDANDO_CLIENTE',
      'AGUARDANDO_DOCUMENTACAO',
      'EM_EXECUCAO',
      'PAUSADO',
      'CONCLUIDO',
      'CANCELADO',
      'ARQUIVADO'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_status
  ON public.master_topography_projects (status);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_category
  ON public.master_topography_projects (category);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_service_type
  ON public.master_topography_projects (service_type);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_city
  ON public.master_topography_projects (city);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_priority
  ON public.master_topography_projects (priority);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_archived
  ON public.master_topography_projects (is_archived);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_created_at
  ON public.master_topography_projects (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_planned_end
  ON public.master_topography_projects (planned_end_date);

CREATE INDEX IF NOT EXISTS idx_master_topo_projects_internal_manager
  ON public.master_topography_projects (internal_manager);

ALTER TABLE public.master_topography_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topography_projects_super_admin ON public.master_topography_projects;
CREATE POLICY master_topography_projects_super_admin ON public.master_topography_projects
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_projects IS
  'Projetos e Serviços corporativos da SV Topografia & Projetos — exclusivo SUPER_ADMIN / Master';

-- Contador anual para PRJ-YYYY-NNNN
CREATE TABLE IF NOT EXISTS public.master_topography_project_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_topography_project_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_project_counters_super_admin
  ON public.master_topography_project_counters;
CREATE POLICY master_topo_project_counters_super_admin
  ON public.master_topography_project_counters
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_topography_project_code(p_year integer DEFAULT NULL)
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

  INSERT INTO public.master_topography_project_counters (year, last_number)
  VALUES (y, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.master_topography_project_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;

  RETURN 'PRJ-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_topography_project_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_project_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_project_code(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
