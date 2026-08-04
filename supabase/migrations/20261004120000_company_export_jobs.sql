-- Company data export jobs (Master SUPER_ADMIN) — F0
-- Idempotent · additive only · no destructive statements · no backfill
-- Authorized for shared Preview/Production Supabase (DDL only; app prod unchanged)

CREATE TABLE IF NOT EXISTS public.company_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (
    reason IN ('OFFBOARDING', 'CLIENT_REQUEST', 'MIGRATION', 'BACKUP', 'OTHER')
  ),
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')
  ),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step text,
  step_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  records_exported integer NOT NULL DEFAULT 0,
  files_exported integer NOT NULL DEFAULT 0,
  total_size bigint NOT NULL DEFAULT 0,
  storage_bucket text,
  storage_path text,
  signed_url_expires_at timestamptz,
  error_message text,
  manifest jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS company_export_jobs_company_id_idx
  ON public.company_export_jobs(company_id);

CREATE INDEX IF NOT EXISTS company_export_jobs_status_idx
  ON public.company_export_jobs(status);

CREATE INDEX IF NOT EXISTS company_export_jobs_created_at_idx
  ON public.company_export_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS company_export_jobs_expires_at_idx
  ON public.company_export_jobs(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS company_export_jobs_status_created_idx
  ON public.company_export_jobs(status, created_at ASC)
  WHERE status IN ('PENDING', 'PROCESSING');

COMMENT ON TABLE public.company_export_jobs IS
  'Jobs de exportação completa de dados de empresa (Master SUPER_ADMIN). F1 = tabular.';

ALTER TABLE public.company_export_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_export_jobs'
      AND policyname = 'company_export_jobs_super_admin_all'
  ) THEN
    CREATE POLICY company_export_jobs_super_admin_all
      ON public.company_export_jobs
      FOR ALL
      USING (public.is_super_admin())
      WITH CHECK (public.is_super_admin());
  END IF;
END $$;

-- Private bucket for export packages (staging + package.zip)
-- UPSERT authorized only to keep this new bucket private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-exports', 'company-exports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'company_exports_super_admin_select'
  ) THEN
    CREATE POLICY company_exports_super_admin_select
      ON storage.objects FOR SELECT
      USING (bucket_id = 'company-exports' AND public.is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'company_exports_super_admin_insert'
  ) THEN
    CREATE POLICY company_exports_super_admin_insert
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'company-exports' AND public.is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'company_exports_super_admin_update'
  ) THEN
    CREATE POLICY company_exports_super_admin_update
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'company-exports' AND public.is_super_admin())
      WITH CHECK (bucket_id = 'company-exports' AND public.is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'company_exports_super_admin_delete'
  ) THEN
    CREATE POLICY company_exports_super_admin_delete
      ON storage.objects FOR DELETE
      USING (bucket_id = 'company-exports' AND public.is_super_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
