-- Etapa 1 — Contas financeiras corporativas: business_unit + seed das contas canônicas.
-- Contas existentes → SV_TOPOGRAFIA. Não apaga histórico. Seeds idempotentes por nome.

ALTER TABLE public.master_corporate_financial_accounts
  ADD COLUMN IF NOT EXISTS business_unit text;

UPDATE public.master_corporate_financial_accounts
SET business_unit = 'SV_TOPOGRAFIA'
WHERE business_unit IS NULL OR btrim(business_unit) = '';

ALTER TABLE public.master_corporate_financial_accounts
  ALTER COLUMN business_unit SET DEFAULT 'SV_TOPOGRAFIA';

ALTER TABLE public.master_corporate_financial_accounts
  ALTER COLUMN business_unit SET NOT NULL;

ALTER TABLE public.master_corporate_financial_accounts
  DROP CONSTRAINT IF EXISTS master_corporate_financial_accounts_business_unit_check;

ALTER TABLE public.master_corporate_financial_accounts
  ADD CONSTRAINT master_corporate_financial_accounts_business_unit_check
  CHECK (business_unit IN ('SV_LOTES', 'SV_TOPOGRAFIA'));

CREATE INDEX IF NOT EXISTS idx_master_corporate_financial_accounts_business_unit
  ON public.master_corporate_financial_accounts (business_unit, is_active);

COMMENT ON COLUMN public.master_corporate_financial_accounts.business_unit IS
  'SV_TOPOGRAFIA = Financeiro Corporativo Topografia; SV_LOTES = contas corporativas SV LOTES (Caixa SaaS permanece a fonte operacional Asaas/mensalidades)';

-- Garante unidade correta nas contas canônicas (por nome), sem duplicar.
UPDATE public.master_corporate_financial_accounts
SET business_unit = 'SV_TOPOGRAFIA',
    updated_at = timezone('utc'::text, now())
WHERE lower(btrim(name)) = lower('Caixa SV Topografia');

UPDATE public.master_corporate_financial_accounts
SET business_unit = 'SV_LOTES',
    updated_at = timezone('utc'::text, now())
WHERE lower(btrim(name)) IN (lower('Asaas SV LOTES'), lower('Caixa SV LOTES'));

-- Seed: Caixa SV Topografia (só se ainda não existir por nome)
INSERT INTO public.master_corporate_financial_accounts (
  name, account_type, opening_balance, opening_balance_date,
  is_default, is_active, notes, business_unit
)
SELECT
  'Caixa SV Topografia',
  'CASH',
  0,
  CURRENT_DATE,
  NOT EXISTS (
    SELECT 1 FROM public.master_corporate_financial_accounts a
    WHERE a.is_default = true AND a.is_active = true
  ),
  true,
  'Conta padrão SV Topografia e Projetos (Financeiro Corporativo)',
  'SV_TOPOGRAFIA'
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_corporate_financial_accounts a
  WHERE lower(btrim(a.name)) = lower('Caixa SV Topografia')
);

-- Seed: Asaas SV LOTES
INSERT INTO public.master_corporate_financial_accounts (
  name, account_type, opening_balance, opening_balance_date,
  is_default, is_active, notes, business_unit
)
SELECT
  'Asaas SV LOTES',
  'DIGITAL_WALLET',
  0,
  CURRENT_DATE,
  false,
  true,
  'Carteira Asaas vinculada ao SV LOTES (Contas a Receber / conciliação). Extrato operacional continua no Caixa SaaS.',
  'SV_LOTES'
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_corporate_financial_accounts a
  WHERE lower(btrim(a.name)) = lower('Asaas SV LOTES')
);

-- Seed: Caixa SV LOTES
INSERT INTO public.master_corporate_financial_accounts (
  name, account_type, opening_balance, opening_balance_date,
  is_default, is_active, notes, business_unit
)
SELECT
  'Caixa SV LOTES',
  'CASH',
  0,
  CURRENT_DATE,
  false,
  true,
  'Caixa corporativo SV LOTES para títulos e recebimentos manuais (não substitui o Caixa SaaS).',
  'SV_LOTES'
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_corporate_financial_accounts a
  WHERE lower(btrim(a.name)) = lower('Caixa SV LOTES')
);

NOTIFY pgrst, 'reload schema';
