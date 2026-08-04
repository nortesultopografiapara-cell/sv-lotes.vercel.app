-- Company export F2 — additive columns only
-- Idempotent · no DROP · no TRUNCATE · no backfill of commercial data
-- DO NOT APPLY until explicitly authorized on shared Supabase

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS export_version text NOT NULL DEFAULT 'F1_TABULAR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_export_jobs_export_version_check'
  ) THEN
    ALTER TABLE public.company_export_jobs
      ADD CONSTRAINT company_export_jobs_export_version_check
      CHECK (export_version IN ('F1_TABULAR', 'F2_COMPLETE'));
  END IF;
END $$;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS storage_files_found integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS storage_files_copied integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS storage_files_missing integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS storage_files_deduplicated integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS generated_memorials integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS generated_lot_plans integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS generated_general_plans integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS generation_errors integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS package_parts integer NOT NULL DEFAULT 0;

ALTER TABLE public.company_export_jobs
  ADD COLUMN IF NOT EXISTS total_binary_size bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.company_export_jobs.export_version IS
  'F1_TABULAR = CSV/JSON/HTML/GeoJSON; F2_COMPLETE = F1 + Storage binaries + generated plans';

COMMENT ON COLUMN public.company_export_jobs.options IS
  'JSON options e.g. { "include_generated_plans": true }';

NOTIFY pgrst, 'reload schema';
