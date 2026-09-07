-- Fase P1 — fundação persistente da Transferência de titularidade / cessão.
-- Aditivo. DEVELOP somente nesta etapa. Sem comandos destrutivos de dados.
-- Idempotente; seguro reaplicar.
--
-- Isolamento: NÃO reutiliza a tabela da Troca de lote, a RPC da Troca,
-- sale_release_settlements nem ReleaseLot.
-- Preview/simulação (P2) NÃO persiste nesta tabela.
--
-- Cadeia A → B → C: várias linhas EXECUTED por sale_id, ligadas por
-- previous_transfer_id. O lote permanece o mesmo (block_id único).

CREATE TABLE IF NOT EXISTS public.sale_title_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  from_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  to_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  previous_transfer_id uuid REFERENCES public.sale_title_transfers(id) ON DELETE RESTRICT,
  from_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  to_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  declared_agio_amount numeric(14,2) NOT NULL DEFAULT 0,
  transfer_date date,
  notes text,
  schedule_mode text,
  sale_price numeric(14,2) NOT NULL DEFAULT 0,
  total_paid numeric(14,2) NOT NULL DEFAULT 0,
  remaining_balance numeric(14,2) NOT NULL DEFAULT 0,
  financial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  charges_phase text,
  charges_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  charges_error text,
  charges_phase_updated_at timestamptz,
  status text NOT NULL DEFAULT 'CALCULATED',
  operator_user_id uuid,
  executed_at timestamptz,
  idempotency_key text,
  document_number text,
  document_id uuid REFERENCES public.sale_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_title_transfers_distinct_customers_check
    CHECK (from_customer_id <> to_customer_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_title_transfers_status_check'
  ) THEN
    ALTER TABLE public.sale_title_transfers
      ADD CONSTRAINT sale_title_transfers_status_check
      CHECK (
        status IN (
          'CALCULATED',
          'EXECUTING',
          'EXECUTED',
          'FAILED'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_title_transfers_schedule_mode_check'
  ) THEN
    ALTER TABLE public.sale_title_transfers
      ADD CONSTRAINT sale_title_transfers_schedule_mode_check
      CHECK (
        schedule_mode IS NULL
        OR schedule_mode IN ('ASSUME_CURRENT', 'RECALCULATE')
      );
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.sale_title_transfers
    ADD CONSTRAINT sale_title_transfers_charges_phase_check
    CHECK (
      charges_phase IS NULL
      OR charges_phase IN (
        'PREPARED',
        'CANCELLING',
        'CANCELED',
        'COMPLETED',
        'FAILED'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sale_title_transfers_sale_inflight_uidx
  ON public.sale_title_transfers (sale_id)
  WHERE status IN ('CALCULATED', 'EXECUTING');

CREATE UNIQUE INDEX IF NOT EXISTS sale_title_transfers_idempotency_uidx
  ON public.sale_title_transfers (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sale_title_transfers_document_number_uidx
  ON public.sale_title_transfers (company_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_title_transfers_company_sale_idx
  ON public.sale_title_transfers (company_id, sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_title_transfers_block_idx
  ON public.sale_title_transfers (block_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_title_transfers_previous_idx
  ON public.sale_title_transfers (previous_transfer_id)
  WHERE previous_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_title_transfers_from_customer_idx
  ON public.sale_title_transfers (from_customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_title_transfers_to_customer_idx
  ON public.sale_title_transfers (to_customer_id, created_at DESC);

COMMENT ON TABLE public.sale_title_transfers IS
  'Transferência de titularidade / cessão. Mesma sale_id e mesmo block_id. Sem ReleaseLot e sem a tabela da Troca de lote. Preview de UI não persiste aqui.';

COMMENT ON COLUMN public.sale_title_transfers.tenant_id IS
  'Espelho de company_id, padrão das tabelas operacionais.';

COMMENT ON COLUMN public.sale_title_transfers.block_id IS
  'Lote que permanece Vendido. Nunca muda nesta operação.';

COMMENT ON COLUMN public.sale_title_transfers.previous_transfer_id IS
  'Elo da cadeia A → B → C. Nulo na primeira transferência da venda.';

COMMENT ON COLUMN public.sale_title_transfers.declared_agio_amount IS
  'Ágio/acerto entre cedente e cessionário. Somente documental. Não gera parcela nem receita da loteadora.';

COMMENT ON COLUMN public.sale_title_transfers.schedule_mode IS
  'ASSUME_CURRENT = cessionário assume o cronograma vigente; RECALCULATE = novo plano do saldo. Nulo até o plano (P4).';

COMMENT ON COLUMN public.sale_title_transfers.status IS
  'CALCULATED = plano congelado pré-execução; EXECUTING = RPC em voo; EXECUTED; FAILED. Sem PREVIEW persistido.';

COMMENT ON COLUMN public.sale_title_transfers.charges_phase IS
  'Cancelamento externo: PREPARED, CANCELLING, CANCELED, COMPLETED, FAILED. Independente do status local.';

ALTER TABLE public.sale_title_transfers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sale_title_transfers'
      AND policyname = 'sale_title_transfers_tenant_all'
  ) THEN
    CREATE POLICY sale_title_transfers_tenant_all
      ON public.sale_title_transfers
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sale_title_transfers TO authenticated;
GRANT ALL ON TABLE public.sale_title_transfers TO service_role;

NOTIFY pgrst, 'reload schema';
