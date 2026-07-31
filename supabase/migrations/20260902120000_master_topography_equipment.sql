-- Equipamentos patrimoniais — SV Topografia & Projetos (Master only)
-- Isolado do tenant: sem FK para customers/projects/companies de loteamento.
-- Fase 1A: estrutura principal (CRUD). Documents/maintenance/assignments em fases posteriores.

CREATE TABLE IF NOT EXISTS public.master_topography_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  manufacturer text NULL,
  model text NULL,
  serial_number text NULL,
  asset_number text NULL,
  purchase_date date NULL,
  purchase_value numeric(14, 2) NULL
    CHECK (purchase_value IS NULL OR purchase_value >= 0),
  warranty_until date NULL,
  supplier text NULL,
  invoice_number text NULL,
  cost_center_id uuid NULL
    REFERENCES public.master_corporate_cost_centers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'AVAILABLE',
  location text NULL,
  responsible_user_id uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL,
  responsible_name text NULL,
  usage_hours numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (usage_hours >= 0),
  last_calibration_date date NULL,
  next_calibration_date date NULL,
  notes text NULL,
  photo_url text NULL,
  qr_payload text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topography_equipment_code_unique UNIQUE (code),
  CONSTRAINT master_topography_equipment_category_check CHECK (
    category IN (
      'DRONE',
      'GNSS',
      'TOTAL_STATION',
      'LEVEL',
      'SCANNER',
      'COMPUTER',
      'NOTEBOOK',
      'PRINTER',
      'PLOTTER',
      'CONTROLLER',
      'ANTENNA',
      'BATTERY',
      'RADIO',
      'ACCESSORY',
      'OTHER'
    )
  ),
  CONSTRAINT master_topography_equipment_status_check CHECK (
    status IN (
      'AVAILABLE',
      'IN_USE',
      'RESERVED',
      'MAINTENANCE',
      'CALIBRATION',
      'DECOMMISSIONED'
    )
  )
);

-- Número de série único quando preenchido (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_topo_equipment_serial_number
  ON public.master_topography_equipment (serial_number)
  WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_status
  ON public.master_topography_equipment (status);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_category
  ON public.master_topography_equipment (category);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_archived
  ON public.master_topography_equipment (is_archived);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_created_at
  ON public.master_topography_equipment (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_location
  ON public.master_topography_equipment (location);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_responsible
  ON public.master_topography_equipment (responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_asset_number
  ON public.master_topography_equipment (asset_number);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_next_calibration
  ON public.master_topography_equipment (next_calibration_date);

CREATE INDEX IF NOT EXISTS idx_master_topo_equipment_cost_center
  ON public.master_topography_equipment (cost_center_id);

ALTER TABLE public.master_topography_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topography_equipment_super_admin
  ON public.master_topography_equipment;
CREATE POLICY master_topography_equipment_super_admin
  ON public.master_topography_equipment
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_equipment IS
  'Equipamentos patrimoniais da SV Topografia & Projetos — exclusivo SUPER_ADMIN / Master';

-- Contador anual para EQP-YYYY-NNNN
CREATE TABLE IF NOT EXISTS public.master_topography_equipment_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_topography_equipment_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_equipment_counters_super_admin
  ON public.master_topography_equipment_counters;
CREATE POLICY master_topo_equipment_counters_super_admin
  ON public.master_topography_equipment_counters
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_topography_equipment_code(
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

  INSERT INTO public.master_topography_equipment_counters (year, last_number)
  VALUES (y, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.master_topography_equipment_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;

  RETURN 'EQP-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_topography_equipment_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_equipment_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_topography_equipment_code(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
