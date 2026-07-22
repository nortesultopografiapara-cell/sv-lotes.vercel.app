-- Fase 6.3 — Movimentações e Fluxo de Caixa Corporativo (MASTER SV Topografia)
-- Isolado: sem cash_movements tenant, saas_cash_movements ou Asaas.

CREATE TABLE IF NOT EXISTS public.master_corporate_cash_movement_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_corporate_cash_movement_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_cash_counters_super_admin
  ON public.master_corporate_cash_movement_counters;
CREATE POLICY master_corp_cash_counters_super_admin
  ON public.master_corporate_cash_movement_counters
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_corporate_cash_movement_code(p_year integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer;
  next_num integer;
BEGIN
  y := COALESCE(p_year, EXTRACT(YEAR FROM timezone('utc'::text, now()))::integer);
  INSERT INTO public.master_corporate_cash_movement_counters (year, last_number)
  VALUES (y, 0) ON CONFLICT (year) DO NOTHING;
  UPDATE public.master_corporate_cash_movement_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;
  RETURN 'MOV-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_corporate_cash_movement_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_cash_movement_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_cash_movement_code(integer) TO authenticated;

CREATE TABLE IF NOT EXISTS public.master_corporate_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  movement_date date NOT NULL,
  competence_date date NOT NULL,
  type text NOT NULL
    CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL')),
  amount numeric(14, 2) NOT NULL,
  description text NOT NULL,
  financial_account_id uuid NOT NULL
    REFERENCES public.master_corporate_financial_accounts(id) ON DELETE RESTRICT,
  category_id uuid NULL
    REFERENCES public.master_corporate_financial_categories(id) ON DELETE SET NULL,
  cost_center_id uuid NULL
    REFERENCES public.master_corporate_cost_centers(id) ON DELETE SET NULL,
  project_id uuid NULL
    REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  quote_id uuid NULL
    REFERENCES public.master_topography_quotes(id) ON DELETE SET NULL,
  receivable_id uuid NULL
    REFERENCES public.master_corporate_receivables(id) ON DELETE SET NULL,
  receivable_payment_id uuid NULL
    REFERENCES public.master_corporate_receivable_payments(id) ON DELETE SET NULL,
  payable_id uuid NULL
    REFERENCES public.master_corporate_payables(id) ON DELETE SET NULL,
  payable_payment_id uuid NULL
    REFERENCES public.master_corporate_payable_payments(id) ON DELETE SET NULL,
  transfer_group_id uuid NULL,
  origin text NOT NULL
    CHECK (origin IN (
      'RECEIVABLE_PAYMENT',
      'PAYABLE_PAYMENT',
      'MANUAL_INCOME',
      'MANUAL_EXPENSE',
      'ACCOUNT_TRANSFER',
      'REVERSAL',
      'BACKFILL_RECEIVABLE',
      'BACKFILL_PAYABLE',
      'LEGACY_PROJECT_RECEIVED',
      'ASAAS'
    )),
  payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN (
      'PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
    )),
  reference text NULL,
  notes text NULL,
  idempotency_key text NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_reason text NULL,
  reversal_movement_id uuid NULL
    REFERENCES public.master_corporate_cash_movements(id) ON DELETE SET NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_cash_mov_code_unique UNIQUE (code),
  CONSTRAINT master_corp_cash_mov_amount_pos CHECK (amount > 0),
  CONSTRAINT master_corp_cash_mov_desc_len CHECK (char_length(trim(description)) > 0),
  CONSTRAINT master_corp_cash_mov_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT master_corp_cash_mov_recv_pay_req CHECK (
    origin NOT IN ('RECEIVABLE_PAYMENT', 'BACKFILL_RECEIVABLE')
    OR receivable_payment_id IS NOT NULL
  ),
  CONSTRAINT master_corp_cash_mov_pay_pay_req CHECK (
    origin NOT IN ('PAYABLE_PAYMENT', 'BACKFILL_PAYABLE')
    OR payable_payment_id IS NOT NULL
  ),
  CONSTRAINT master_corp_cash_mov_transfer_group CHECK (
    origin <> 'ACCOUNT_TRANSFER' OR transfer_group_id IS NOT NULL
  ),
  CONSTRAINT master_corp_cash_mov_refs_xor CHECK (
    NOT (
      receivable_payment_id IS NOT NULL
      AND payable_payment_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_date
  ON public.master_corporate_cash_movements (movement_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_competence
  ON public.master_corporate_cash_movements (competence_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_type
  ON public.master_corporate_cash_movements (type);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_origin
  ON public.master_corporate_cash_movements (origin);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_account
  ON public.master_corporate_cash_movements (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_category
  ON public.master_corporate_cash_movements (category_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_cost_center
  ON public.master_corporate_cash_movements (cost_center_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_project
  ON public.master_corporate_cash_movements (project_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_receivable
  ON public.master_corporate_cash_movements (receivable_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_payable
  ON public.master_corporate_cash_movements (payable_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_recv_payment
  ON public.master_corporate_cash_movements (receivable_payment_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_pay_payment
  ON public.master_corporate_cash_movements (payable_payment_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_reversed
  ON public.master_corporate_cash_movements (is_reversed);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_created
  ON public.master_corporate_cash_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_corp_cash_mov_transfer_group
  ON public.master_corporate_cash_movements (transfer_group_id);

ALTER TABLE public.master_corporate_cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_cash_movements_super_admin
  ON public.master_corporate_cash_movements;
CREATE POLICY master_corp_cash_movements_super_admin
  ON public.master_corporate_cash_movements
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_cash_movements IS
  'Movimentações de caixa corporativo — MASTER SV Topografia (Fase 6.3). Isolado do caixa SaaS e tenant.';

NOTIFY pgrst, 'reload schema';
