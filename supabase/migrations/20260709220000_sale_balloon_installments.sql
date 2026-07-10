-- Parcelas balão (opcional) — estrutura própria; não altera finance_receipts existentes.
-- Vendas antigas permanecem intactas (use_balloon_installments = false / sem linhas).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS use_balloon_installments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balloon_mode text,
  ADD COLUMN IF NOT EXISTS balloon_config jsonb;

COMMENT ON COLUMN public.sales.use_balloon_installments IS
  'Quando true, a venda utiliza parcelas balão (acréscimos em parcelas específicas).';
COMMENT ON COLUMN public.sales.balloon_mode IS
  'MANUAL | FINAL | RECURRENT — modo de configuração das parcelas balão.';
COMMENT ON COLUMN public.sales.balloon_config IS
  'Metadados do formulário de parcelas balão (JSON) para reedição.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_balloon_mode_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_balloon_mode_check
      CHECK (
        balloon_mode IS NULL
        OR balloon_mode IN ('MANUAL', 'FINAL', 'RECURRENT')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sale_balloon_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number >= 1),
  additional_amount numeric(15, 2) NOT NULL CHECK (additional_amount > 0),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sale_balloon_installments_sale_number_unique
    UNIQUE (sale_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_sale_balloon_installments_sale_id
  ON public.sale_balloon_installments(sale_id);

ALTER TABLE public.sale_balloon_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_balloon_installments_tenant ON public.sale_balloon_installments;
CREATE POLICY sale_balloon_installments_tenant ON public.sale_balloon_installments
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_balloon_installments.sale_id
        AND (
          s.company_id = public.current_tenant_id()
          OR s.tenant_id = public.current_tenant_id()
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_balloon_installments.sale_id
        AND (
          s.company_id = public.current_tenant_id()
          OR s.tenant_id = public.current_tenant_id()
        )
    )
  );

COMMENT ON TABLE public.sale_balloon_installments IS
  'Acréscimos de parcela balão por venda. finance_receipts.amount já inclui o valor final.';

NOTIFY pgrst, 'reload schema';
