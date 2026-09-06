-- Fase 1 — fundação persistente da Troca de lote (substituição de unidade).
-- Aditivo. DEVELOP somente nesta etapa. Sem comandos destrutivos de dados.
-- Idempotente; seguro reaplicar.
--
-- Isolamento: NÃO reutiliza sale_release_settlements, ReleaseLot, retenção de 25%
-- nem política financeira de rescisão.
-- Preview/simulação (Fases 2–3) NÃO persiste nesta tabela.
-- Status CALCULATED = plano congelado imediatamente antes da execução futura (Fase 4),
-- não simulação abandonada de UI.
--
-- Fase 4 (não implementada aqui): mutação crítica deve ser RPC/transação server-side
-- Postgres com locks em sales + from_block + to_block, e não sequência de UPDATEs
-- independentes no cliente.

CREATE TABLE IF NOT EXISTS public.sale_lot_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  from_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  from_block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE RESTRICT,
  to_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  to_block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE RESTRICT,
  from_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  to_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  old_sale_price numeric(14,2) NOT NULL DEFAULT 0,
  new_lot_price numeric(14,2) NOT NULL DEFAULT 0,
  total_paid numeric(14,2) NOT NULL DEFAULT 0,
  transferable_credit numeric(14,2) NOT NULL DEFAULT 0,
  old_balance numeric(14,2) NOT NULL DEFAULT 0,
  price_difference numeric(14,2) NOT NULL DEFAULT 0,
  new_balance numeric(14,2) NOT NULL DEFAULT 0,
  financial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  reason_detail text,
  status text NOT NULL DEFAULT 'CALCULATED',
  operator_user_id uuid,
  executed_at timestamptz,
  idempotency_key text,
  document_number text,
  document_id uuid REFERENCES public.sale_documents(id) ON DELETE SET NULL,
  document_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_lot_swaps_distinct_blocks_check
    CHECK (from_block_id <> to_block_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_lot_swaps_status_check'
  ) THEN
    ALTER TABLE public.sale_lot_swaps
      ADD CONSTRAINT sale_lot_swaps_status_check
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
  ALTER TABLE public.sale_lot_swaps
    ADD CONSTRAINT sale_lot_swaps_document_status_check
    CHECK (
      document_status IS NULL
      OR document_status IN ('PENDING', 'GENERATED', 'SIGNED', 'FAILED')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Uma troca em voo por venda (retry reutiliza CALCULATED/EXECUTING).
-- Várias EXECUTED históricas são permitidas.
CREATE UNIQUE INDEX IF NOT EXISTS sale_lot_swaps_sale_inflight_uidx
  ON public.sale_lot_swaps (sale_id)
  WHERE status IN ('CALCULATED', 'EXECUTING');

CREATE UNIQUE INDEX IF NOT EXISTS sale_lot_swaps_idempotency_uidx
  ON public.sale_lot_swaps (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sale_lot_swaps_document_number_uidx
  ON public.sale_lot_swaps (company_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_lot_swaps_company_sale_idx
  ON public.sale_lot_swaps (company_id, sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_lot_swaps_from_block_idx
  ON public.sale_lot_swaps (from_block_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_lot_swaps_to_block_idx
  ON public.sale_lot_swaps (to_block_id, created_at DESC);

COMMENT ON TABLE public.sale_lot_swaps IS
  'Troca de lote / substituição de unidade. Mesma sale_id. Sem ReleaseLot e sem sale_release_settlements. Preview de UI não persiste aqui.';

COMMENT ON COLUMN public.sale_lot_swaps.tenant_id IS
  'Espelho de company_id, padrão das tabelas operacionais (sale_release_settlements).';

COMMENT ON COLUMN public.sale_lot_swaps.operator_user_id IS
  'Operador da troca (equivalente a executed_by do desenho funcional).';

COMMENT ON COLUMN public.sale_lot_swaps.total_paid IS
  'Pagamentos efetivos totais. Pode incluir componentes que no futuro não integrem transferable_credit.';

COMMENT ON COLUMN public.sale_lot_swaps.transferable_credit IS
  'Crédito transferível para o preço da nova unidade. V1 = pagamentos apropriados ao preço da aquisição. Sem classificação de juros/multa/taxas nesta fase.';

COMMENT ON COLUMN public.sale_lot_swaps.old_balance IS
  'Saldo da venda original (old_sale_price - total_paid), modelado separado do crédito transferível.';

COMMENT ON COLUMN public.sale_lot_swaps.price_difference IS
  'new_lot_price - old_sale_price. Positivo = lote destino mais caro.';

COMMENT ON COLUMN public.sale_lot_swaps.new_balance IS
  'new_lot_price - transferable_credit. Saldo negativo NÃO persiste execução; bloqueia até política de restituição.';

COMMENT ON COLUMN public.sale_lot_swaps.financial_snapshot IS
  'Congelamento para reconstruir a troca (pagos, pendentes, plano de receipts, cobranças). Fases 2–3 não gravam preview.';

COMMENT ON COLUMN public.sale_lot_swaps.status IS
  'CALCULATED = plano congelado pré-execução; EXECUTING = RPC em voo; EXECUTED; FAILED. Sem PREVIEW persistido.';

COMMENT ON COLUMN public.sale_lot_swaps.idempotency_key IS
  'Chave única por empresa. Protege retry da futura execução atômica.';

COMMENT ON COLUMN public.sale_lot_swaps.document_number IS
  'Reservado para Fase 6 — termo TL-000000001/AAAA. Não gerar nesta fase.';

COMMENT ON COLUMN public.sale_lot_swaps.document_id IS
  'Reservado para Fase 6 — sale_documents do termo aditivo. Não gerar nesta fase.';

COMMENT ON COLUMN public.sale_lot_swaps.to_contract_id IS
  'Reservado para Fase 7 — nova versão contratual vigente. Original permanece em from_contract_id.';

ALTER TABLE public.sale_lot_swaps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sale_lot_swaps'
      AND policyname = 'sale_lot_swaps_tenant_all'
  ) THEN
    CREATE POLICY sale_lot_swaps_tenant_all
      ON public.sale_lot_swaps
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sale_lot_swaps TO authenticated;
GRANT ALL ON TABLE public.sale_lot_swaps TO service_role;

NOTIFY pgrst, 'reload schema';
