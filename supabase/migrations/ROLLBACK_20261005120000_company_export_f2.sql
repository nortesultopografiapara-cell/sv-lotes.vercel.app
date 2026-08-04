-- ROLLBACK for 20261005120000_company_export_f2.sql
-- NOT EXECUTED automatically — manual use only after authorization

ALTER TABLE public.company_export_jobs
  DROP CONSTRAINT IF EXISTS company_export_jobs_export_version_check;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS export_version;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS options;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS storage_files_found;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS storage_files_copied;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS storage_files_missing;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS storage_files_deduplicated;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS generated_memorials;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS generated_lot_plans;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS generated_general_plans;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS generation_errors;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS package_parts;

ALTER TABLE public.company_export_jobs
  DROP COLUMN IF EXISTS total_binary_size;
