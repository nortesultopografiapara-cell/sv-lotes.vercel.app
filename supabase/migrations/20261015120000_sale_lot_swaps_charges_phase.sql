-- Fase 5B — estado operacional de cobranças externas na Troca de lote.
-- Aditivo. Não altera status da Fase 4 (CALCULATED/EXECUTING/EXECUTED/FAILED).
-- Não aplica em Production nesta etapa.

ALTER TABLE public.sale_lot_swaps
  ADD COLUMN IF NOT EXISTS charges_phase text;

ALTER TABLE public.sale_lot_swaps
  ADD COLUMN IF NOT EXISTS charges_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sale_lot_swaps
  ADD COLUMN IF NOT EXISTS charges_error text;

ALTER TABLE public.sale_lot_swaps
  ADD COLUMN IF NOT EXISTS charges_phase_updated_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.sale_lot_swaps
    ADD CONSTRAINT sale_lot_swaps_charges_phase_check
    CHECK (
      charges_phase IS NULL
      OR charges_phase IN (
        'PREPARED',
        'CANCELLING',
        'CANCELED',
        'LOCAL_EXECUTED',
        'GENERATING',
        'COMPLETED',
        'FAILED'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS sale_lot_swaps_charges_phase_idx
  ON public.sale_lot_swaps (company_id, charges_phase, updated_at DESC)
  WHERE charges_phase IS NOT NULL;

COMMENT ON COLUMN public.sale_lot_swaps.charges_phase IS
  'Fase 5B: PREPARED, CANCELLING, CANCELED, LOCAL_EXECUTED, GENERATING, COMPLETED, FAILED. Independente do status da Fase 4.';

COMMENT ON COLUMN public.sale_lot_swaps.charges_snapshot IS
  'Auditoria da Fase 5B: cobranças classificadas, cancelamentos, gerações, erro e retry.';

NOTIFY pgrst, 'reload schema';
