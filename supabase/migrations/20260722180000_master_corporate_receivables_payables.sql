-- Fase 6.2 — Contas a Receber e Contas a Pagar (Master / SV Topografia & Projetos)
-- Isolado: sem FK tenant, sem cash_movements SaaS/tenant, sem Asaas.

-- Counters
CREATE TABLE IF NOT EXISTS public.master_corporate_receivable_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.master_corporate_payable_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_corporate_receivable_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_rec_counters_super_admin
  ON public.master_corporate_receivable_counters;
CREATE POLICY master_corp_rec_counters_super_admin
  ON public.master_corporate_receivable_counters
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.master_corporate_payable_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_pay_counters_super_admin
  ON public.master_corporate_payable_counters;
CREATE POLICY master_corp_pay_counters_super_admin
  ON public.master_corporate_payable_counters
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_corporate_receivable_code(p_year integer DEFAULT NULL)
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
  INSERT INTO public.master_corporate_receivable_counters (year, last_number)
  VALUES (y, 0) ON CONFLICT (year) DO NOTHING;
  UPDATE public.master_corporate_receivable_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;
  RETURN 'REC-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_next_corporate_payable_code(p_year integer DEFAULT NULL)
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
  INSERT INTO public.master_corporate_payable_counters (year, last_number)
  VALUES (y, 0) ON CONFLICT (year) DO NOTHING;
  UPDATE public.master_corporate_payable_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;
  RETURN 'PAG-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_corporate_receivable_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_receivable_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_receivable_code(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_next_corporate_payable_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_payable_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_payable_code(integer) TO authenticated;

-- Contas a receber
CREATE TABLE IF NOT EXISTS public.master_corporate_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  customer_name text NOT NULL,
  customer_document text NULL,
  customer_phone text NULL,
  customer_email text NULL,
  project_id uuid NULL REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  quote_id uuid NULL REFERENCES public.master_topography_quotes(id) ON DELETE SET NULL,
  category_id uuid NOT NULL REFERENCES public.master_corporate_financial_categories(id) ON DELETE RESTRICT,
  cost_center_id uuid NULL REFERENCES public.master_corporate_cost_centers(id) ON DELETE SET NULL,
  financial_account_id uuid NULL REFERENCES public.master_corporate_financial_accounts(id) ON DELETE SET NULL,
  issue_date date NOT NULL,
  competence_date date NOT NULL,
  due_date date NOT NULL,
  original_amount numeric(14, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  interest_amount numeric(14, 2) NOT NULL DEFAULT 0,
  fine_amount numeric(14, 2) NOT NULL DEFAULT 0,
  net_amount numeric(14, 2) NOT NULL DEFAULT 0,
  received_amount numeric(14, 2) NOT NULL DEFAULT 0,
  remaining_amount numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('DRAFT', 'OPEN', 'PARTIAL', 'RECEIVED', 'OVERDUE', 'CANCELED', 'ARCHIVED')),
  payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN (
      'PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
    )),
  installment_number integer NULL,
  installment_total integer NULL,
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  canceled_at timestamptz NULL,
  canceled_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  cancellation_reason text NULL,
  CONSTRAINT master_corp_receivables_code_unique UNIQUE (code),
  CONSTRAINT master_corp_receivables_desc_len CHECK (char_length(trim(description)) > 0),
  CONSTRAINT master_corp_receivables_customer_len CHECK (char_length(trim(customer_name)) > 0),
  CONSTRAINT master_corp_receivables_amounts_nonneg CHECK (
    original_amount >= 0 AND discount_amount >= 0 AND interest_amount >= 0
    AND fine_amount >= 0 AND net_amount >= 0 AND received_amount >= 0 AND remaining_amount >= 0
  ),
  CONSTRAINT master_corp_receivables_received_lte_net CHECK (received_amount <= net_amount),
  CONSTRAINT master_corp_receivables_remaining_eq CHECK (
    remaining_amount = round((net_amount - received_amount)::numeric, 2)
  ),
  CONSTRAINT master_corp_receivables_installments CHECK (
    (installment_number IS NULL AND installment_total IS NULL)
    OR (installment_number IS NOT NULL AND installment_total IS NOT NULL
        AND installment_number > 0 AND installment_total > 0
        AND installment_number <= installment_total)
  )
);

CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_status
  ON public.master_corporate_receivables (status);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_due_date
  ON public.master_corporate_receivables (due_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_issue_date
  ON public.master_corporate_receivables (issue_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_competence_date
  ON public.master_corporate_receivables (competence_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_project
  ON public.master_corporate_receivables (project_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_quote
  ON public.master_corporate_receivables (quote_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_category
  ON public.master_corporate_receivables (category_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_cost_center
  ON public.master_corporate_receivables (cost_center_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_account
  ON public.master_corporate_receivables (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_archived
  ON public.master_corporate_receivables (is_archived);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_customer
  ON public.master_corporate_receivables (customer_name);
CREATE INDEX IF NOT EXISTS idx_master_corp_receivables_created
  ON public.master_corporate_receivables (created_at DESC);

ALTER TABLE public.master_corporate_receivables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_receivables_super_admin
  ON public.master_corporate_receivables;
CREATE POLICY master_corp_receivables_super_admin
  ON public.master_corporate_receivables
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_receivables IS
  'Contas a receber corporativas — MASTER SV Topografia (Fase 6.2)';

-- Histórico de recebimentos
CREATE TABLE IF NOT EXISTS public.master_corporate_receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.master_corporate_receivables(id) ON DELETE RESTRICT,
  financial_account_id uuid NOT NULL REFERENCES public.master_corporate_financial_accounts(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  payment_method text NOT NULL
    CHECK (payment_method IN (
      'PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
    )),
  reference text NULL,
  notes text NULL,
  origin text NOT NULL DEFAULT 'MANUAL'
    CHECK (origin IN ('MANUAL', 'ASAAS', 'LEGACY_PROJECT_RECEIVED', 'OTHER')),
  idempotency_key text NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_reason text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_rec_pay_amount_pos CHECK (amount > 0),
  CONSTRAINT master_corp_rec_pay_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_rec_payments_receivable
  ON public.master_corporate_receivable_payments (receivable_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_corp_rec_payments_account
  ON public.master_corporate_receivable_payments (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_rec_payments_date
  ON public.master_corporate_receivable_payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_rec_payments_reversed
  ON public.master_corporate_receivable_payments (is_reversed);

ALTER TABLE public.master_corporate_receivable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_rec_payments_super_admin
  ON public.master_corporate_receivable_payments;
CREATE POLICY master_corp_rec_payments_super_admin
  ON public.master_corporate_receivable_payments
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_receivable_payments IS
  'Histórico de recebimentos AR — pronto para bridge de caixa na Fase 6.3; sem movimento de caixa nesta fase';

-- Contas a pagar
CREATE TABLE IF NOT EXISTS public.master_corporate_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  supplier_name text NOT NULL,
  supplier_document text NULL,
  supplier_phone text NULL,
  supplier_email text NULL,
  project_id uuid NULL REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  category_id uuid NOT NULL REFERENCES public.master_corporate_financial_categories(id) ON DELETE RESTRICT,
  cost_center_id uuid NULL REFERENCES public.master_corporate_cost_centers(id) ON DELETE SET NULL,
  financial_account_id uuid NULL REFERENCES public.master_corporate_financial_accounts(id) ON DELETE SET NULL,
  issue_date date NOT NULL,
  competence_date date NOT NULL,
  due_date date NOT NULL,
  original_amount numeric(14, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  interest_amount numeric(14, 2) NOT NULL DEFAULT 0,
  fine_amount numeric(14, 2) NOT NULL DEFAULT 0,
  net_amount numeric(14, 2) NOT NULL DEFAULT 0,
  paid_amount numeric(14, 2) NOT NULL DEFAULT 0,
  remaining_amount numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED', 'ARCHIVED')),
  payment_method text NULL
    CHECK (payment_method IS NULL OR payment_method IN (
      'PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
    )),
  installment_number integer NULL,
  installment_total integer NULL,
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  canceled_at timestamptz NULL,
  canceled_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  cancellation_reason text NULL,
  CONSTRAINT master_corp_payables_code_unique UNIQUE (code),
  CONSTRAINT master_corp_payables_desc_len CHECK (char_length(trim(description)) > 0),
  CONSTRAINT master_corp_payables_supplier_len CHECK (char_length(trim(supplier_name)) > 0),
  CONSTRAINT master_corp_payables_amounts_nonneg CHECK (
    original_amount >= 0 AND discount_amount >= 0 AND interest_amount >= 0
    AND fine_amount >= 0 AND net_amount >= 0 AND paid_amount >= 0 AND remaining_amount >= 0
  ),
  CONSTRAINT master_corp_payables_paid_lte_net CHECK (paid_amount <= net_amount),
  CONSTRAINT master_corp_payables_remaining_eq CHECK (
    remaining_amount = round((net_amount - paid_amount)::numeric, 2)
  ),
  CONSTRAINT master_corp_payables_installments CHECK (
    (installment_number IS NULL AND installment_total IS NULL)
    OR (installment_number IS NOT NULL AND installment_total IS NOT NULL
        AND installment_number > 0 AND installment_total > 0
        AND installment_number <= installment_total)
  )
);

CREATE INDEX IF NOT EXISTS idx_master_corp_payables_status
  ON public.master_corporate_payables (status);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_due_date
  ON public.master_corporate_payables (due_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_issue_date
  ON public.master_corporate_payables (issue_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_competence_date
  ON public.master_corporate_payables (competence_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_project
  ON public.master_corporate_payables (project_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_category
  ON public.master_corporate_payables (category_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_cost_center
  ON public.master_corporate_payables (cost_center_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_account
  ON public.master_corporate_payables (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_archived
  ON public.master_corporate_payables (is_archived);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_supplier
  ON public.master_corporate_payables (supplier_name);
CREATE INDEX IF NOT EXISTS idx_master_corp_payables_created
  ON public.master_corporate_payables (created_at DESC);

ALTER TABLE public.master_corporate_payables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_payables_super_admin
  ON public.master_corporate_payables;
CREATE POLICY master_corp_payables_super_admin
  ON public.master_corporate_payables
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_payables IS
  'Contas a pagar corporativas — MASTER SV Topografia (Fase 6.2)';

-- Histórico de pagamentos
CREATE TABLE IF NOT EXISTS public.master_corporate_payable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id uuid NOT NULL REFERENCES public.master_corporate_payables(id) ON DELETE RESTRICT,
  financial_account_id uuid NOT NULL REFERENCES public.master_corporate_financial_accounts(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  payment_method text NOT NULL
    CHECK (payment_method IN (
      'PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
    )),
  reference text NULL,
  notes text NULL,
  origin text NOT NULL DEFAULT 'MANUAL'
    CHECK (origin IN ('MANUAL', 'ASAAS', 'OTHER')),
  idempotency_key text NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_reason text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_pay_pay_amount_pos CHECK (amount > 0),
  CONSTRAINT master_corp_pay_pay_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_pay_payments_payable
  ON public.master_corporate_payable_payments (payable_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_corp_pay_payments_account
  ON public.master_corporate_payable_payments (financial_account_id);
CREATE INDEX IF NOT EXISTS idx_master_corp_pay_payments_date
  ON public.master_corporate_payable_payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_master_corp_pay_payments_reversed
  ON public.master_corporate_payable_payments (is_reversed);

ALTER TABLE public.master_corporate_payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_pay_payments_super_admin
  ON public.master_corporate_payable_payments;
CREATE POLICY master_corp_pay_payments_super_admin
  ON public.master_corporate_payable_payments
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_payable_payments IS
  'Histórico de pagamentos AP — pronto para bridge de caixa na Fase 6.3; sem movimento de caixa nesta fase';

NOTIFY pgrst, 'reload schema';
