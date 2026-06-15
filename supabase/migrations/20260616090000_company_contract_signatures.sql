-- Assinatura eletrônica de contratos SaaS (Fase 2)

ALTER TABLE public.company_contracts
  ADD COLUMN IF NOT EXISTS pdf_signed_url text;

COMMENT ON COLUMN public.company_contracts.pdf_signed_url IS
  'PDF final assinado (original + certificado). Não sobrescreve contract_url.';

CREATE TABLE IF NOT EXISTS public.company_contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.company_contracts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signer_name text,
  signer_email text,
  signer_document text,
  signer_role text,
  signature_status text NOT NULL DEFAULT 'PENDING'
    CHECK (signature_status IN ('PENDING', 'VIEWED', 'SIGNED', 'EXPIRED', 'CANCELLED')),
  signature_token text NOT NULL UNIQUE,
  signature_url text NOT NULL,
  ip_address text,
  user_agent text,
  viewed_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz NOT NULL,
  signature_hash text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_company_contract_signatures_contract_id
  ON public.company_contract_signatures(contract_id);

CREATE INDEX IF NOT EXISTS idx_company_contract_signatures_company_id
  ON public.company_contract_signatures(company_id);

CREATE INDEX IF NOT EXISTS idx_company_contract_signatures_token
  ON public.company_contract_signatures(signature_token);

CREATE INDEX IF NOT EXISTS idx_company_contract_signatures_status
  ON public.company_contract_signatures(signature_status);

ALTER TABLE public.company_contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_contract_signatures_super_admin ON public.company_contract_signatures;
CREATE POLICY company_contract_signatures_super_admin ON public.company_contract_signatures
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.company_contract_signatures IS
  'Fluxo de assinatura eletrônica dos contratos SaaS';

NOTIFY pgrst, 'reload schema';
