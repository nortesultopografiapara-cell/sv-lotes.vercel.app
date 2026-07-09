-- Contas financeiras por empresa (múltiplos recebedores / tokens Asaas)
-- Idempotente · multi-tenant · backfill da integração Asaas legada

CREATE TABLE IF NOT EXISTS public.company_financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'IMOBILIARIA' CHECK (
    account_type IN ('IMOBILIARIA', 'PROPRIETARIO', 'SPE', 'PARCEIRO', 'OUTRO')
  ),
  beneficiary_name text,
  document text,
  email text,
  phone text,
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  bank_integration_id uuid REFERENCES public.bank_integrations(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_company_financial_accounts_company_id
  ON public.company_financial_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_company_financial_accounts_company_active
  ON public.company_financial_accounts(company_id, active)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_financial_accounts_default
  ON public.company_financial_accounts(company_id)
  WHERE is_default = true AND active = true;

CREATE INDEX IF NOT EXISTS idx_company_financial_accounts_integration
  ON public.company_financial_accounts(bank_integration_id)
  WHERE bank_integration_id IS NOT NULL;

-- Vínculos operacionais
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS financial_account_id uuid
  REFERENCES public.company_financial_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS financial_account_id uuid
  REFERENCES public.company_financial_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS financial_account_id uuid
  REFERENCES public.company_financial_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.company_asaas_charges
  ADD COLUMN IF NOT EXISTS financial_account_id uuid
  REFERENCES public.company_financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_financial_account_id
  ON public.projects(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_financial_account_id
  ON public.sales(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_receipts_financial_account_id
  ON public.finance_receipts(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_asaas_charges_financial_account_id
  ON public.company_asaas_charges(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

-- Backfill: integração Asaas legada → conta financeira padrão
INSERT INTO public.company_financial_accounts (
  company_id,
  name,
  account_type,
  beneficiary_name,
  environment,
  bank_integration_id,
  is_default,
  active,
  notes
)
SELECT
  bi.company_id,
  COALESCE(NULLIF(trim(bi.label), ''), 'Conta Padrão'),
  'IMOBILIARIA',
  c.name,
  bi.environment,
  bi.id,
  true,
  COALESCE(bi.active, true),
  'Migrada automaticamente da integração Asaas legada.'
FROM public.bank_integrations bi
JOIN public.companies c ON c.id = bi.company_id
WHERE bi.provider = 'ASAAS_COMPANY'
  AND NOT EXISTS (
    SELECT 1
    FROM public.company_financial_accounts fa
    WHERE fa.company_id = bi.company_id
      AND fa.bank_integration_id = bi.id
  );

-- Garantir uma conta padrão por empresa com integração (primeira ativa)
WITH ranked AS (
  SELECT
    fa.id,
    fa.company_id,
    ROW_NUMBER() OVER (
      PARTITION BY fa.company_id
      ORDER BY fa.is_default DESC, fa.created_at ASC
    ) AS rn
  FROM public.company_financial_accounts fa
  WHERE fa.active = true
)
UPDATE public.company_financial_accounts fa
SET is_default = (ranked.rn = 1)
FROM ranked
WHERE fa.id = ranked.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.company_financial_accounts d
    WHERE d.company_id = fa.company_id
      AND d.is_default = true
      AND d.active = true
  );

-- Backfill vínculos existentes com conta padrão da empresa
UPDATE public.sales s
SET financial_account_id = fa.id
FROM public.company_financial_accounts fa
WHERE fa.company_id = s.company_id
  AND fa.is_default = true
  AND fa.active = true
  AND s.financial_account_id IS NULL;

UPDATE public.finance_receipts fr
SET financial_account_id = fa.id
FROM public.company_financial_accounts fa
WHERE fa.company_id = fr.company_id
  AND fa.is_default = true
  AND fa.active = true
  AND fr.financial_account_id IS NULL;

UPDATE public.company_asaas_charges ch
SET financial_account_id = fa.id
FROM public.company_financial_accounts fa
WHERE fa.company_id = ch.company_id
  AND fa.is_default = true
  AND fa.active = true
  AND ch.financial_account_id IS NULL;

UPDATE public.projects p
SET financial_account_id = fa.id
FROM public.company_financial_accounts fa
WHERE fa.company_id::text = p.tenant_id
  AND fa.is_default = true
  AND fa.active = true
  AND p.financial_account_id IS NULL;

ALTER TABLE public.company_financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_financial_accounts_tenant ON public.company_financial_accounts;
CREATE POLICY company_financial_accounts_tenant ON public.company_financial_accounts
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_financial_accounts IS
  'Contas financeiras/recebedoras por empresa — cada conta pode ter integração Asaas própria (bank_integrations).';

NOTIFY pgrst, 'reload schema';
