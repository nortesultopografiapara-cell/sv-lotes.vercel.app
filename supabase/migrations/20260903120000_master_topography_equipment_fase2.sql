-- Equipamentos patrimoniais — Fase 2
-- Documentos + Storage, manutenções/calibrações, movimentações (assignments).
-- Timeline agregada na aplicação; alertas calculados (sem tabela).
-- Isolado do tenant; exclusivo SUPER_ADMIN / Master.

-- ---------------------------------------------------------------------------
-- 1) Manutenções / calibrações
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL
    REFERENCES public.master_topography_equipment(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED',
  description text NOT NULL,
  supplier text NULL,
  scheduled_at date NULL,
  performed_at date NULL,
  cost numeric(14, 2) NULL
    CHECK (cost IS NULL OR cost >= 0),
  next_review_at date NULL,
  parts text NULL,
  notes text NULL,
  payable_id uuid NULL
    REFERENCES public.master_corporate_payables(id) ON DELETE SET NULL,
  previous_equipment_status text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_equip_maint_tipo_check CHECK (
    tipo IN (
      'PREVENTIVE',
      'CORRECTIVE',
      'CALIBRATION',
      'PARTS_REPLACEMENT',
      'INSPECTION',
      'FIRMWARE_UPDATE',
      'OTHER'
    )
  ),
  CONSTRAINT master_topo_equip_maint_status_check CHECK (
    status IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELED')
  ),
  CONSTRAINT master_topo_equip_maint_desc_len CHECK (char_length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_maint_equipment
  ON public.master_topography_equipment_maintenance (equipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_maint_status
  ON public.master_topography_equipment_maintenance (status)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_maint_next_review
  ON public.master_topography_equipment_maintenance (next_review_at)
  WHERE is_archived = false AND next_review_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_maint_scheduled
  ON public.master_topography_equipment_maintenance (scheduled_at)
  WHERE is_archived = false AND scheduled_at IS NOT NULL;

ALTER TABLE public.master_topography_equipment_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_equip_maint_super_admin
  ON public.master_topography_equipment_maintenance;
CREATE POLICY master_topo_equip_maint_super_admin
  ON public.master_topography_equipment_maintenance
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_equipment_maintenance IS
  'Manutenções e calibrações de equipamentos patrimoniais — Master SUPER_ADMIN. payable_id reservado para integração futura com Contas a Pagar.';

-- ---------------------------------------------------------------------------
-- 2) Documentos / fotos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_equipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL
    REFERENCES public.master_topography_equipment(id) ON DELETE CASCADE,
  maintenance_id uuid NULL
    REFERENCES public.master_topography_equipment_maintenance(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0
    CHECK (file_size > 0),
  content_hash text NULL,
  issued_at date NULL,
  valid_until date NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT master_topo_equip_docs_tipo_check CHECK (
    tipo IN (
      'INVOICE',
      'MANUAL',
      'WARRANTY',
      'CERTIFICATE',
      'ANAC',
      'ANATEL',
      'PHOTO',
      'REPORT',
      'CALIBRATION',
      'OTHER'
    )
  ),
  CONSTRAINT master_topo_equip_docs_titulo_len CHECK (char_length(trim(titulo)) > 0),
  CONSTRAINT master_topo_equip_docs_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_docs_equipment
  ON public.master_topography_equipment_documents (equipment_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_docs_valid_until
  ON public.master_topography_equipment_documents (valid_until)
  WHERE deleted_at IS NULL AND valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_docs_maintenance
  ON public.master_topography_equipment_documents (maintenance_id)
  WHERE deleted_at IS NULL AND maintenance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_topo_equip_docs_content_hash
  ON public.master_topography_equipment_documents (equipment_id, content_hash)
  WHERE deleted_at IS NULL AND content_hash IS NOT NULL;

ALTER TABLE public.master_topography_equipment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_equip_docs_super_admin
  ON public.master_topography_equipment_documents;
CREATE POLICY master_topo_equip_docs_super_admin
  ON public.master_topography_equipment_documents
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_equipment_documents IS
  'Documentos e fotos de equipamentos patrimoniais — soft delete via deleted_at; Storage bucket master-topography-equipment.';

-- ---------------------------------------------------------------------------
-- 3) Movimentações (assignments) — append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_equipment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL
    REFERENCES public.master_topography_equipment(id) ON DELETE CASCADE,
  from_responsible_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  from_responsible_name text NULL,
  to_responsible_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  to_responsible_name text NULL,
  from_location text NULL,
  to_location text NULL,
  project_id uuid NULL
    REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  moved_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  reason text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_assign_equipment
  ON public.master_topography_equipment_assignments (equipment_id, moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_equip_assign_project
  ON public.master_topography_equipment_assignments (project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.master_topography_equipment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_equip_assign_super_admin
  ON public.master_topography_equipment_assignments;
CREATE POLICY master_topo_equip_assign_super_admin
  ON public.master_topography_equipment_assignments
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_equipment_assignments IS
  'Histórico append-only de responsável/localização de equipamentos — Master SUPER_ADMIN.';

-- ---------------------------------------------------------------------------
-- 4) Storage bucket + policies
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-topography-equipment', 'master-topography-equipment', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "master_topo_equip_storage_select" ON storage.objects;
CREATE POLICY "master_topo_equip_storage_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'master-topography-equipment'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_equip_storage_insert" ON storage.objects;
CREATE POLICY "master_topo_equip_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'master-topography-equipment'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_equip_storage_update" ON storage.objects;
CREATE POLICY "master_topo_equip_storage_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'master-topography-equipment'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_equip_storage_delete" ON storage.objects;
CREATE POLICY "master_topo_equip_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'master-topography-equipment'
  AND public.is_super_admin()
);

NOTIFY pgrst, 'reload schema';
