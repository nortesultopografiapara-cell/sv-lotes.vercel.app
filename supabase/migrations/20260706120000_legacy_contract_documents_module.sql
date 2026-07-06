-- Módulo Contratos Antigos — campos de gestão, vínculo e soft delete.
-- Idempotente: seguro reaplicar.

ALTER TABLE public.legacy_contract_documents
  ADD COLUMN IF NOT EXISTS quadra text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy_migration',
  ADD COLUMN IF NOT EXISTS migration_id uuid REFERENCES public.data_migration_history(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.legacy_contract_documents.link_type IS
  'automatic = venda localizada na migração; manual = vinculado manualmente no assistente';

COMMENT ON COLUMN public.legacy_contract_documents.source IS
  'Origem do documento — legacy_migration para importação via Migração de Dados';

CREATE INDEX IF NOT EXISTS legacy_contract_documents_project_id_idx
  ON public.legacy_contract_documents(project_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS legacy_contract_documents_migration_id_idx
  ON public.legacy_contract_documents(migration_id)
  WHERE migration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS legacy_contract_documents_active_company_idx
  ON public.legacy_contract_documents(company_id, created_at DESC)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS legacy_contract_documents_link_type_idx
  ON public.legacy_contract_documents(company_id, link_type)
  WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
