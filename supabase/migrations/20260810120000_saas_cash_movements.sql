-- Caixa SaaS Master — movimentações automáticas (webhook Asaas e futuras fontes)
CREATE TABLE IF NOT EXISTS public.saas_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  saas_charge_id uuid REFERENCES public.saas_charges(id) ON DELETE SET NULL,
  asaas_payment_id text,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  description text,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  movement_date date NOT NULL,
  source text NOT NULL CHECK (
    source IN (
      'asaas_webhook',
      'manual',
      'asaas_transfer',
      'asaas_fee',
      'asaas_refund'
    )
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_saas_cash_movements_company_id
  ON public.saas_cash_movements(company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saas_cash_movements_movement_date
  ON public.saas_cash_movements(movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_saas_cash_movements_type
  ON public.saas_cash_movements(type);

CREATE INDEX IF NOT EXISTS idx_saas_cash_movements_asaas_payment_id
  ON public.saas_cash_movements(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

-- Idempotência: uma entrada de recebimento Asaas por payment_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_cash_movements_asaas_webhook_income_unique
  ON public.saas_cash_movements(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL
    AND source = 'asaas_webhook'
    AND type = 'income';

CREATE INDEX IF NOT EXISTS idx_saas_cash_movements_metadata
  ON public.saas_cash_movements USING gin (metadata);

COMMENT ON TABLE public.saas_cash_movements IS
  'Caixa SaaS Master — entradas/saídas do negócio SaaS (assinaturas, tarifas, transferências)';

COMMENT ON COLUMN public.saas_cash_movements.company_id IS
  'Empresa assinante relacionada (nullable para movimentos globais futuros)';

COMMENT ON COLUMN public.saas_cash_movements.saas_charge_id IS
  'Cobrança SaaS que originou o movimento';

COMMENT ON COLUMN public.saas_cash_movements.asaas_payment_id IS
  'ID do pagamento no Asaas — chave de idempotência para webhook';

COMMENT ON COLUMN public.saas_cash_movements.type IS
  'income = entrada | expense = saída';

COMMENT ON COLUMN public.saas_cash_movements.source IS
  'Origem: asaas_webhook, manual, asaas_transfer, asaas_fee, asaas_refund';

COMMENT ON COLUMN public.saas_cash_movements.metadata IS
  'Metadados extras (charge_id, evento webhook, etc.)';

ALTER TABLE public.saas_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_cash_movements_super_admin ON public.saas_cash_movements;
CREATE POLICY saas_cash_movements_super_admin ON public.saas_cash_movements
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload schema';
