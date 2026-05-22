CREATE TABLE IF NOT EXISTS public.cash_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid REFERENCES public.projects(id),
    type text NOT NULL CHECK (type IN ('entrada', 'saida')),
    category text NOT NULL,
    description text,
    amount numeric NOT NULL DEFAULT 0,
    source_table text,
    source_id uuid,
    broker_id uuid REFERENCES public.brokers(id),
    customer_id uuid REFERENCES public.customers(id),
    sale_id uuid REFERENCES public.sales(id),
    contract_id uuid REFERENCES public.contracts(id),
    finance_receipt_id uuid REFERENCES public.finance_receipts(id),
    movement_date date NOT NULL,
    status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'estornado')),
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_id ON public.cash_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_company_id ON public.cash_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON public.cash_movements(type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_status ON public.cash_movements(status);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON public.cash_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_cash_movements_source ON public.cash_movements(source_table, source_id);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cash movements in their tenant" ON public.cash_movements
  FOR SELECT USING (
    tenant_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
    OR tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cash movements in their tenant" ON public.cash_movements
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
    OR tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update cash movements in their tenant" ON public.cash_movements
  FOR UPDATE USING (
    tenant_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
    OR tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
