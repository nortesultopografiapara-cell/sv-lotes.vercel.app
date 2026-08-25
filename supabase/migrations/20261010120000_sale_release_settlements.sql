-- Fase 3A — acerto financeiro de encerramento persistido na venda original.
-- Aditivo. DEVELOP somente nesta etapa. Sem comandos destrutivos de dados.
-- Idempotente; seguro reaplicar.

CREATE TABLE IF NOT EXISTS public.sale_release_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  reason text,
  reason_detail text,
  status text NOT NULL DEFAULT 'CALCULATED',
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_origin text,
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipts_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_paid numeric(14,2) NOT NULL DEFAULT 0,
  entry_amount numeric(14,2) NOT NULL DEFAULT 0,
  signal_amount numeric(14,2) NOT NULL DEFAULT 0,
  installment_paid numeric(14,2) NOT NULL DEFAULT 0,
  other_paid numeric(14,2) NOT NULL DEFAULT 0,
  non_refundable_amount numeric(14,2) NOT NULL DEFAULT 0,
  refundable_base numeric(14,2) NOT NULL DEFAULT 0,
  retention_percent numeric(8,4),
  retention_amount numeric(14,2) NOT NULL DEFAULT 0,
  contractual_refund_amount numeric(14,2) NOT NULL DEFAULT 0,
  agreed_refund_amount numeric(14,2),
  refund_installments integer,
  refund_destination text NOT NULL DEFAULT 'REFUND_CUSTOMER',
  credit_other_unit_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  has_improvements boolean NOT NULL DEFAULT false,
  improvement_status text,
  exceptional_agreement boolean NOT NULL DEFAULT false,
  exceptional_reason text,
  exceptional_refund_amount numeric(14,2),
  calculation_status text NOT NULL,
  is_final boolean NOT NULL DEFAULT false,
  operator_user_id uuid,
  executed_at timestamptz,
  idempotency_key text,
  termination_document_snapshot jsonb,
  document_id uuid REFERENCES public.sale_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_release_settlements_operation_type_check'
  ) THEN
    ALTER TABLE public.sale_release_settlements
      ADD CONSTRAINT sale_release_settlements_operation_type_check
      CHECK (
        operation_type IN (
          'desistencia',
          'distrato',
          'inadimplencia',
          'erro_cadastro',
          'cancelamento_administrativo'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_release_settlements_status_check'
  ) THEN
    ALTER TABLE public.sale_release_settlements
      ADD CONSTRAINT sale_release_settlements_status_check
      CHECK (
        status IN (
          'DRAFT',
          'CALCULATED',
          'EXECUTED',
          'FAILED_DOCUMENT',
          'VOID'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_release_settlements_calc_status_check'
  ) THEN
    ALTER TABLE public.sale_release_settlements
      ADD CONSTRAINT sale_release_settlements_calc_status_check
      CHECK (
        calculation_status IN (
          'CALCULATED',
          'INCOMPLETE',
          'MISSING_POLICY',
          'WAITING_IMPROVEMENT_APPRAISAL',
          'NOT_APPLICABLE'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_release_settlements_destination_check'
  ) THEN
    ALTER TABLE public.sale_release_settlements
      ADD CONSTRAINT sale_release_settlements_destination_check
      CHECK (
        refund_destination IN ('REFUND_CUSTOMER', 'CREDIT_OTHER_UNIT')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_release_settlements_policy_origin_check'
  ) THEN
    ALTER TABLE public.sale_release_settlements
      ADD CONSTRAINT sale_release_settlements_policy_origin_check
      CHECK (
        policy_origin IS NULL
        OR policy_origin IN (
          'sale_snapshot',
          'contract_snapshot',
          'legacy_inferred',
          'missing'
        )
      );
  END IF;
END $$;

-- Um encerramento ativo por venda original (retry reutiliza a linha CALCULATED).
CREATE UNIQUE INDEX IF NOT EXISTS sale_release_settlements_sale_active_uidx
  ON public.sale_release_settlements (sale_id)
  WHERE status IN ('CALCULATED', 'EXECUTED', 'FAILED_DOCUMENT');

CREATE UNIQUE INDEX IF NOT EXISTS sale_release_settlements_idempotency_uidx
  ON public.sale_release_settlements (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_release_settlements_company_sale_idx
  ON public.sale_release_settlements (company_id, sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_release_settlements_block_idx
  ON public.sale_release_settlements (block_id, created_at DESC);

COMMENT ON TABLE public.sale_release_settlements IS
  'Acerto financeiro de encerramento. Pertence à sale_id original; sobrevive à revenda do lote (blocks.sale_id null).';

COMMENT ON COLUMN public.sale_release_settlements.document_id IS
  'Reservado para Fase 3B — geração do termo em sale_documents.';

COMMENT ON COLUMN public.sale_release_settlements.termination_document_snapshot IS
  'Reservado para Fase 3B — snapshot imutável do documento.';

COMMENT ON COLUMN public.sale_release_settlements.credit_other_unit_id IS
  'Intenção futura. Crédito efetivo em outra unidade NÃO é executado nesta fase.';

ALTER TABLE public.sale_release_settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sale_release_settlements'
      AND policyname = 'sale_release_settlements_tenant_all'
  ) THEN
    CREATE POLICY sale_release_settlements_tenant_all
      ON public.sale_release_settlements
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sale_release_settlements TO authenticated;
GRANT ALL ON TABLE public.sale_release_settlements TO service_role;

NOTIFY pgrst, 'reload schema';
