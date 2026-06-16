-- Assinatura eletrônica de contratos de compra e venda (tenants / imobiliárias)

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS pdf_signed_url text,
  ADD COLUMN IF NOT EXISTS signature_token text,
  ADD COLUMN IF NOT EXISTS signature_status text,
  ADD COLUMN IF NOT EXISTS signature_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS signed_by_cpf text,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS signed_user_agent text,
  ADD COLUMN IF NOT EXISTS signature_expires_at timestamptz;

COMMENT ON COLUMN public.contracts.signature_token IS
  'Token ativo do link público de assinatura (espelho da última solicitação).';
COMMENT ON COLUMN public.contracts.signature_status IS
  'Status da assinatura eletrônica: PENDING, VIEWED, SIGNED, EXPIRED, CANCELLED.';

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  signer_name text,
  signer_email text,
  signer_document text,
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

CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract_id
  ON public.contract_signatures(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_tenant_id
  ON public.contract_signatures(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_token
  ON public.contract_signatures(signature_token);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_status
  ON public.contract_signatures(signature_status);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_signatures_tenant ON public.contract_signatures;
CREATE POLICY contract_signatures_tenant ON public.contract_signatures
  FOR ALL
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR tenant_id = public.current_tenant_id());

COMMENT ON TABLE public.contract_signatures IS
  'Fluxo de assinatura eletrônica dos contratos de compra e venda (lotes).';

NOTIFY pgrst, 'reload schema';
