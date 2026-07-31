-- Operação completa (Fase 2): equipe, equipamentos, checklist, ocorrências,
-- despesas, documentos + storage. Não reaplicar migrations 20260904/20260905.

-- ---------------------------------------------------------------------------
-- Colunas de override na OS
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS completion_override_reason text NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS completion_override_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS completion_override_at timestamptz NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS field_requirements_override_reason text NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS field_requirements_override_by uuid NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS field_requirements_override_at timestamptz NULL;

-- ---------------------------------------------------------------------------
-- 1) Equipe
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NULL,
  phone text NULL,
  email text NULL,
  is_lead boolean NOT NULL DEFAULT false,
  planned_start timestamptz NULL,
  planned_end timestamptz NULL,
  attendance_status text NOT NULL DEFAULT 'PLANNED',
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_op_team_name_len CHECK (char_length(trim(name)) > 0),
  CONSTRAINT master_topo_op_team_attendance_check CHECK (
    attendance_status IN ('PLANNED', 'CONFIRMED', 'PRESENT', 'ABSENT', 'CANCELED')
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_team_operation
  ON public.master_topography_operation_team (operation_id)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_master_topo_op_team_lead
  ON public.master_topography_operation_team (operation_id)
  WHERE is_lead = true AND is_archived = false;

ALTER TABLE public.master_topography_operation_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_team_super_admin
  ON public.master_topography_operation_team;
CREATE POLICY master_topo_op_team_super_admin
  ON public.master_topography_operation_team
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_team IS
  'Equipe da Ordem de Serviço — Master Topografia SUPER_ADMIN.';

-- ---------------------------------------------------------------------------
-- 2) Equipamentos vinculados à OS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL
    REFERENCES public.master_topography_equipment(id) ON DELETE RESTRICT,
  reserved_at timestamptz NULL,
  checked_out_at timestamptz NULL,
  returned_at timestamptz NULL,
  condition_out text NULL,
  condition_return text NULL,
  previous_equipment_status text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_op_equip_range CHECK (
    returned_at IS NULL
    OR checked_out_at IS NULL
    OR returned_at >= checked_out_at
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_equip_operation
  ON public.master_topography_operation_equipment (operation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_equip_equipment
  ON public.master_topography_operation_equipment (equipment_id)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_op_equip_active
  ON public.master_topography_operation_equipment (equipment_id, reserved_at, checked_out_at)
  WHERE returned_at IS NULL;

ALTER TABLE public.master_topography_operation_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_equip_super_admin
  ON public.master_topography_operation_equipment;
CREATE POLICY master_topo_op_equip_super_admin
  ON public.master_topography_operation_equipment
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_equipment IS
  'Reserva/retirada/devolução de equipamentos na OS — sincroniza status do patrimônio.';

-- ---------------------------------------------------------------------------
-- 3) Checklist / tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_critical boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING',
  order_index integer NOT NULL DEFAULT 0,
  completed_at timestamptz NULL,
  completed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_op_task_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT master_topo_op_task_status_check CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_tasks_operation
  ON public.master_topography_operation_tasks (operation_id, order_index);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_tasks_pending
  ON public.master_topography_operation_tasks (operation_id)
  WHERE status IN ('PENDING', 'IN_PROGRESS');

ALTER TABLE public.master_topography_operation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_tasks_super_admin
  ON public.master_topography_operation_tasks;
CREATE POLICY master_topo_op_tasks_super_admin
  ON public.master_topography_operation_tasks
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_tasks IS
  'Checklist da Ordem de Serviço — itens críticos obrigatórios bloqueiam COMPLETED sem override.';

-- ---------------------------------------------------------------------------
-- 4) Ocorrências
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'OTHER',
  severity text NOT NULL DEFAULT 'MEDIUM',
  title text NOT NULL,
  description text NULL,
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  action_taken text NULL,
  status text NOT NULL DEFAULT 'OPEN',
  resolved_at timestamptz NULL,
  resolved_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  evidence_document_id uuid NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_op_occ_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT master_topo_op_occ_type_check CHECK (
    type IN ('TECHNICAL', 'SAFETY', 'WEATHER', 'EQUIPMENT', 'CLIENT', 'ACCESS', 'OTHER')
  ),
  CONSTRAINT master_topo_op_occ_severity_check CHECK (
    severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  CONSTRAINT master_topo_op_occ_status_check CHECK (
    status IN ('OPEN', 'IN_ANALYSIS', 'RESOLVED', 'CANCELED')
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_occ_operation
  ON public.master_topography_operation_occurrences (operation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_occ_open
  ON public.master_topography_operation_occurrences (operation_id)
  WHERE status IN ('OPEN', 'IN_ANALYSIS');

ALTER TABLE public.master_topography_operation_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_occ_super_admin
  ON public.master_topography_operation_occurrences;
CREATE POLICY master_topo_op_occ_super_admin
  ON public.master_topography_operation_occurrences
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_occurrences IS
  'Ocorrências de campo da Ordem de Serviço — Master Topografia.';

-- ---------------------------------------------------------------------------
-- 5) Despesas operacionais (sem Conta a Pagar automática)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'OUTROS',
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  expense_date date NOT NULL DEFAULT (timezone('utc'::text, now()))::date,
  supplier text NULL,
  payment_method text NULL,
  receipt_document_id uuid NULL,
  payable_id uuid NULL
    REFERENCES public.master_corporate_payables(id) ON DELETE SET NULL,
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topo_op_exp_desc_len CHECK (char_length(trim(description)) > 0),
  CONSTRAINT master_topo_op_exp_amount_positive CHECK (amount > 0),
  CONSTRAINT master_topo_op_exp_category_check CHECK (
    category IN (
      'COMBUSTIVEL',
      'HOSPEDAGEM',
      'ALIMENTACAO',
      'PEDAGIO',
      'DIARIA',
      'MANUTENCAO_EMERGENCIAL',
      'ALUGUEL',
      'MATERIAL',
      'OUTROS'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_topo_op_exp_payable
  ON public.master_topography_operation_expenses (payable_id)
  WHERE payable_id IS NOT NULL AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_master_topo_op_exp_operation
  ON public.master_topography_operation_expenses (operation_id)
  WHERE is_archived = false;

ALTER TABLE public.master_topography_operation_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_exp_super_admin
  ON public.master_topography_operation_expenses;
CREATE POLICY master_topo_op_exp_super_admin
  ON public.master_topography_operation_expenses
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_expenses IS
  'Despesas da OS — alimentam actual_cost; payable_id reservado (sem auto Conta a Pagar).';

-- ---------------------------------------------------------------------------
-- 6) Documentos da OS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_topography_operation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL
    REFERENCES public.master_topography_operations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'OTHER',
  title text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  file_hash text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT master_topo_op_doc_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT master_topo_op_doc_type_check CHECK (
    type IN (
      'ORDEM_SERVICO',
      'PHOTO',
      'KMZ',
      'KML',
      'PDF',
      'CHECKLIST',
      'REPORT',
      'RECEIPT',
      'TECHNICAL_FILE',
      'OTHER'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_master_topo_op_docs_operation
  ON public.master_topography_operation_documents (operation_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_topo_op_docs_hash
  ON public.master_topography_operation_documents (operation_id, file_hash)
  WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.master_topography_operation_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topo_op_docs_super_admin
  ON public.master_topography_operation_documents;
CREATE POLICY master_topo_op_docs_super_admin
  ON public.master_topography_operation_documents
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_operation_documents IS
  'Documentos da OS — soft delete; Storage bucket master-topography-operations.';

-- FK opcional ocorrência → documento (após tabela docs existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'master_topo_op_occ_evidence_fk'
      AND table_name = 'master_topography_operation_occurrences'
  ) THEN
    ALTER TABLE public.master_topography_operation_occurrences
      ADD CONSTRAINT master_topo_op_occ_evidence_fk
      FOREIGN KEY (evidence_document_id)
      REFERENCES public.master_topography_operation_documents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'master_topo_op_exp_receipt_fk'
      AND table_name = 'master_topography_operation_expenses'
  ) THEN
    ALTER TABLE public.master_topography_operation_expenses
      ADD CONSTRAINT master_topo_op_exp_receipt_fk
      FOREIGN KEY (receipt_document_id)
      REFERENCES public.master_topography_operation_documents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7) Storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-topography-operations', 'master-topography-operations', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "master_topo_ops_storage_select" ON storage.objects;
CREATE POLICY "master_topo_ops_storage_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'master-topography-operations'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_ops_storage_insert" ON storage.objects;
CREATE POLICY "master_topo_ops_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'master-topography-operations'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_ops_storage_update" ON storage.objects;
CREATE POLICY "master_topo_ops_storage_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'master-topography-operations'
  AND public.is_super_admin()
);

DROP POLICY IF EXISTS "master_topo_ops_storage_delete" ON storage.objects;
CREATE POLICY "master_topo_ops_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'master-topography-operations'
  AND public.is_super_admin()
);

NOTIFY pgrst, 'reload schema';
