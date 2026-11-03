-- Comprador pessoa jurídica e representantes legais.
-- Aditiva: não altera registros existentes, não faz backfill e não remove constraints atuais.
-- Não executar em Production sem autorização explícita.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS person_type text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS legal_representatives_json jsonb,
  ADD COLUMN IF NOT EXISTS buyer_signature_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_person_type_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_person_type_check
      CHECK (person_type IS NULL OR person_type IN ('PF', 'PJ'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_buyer_signature_mode_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_buyer_signature_mode_check
      CHECK (buyer_signature_mode IS NULL OR buyer_signature_mode IN ('INDIVIDUAL', 'JOINT'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_legal_representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text NOT NULL,
  cpf_digits text NOT NULL,
  rg text,
  rg_issuer text,
  rg_issuer_state text,
  nationality text,
  marital_status text,
  profession text,
  role_title text,
  phone text,
  email text,
  representation_document text,
  signs boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_legal_representatives_cpf_digits_len'
  ) THEN
    ALTER TABLE public.customer_legal_representatives
      ADD CONSTRAINT customer_legal_representatives_cpf_digits_len
      CHECK (char_length(cpf_digits) = 11);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customer_legal_representatives_company_customer_cpf_uidx
  ON public.customer_legal_representatives (company_id, customer_id, cpf_digits);

CREATE INDEX IF NOT EXISTS customer_legal_representatives_company_customer_idx
  ON public.customer_legal_representatives (company_id, customer_id);

ALTER TABLE public.customer_legal_representatives ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_legal_representatives'
      AND policyname = 'customer_legal_representatives_tenant_all'
  ) THEN
    CREATE POLICY customer_legal_representatives_tenant_all
      ON public.customer_legal_representatives
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS buyer_person_type text,
  ADD COLUMN IF NOT EXISTS buyer_signature_mode text,
  ADD COLUMN IF NOT EXISTS buyer_representatives_json jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_buyer_person_type_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_buyer_person_type_check
      CHECK (buyer_person_type IS NULL OR buyer_person_type IN ('PF', 'PJ'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_buyer_signature_mode_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_buyer_signature_mode_check
      CHECK (buyer_signature_mode IS NULL OR buyer_signature_mode IN ('INDIVIDUAL', 'JOINT'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales.buyer_representatives_json IS
  'Snapshot dos representantes legais no momento da venda. Alterações posteriores no cadastro não reescrevem o contrato já emitido.';

ALTER TABLE public.contract_signature_parties
  DROP CONSTRAINT IF EXISTS contract_signature_parties_role_check;

ALTER TABLE public.contract_signature_parties
  ADD CONSTRAINT contract_signature_parties_role_check
  CHECK (
    role IN (
      'BUYER',
      'SPOUSE',
      'VENDOR',
      'INTERVENIENT',
      'WITNESS_1',
      'WITNESS_2',
      'LEGAL_REPRESENTATIVE'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_unique_legal_rep_cpf
  ON public.contract_signature_parties (contract_signature_id, signer_cpf)
  WHERE role = 'LEGAL_REPRESENTATIVE' AND signer_cpf IS NOT NULL;

NOTIFY pgrst, 'reload schema';
