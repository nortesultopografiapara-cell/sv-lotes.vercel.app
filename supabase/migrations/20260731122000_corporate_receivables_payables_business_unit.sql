-- Etapa 1 — business_unit em Contas a Receber e Contas a Pagar (coerência estrutural).
-- Backfill seguro: registros existentes → SV_TOPOGRAFIA. Não apaga histórico.

-- ========== RECEIVABLES ==========
ALTER TABLE public.master_corporate_receivables
  ADD COLUMN IF NOT EXISTS business_unit text;

UPDATE public.master_corporate_receivables
SET business_unit = 'SV_TOPOGRAFIA'
WHERE business_unit IS NULL OR btrim(business_unit) = '';

ALTER TABLE public.master_corporate_receivables
  ALTER COLUMN business_unit SET DEFAULT 'SV_TOPOGRAFIA';

ALTER TABLE public.master_corporate_receivables
  ALTER COLUMN business_unit SET NOT NULL;

ALTER TABLE public.master_corporate_receivables
  DROP CONSTRAINT IF EXISTS master_corporate_receivables_business_unit_check;

ALTER TABLE public.master_corporate_receivables
  ADD CONSTRAINT master_corporate_receivables_business_unit_check
  CHECK (business_unit IN ('SV_LOTES', 'SV_TOPOGRAFIA'));

CREATE INDEX IF NOT EXISTS idx_master_corporate_receivables_business_unit
  ON public.master_corporate_receivables (business_unit, status, is_archived);

COMMENT ON COLUMN public.master_corporate_receivables.business_unit IS
  'Unidade de negócio do título: SV_LOTES ou SV_TOPOGRAFIA';

-- ========== PAYABLES (coerência estrutural) ==========
ALTER TABLE public.master_corporate_payables
  ADD COLUMN IF NOT EXISTS business_unit text;

UPDATE public.master_corporate_payables
SET business_unit = 'SV_TOPOGRAFIA'
WHERE business_unit IS NULL OR btrim(business_unit) = '';

ALTER TABLE public.master_corporate_payables
  ALTER COLUMN business_unit SET DEFAULT 'SV_TOPOGRAFIA';

ALTER TABLE public.master_corporate_payables
  ALTER COLUMN business_unit SET NOT NULL;

ALTER TABLE public.master_corporate_payables
  DROP CONSTRAINT IF EXISTS master_corporate_payables_business_unit_check;

ALTER TABLE public.master_corporate_payables
  ADD CONSTRAINT master_corporate_payables_business_unit_check
  CHECK (business_unit IN ('SV_LOTES', 'SV_TOPOGRAFIA'));

CREATE INDEX IF NOT EXISTS idx_master_corporate_payables_business_unit
  ON public.master_corporate_payables (business_unit, status, is_archived);

COMMENT ON COLUMN public.master_corporate_payables.business_unit IS
  'Unidade de negócio do título: SV_LOTES ou SV_TOPOGRAFIA (coerência com AR/contas)';

NOTIFY pgrst, 'reload schema';
