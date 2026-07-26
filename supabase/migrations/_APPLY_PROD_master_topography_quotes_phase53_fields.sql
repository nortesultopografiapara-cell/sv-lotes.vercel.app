-- APPLY PROD — Fase 5.3 campos de orçamento (cronograma, metodologia, profissional, notas de item)
-- Fonte: 20260830140000_master_topography_quotes_phase53_fields.sql

ALTER TABLE public.master_topography_quotes
  ADD COLUMN IF NOT EXISTS mobilization_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS field_duration_text text NULL,
  ADD COLUMN IF NOT EXISTS processing_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS delivery_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS total_deadline_text text NULL,
  ADD COLUMN IF NOT EXISTS methodology_notes text NULL,
  ADD COLUMN IF NOT EXISTS professional_name text NULL,
  ADD COLUMN IF NOT EXISTS professional_title text NULL,
  ADD COLUMN IF NOT EXISTS professional_council text NULL,
  ADD COLUMN IF NOT EXISTS professional_registration text NULL,
  ADD COLUMN IF NOT EXISTS professional_registration_uf text NULL;

ALTER TABLE public.master_topography_quote_items
  ADD COLUMN IF NOT EXISTS calculation_notes text NULL;
