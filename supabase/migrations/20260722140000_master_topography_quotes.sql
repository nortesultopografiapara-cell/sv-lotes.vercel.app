-- Orçamentos corporativos — SV Topografia & Projetos (Master only)
-- Isolado do tenant: sem FK para customers/projects de loteamento.

CREATE TABLE IF NOT EXISTS public.master_topography_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  client_name text NOT NULL,
  contact_name text NULL,
  phone text NULL,
  email text NULL,
  city text NULL,
  state text NULL,
  address text NULL,
  distance_km numeric NULL,
  category text NOT NULL,
  service_type text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'RASCUNHO',
  proposal_date date NULL,
  expiration_date date NULL,
  estimated_deadline text NULL,
  estimated_value numeric(14, 2) NULL CHECK (estimated_value IS NULL OR estimated_value >= 0),
  discount_value numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  final_value numeric(14, 2) NULL CHECK (final_value IS NULL OR final_value >= 0),
  payment_method text NULL,
  payment_terms text NULL,
  internal_manager text NULL,
  internal_notes text NULL,
  technical_notes text NULL,
  approved_at timestamptz NULL,
  approved_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  converted_project_id uuid NULL REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topography_quotes_code_unique UNIQUE (code),
  CONSTRAINT master_topography_quotes_category_check CHECK (
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
  CONSTRAINT master_topography_quotes_status_check CHECK (
    status IN (
      'RASCUNHO',
      'ENVIADO',
      'EM_NEGOCIACAO',
      'APROVADO',
      'RECUSADO',
      'CANCELADO',
      'EXPIRADO',
      'CONVERTIDO'
    )
  ),
  CONSTRAINT master_topography_quotes_discount_lte_estimated CHECK (
    estimated_value IS NULL OR discount_value <= estimated_value
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_topo_quotes_converted_once
  ON public.master_topography_quotes (converted_project_id)
  WHERE converted_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_status
  ON public.master_topography_quotes (status);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_category
  ON public.master_topography_quotes (category);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_service_type
  ON public.master_topography_quotes (service_type);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_city
  ON public.master_topography_quotes (city);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_archived
  ON public.master_topography_quotes (is_archived);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_created_at
  ON public.master_topography_quotes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_manager
  ON public.master_topography_quotes (internal_manager);

CREATE INDEX IF NOT EXISTS idx_master_topo_quotes_proposal_date
  ON public.master_topography_quotes (proposal_date);

ALTER TABLE public.master_topography_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topography_quotes_super_admin ON public.master_topography_quotes;
CREATE POLICY master_topography_quotes_super_admin ON public.master_topography_quotes
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_quotes IS
  'Orçamentos corporativos da SV Topografia & Projetos — exclusivo SUPER_ADMIN / Master';

CREATE TABLE IF NOT EXISTS public.master_topography_quote_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_topography_quote_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_quote_counters_super_admin
  ON public.master_topography_quote_counters;
CREATE POLICY master_topo_quote_counters_super_admin
  ON public.master_topography_quote_counters
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_topography_quote_code(p_year integer DEFAULT NULL)
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

  INSERT INTO public.master_topography_quote_counters (year, last_number)
  VALUES (y, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.master_topography_quote_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;

  RETURN 'ORC-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_topography_quote_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_quote_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_quote_code(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
