-- Fase 6.1 — Fundação Financeiro Corporativo (Master / SV Topografia & Projetos)
-- Isolado: sem FK para tenant, cash_movements SaaS ou Asaas de empresas.

-- Contas financeiras
CREATE TABLE IF NOT EXISTS public.master_corporate_financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'CHECKING'
    CHECK (account_type IN ('CHECKING', 'SAVINGS', 'CASH', 'DIGITAL_WALLET', 'OTHER')),
  institution_name text NULL,
  branch text NULL,
  account_number text NULL,
  pix_key text NULL,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  opening_balance_date date NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_fin_accounts_name_len CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_corp_fin_accounts_one_default
  ON public.master_corporate_financial_accounts (is_default)
  WHERE is_default = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_master_corp_fin_accounts_active
  ON public.master_corporate_financial_accounts (is_active, name);

ALTER TABLE public.master_corporate_financial_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_fin_accounts_super_admin
  ON public.master_corporate_financial_accounts;
CREATE POLICY master_corp_fin_accounts_super_admin
  ON public.master_corporate_financial_accounts
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_financial_accounts IS
  'Contas financeiras corporativas — SV Topografia & Projetos (MASTER only)';
COMMENT ON COLUMN public.master_corporate_financial_accounts.opening_balance_date IS
  'Saldo inicial vale a partir desta data; saldo atual NÃO é armazenado nesta fase';

-- Categorias financeiras
CREATE TABLE IF NOT EXISTS public.master_corporate_financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  parent_id uuid NULL REFERENCES public.master_corporate_financial_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_fin_categories_name_len CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_fin_categories_type
  ON public.master_corporate_financial_categories (type, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_master_corp_fin_categories_parent
  ON public.master_corporate_financial_categories (parent_id);

ALTER TABLE public.master_corporate_financial_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_fin_categories_super_admin
  ON public.master_corporate_financial_categories;
CREATE POLICY master_corp_fin_categories_super_admin
  ON public.master_corporate_financial_categories
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_financial_categories IS
  'Categorias financeiras corporativas — MASTER only; desativar em vez de excluir quando usadas';

-- Centros de resultado
CREATE TABLE IF NOT EXISTS public.master_corporate_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  project_id uuid NULL REFERENCES public.master_topography_projects(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_corp_cost_centers_code_unique UNIQUE (code),
  CONSTRAINT master_corp_cost_centers_name_len CHECK (char_length(trim(name)) > 0),
  CONSTRAINT master_corp_cost_centers_code_len CHECK (char_length(trim(code)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_master_corp_cost_centers_active
  ON public.master_corporate_cost_centers (is_active, name);

CREATE INDEX IF NOT EXISTS idx_master_corp_cost_centers_project
  ON public.master_corporate_cost_centers (project_id);

ALTER TABLE public.master_corporate_cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_cost_centers_super_admin
  ON public.master_corporate_cost_centers;
CREATE POLICY master_corp_cost_centers_super_admin
  ON public.master_corporate_cost_centers
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_corporate_cost_centers IS
  'Centros de resultado corporativos — MASTER only; project_id opcional, sem auto-criação';

-- Contador para códigos CEN-YYYY-NNNN
CREATE TABLE IF NOT EXISTS public.master_corporate_cost_center_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.master_corporate_cost_center_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_corp_cc_counters_super_admin
  ON public.master_corporate_cost_center_counters;
CREATE POLICY master_corp_cc_counters_super_admin
  ON public.master_corporate_cost_center_counters
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.generate_next_corporate_cost_center_code(p_year integer DEFAULT NULL)
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

  INSERT INTO public.master_corporate_cost_center_counters (year, last_number)
  VALUES (y, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.master_corporate_cost_center_counters
  SET last_number = last_number + 1
  WHERE year = y
  RETURNING last_number INTO next_num;

  RETURN 'CEN-' || y::text || '-' || lpad(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_corporate_cost_center_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_cost_center_code(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_corporate_cost_center_code(integer) TO authenticated;

-- Seeds: categorias de entrada
INSERT INTO public.master_corporate_financial_categories (name, type, sort_order)
SELECT v.name, 'INCOME', v.sort_order
FROM (VALUES
  ('Serviços de Topografia', 10),
  ('Georreferenciamento', 20),
  ('Projetos', 30),
  ('Drone', 40),
  ('LiDAR', 50),
  ('Locação de Equipamentos', 60),
  ('Consultoria', 70),
  ('Outros Recebimentos', 80)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_corporate_financial_categories c
  WHERE c.name = v.name AND c.type = 'INCOME'
);

-- Seeds: categorias de despesa
INSERT INTO public.master_corporate_financial_categories (name, type, sort_order)
SELECT v.name, 'EXPENSE', v.sort_order
FROM (VALUES
  ('Combustível', 10),
  ('Alimentação', 20),
  ('Hospedagem', 30),
  ('Pedágio', 40),
  ('Manutenção de Veículos', 50),
  ('Manutenção de Equipamentos', 60),
  ('Locação de Equipamentos', 70),
  ('Equipe / Diárias', 80),
  ('Salários', 90),
  ('Impostos', 100),
  ('Taxas Bancárias', 110),
  ('Software e Assinaturas', 120),
  ('Material de Campo', 130),
  ('Escritório', 140),
  ('Terceirização', 150),
  ('Outros Custos', 160)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_corporate_financial_categories c
  WHERE c.name = v.name AND c.type = 'EXPENSE'
);

-- Conta padrão inicial (opcional, só se não existir nenhuma)
INSERT INTO public.master_corporate_financial_accounts (
  name, account_type, opening_balance, opening_balance_date, is_default, is_active, notes
)
SELECT
  'Caixa SV Topografia',
  'CASH',
  0,
  CURRENT_DATE,
  true,
  true,
  'Conta padrão criada na fundação do Financeiro Corporativo'
WHERE NOT EXISTS (SELECT 1 FROM public.master_corporate_financial_accounts LIMIT 1);

NOTIFY pgrst, 'reload schema';
