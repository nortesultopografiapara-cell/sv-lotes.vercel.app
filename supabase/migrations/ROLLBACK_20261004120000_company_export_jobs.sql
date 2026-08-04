-- ROLLBACK (NÃO EXECUTAR sem autorização explícita)
-- Reverte somente objetos criados pela migration F0 company_export_jobs.
-- Ordem: policies storage → policies table → bucket (se vazio) → indexes → table.

DROP POLICY IF EXISTS company_exports_super_admin_select ON storage.objects;
DROP POLICY IF EXISTS company_exports_super_admin_insert ON storage.objects;
DROP POLICY IF EXISTS company_exports_super_admin_update ON storage.objects;
DROP POLICY IF EXISTS company_exports_super_admin_delete ON storage.objects;

DROP POLICY IF EXISTS company_export_jobs_super_admin_all ON public.company_export_jobs;

-- Remover bucket somente se estiver vazio
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'company-exports'
  ) AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'company-exports' LIMIT 1
  ) THEN
    DELETE FROM storage.buckets WHERE id = 'company-exports';
  END IF;
END $$;

DROP INDEX IF EXISTS public.company_export_jobs_status_created_idx;
DROP INDEX IF EXISTS public.company_export_jobs_expires_at_idx;
DROP INDEX IF EXISTS public.company_export_jobs_created_at_idx;
DROP INDEX IF EXISTS public.company_export_jobs_status_idx;
DROP INDEX IF EXISTS public.company_export_jobs_company_id_idx;

DROP TABLE IF EXISTS public.company_export_jobs;
