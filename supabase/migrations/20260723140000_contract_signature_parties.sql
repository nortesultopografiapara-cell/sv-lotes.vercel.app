-- Participantes individuais da assinatura eletrônica de contratos de venda.
-- contract_signatures continua sendo o processo/documento; parties = BUYER | SPOUSE | VENDOR.

ALTER TABLE public.contract_signatures
  DROP CONSTRAINT IF EXISTS contract_signatures_signature_status_check;

ALTER TABLE public.contract_signatures
  ADD CONSTRAINT contract_signatures_signature_status_check
  CHECK (
    signature_status IN (
      'PENDING',
      'VIEWED',
      'PARTIALLY_SIGNED',
      'CLIENT_SIGNED',
      'SIGNED',
      'EXPIRED',
      'CANCELLED'
    )
  );

CREATE TABLE IF NOT EXISTS public.contract_signature_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  contract_signature_id uuid NOT NULL
    REFERENCES public.contract_signatures(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL
    REFERENCES public.contracts(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  role text NOT NULL
    CHECK (role IN ('BUYER', 'SPOUSE', 'VENDOR')),
  signer_name text,
  signer_cpf text,
  signer_phone text,
  signer_email text,
  signature_token_hash text,
  signature_url text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'VIEWED',
        'SIGNED',
        'CANCELLED',
        'EXPIRED',
        'ERROR'
      )
    ),
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  signature_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  signature_hash text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT contract_signature_parties_unique_role
    UNIQUE (contract_signature_id, role)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_token_hash
  ON public.contract_signature_parties(signature_token_hash)
  WHERE signature_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_signature_id
  ON public.contract_signature_parties(contract_signature_id);

CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_contract_id
  ON public.contract_signature_parties(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_company_id
  ON public.contract_signature_parties(company_id);

CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_sale_id
  ON public.contract_signature_parties(sale_id);

CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_status
  ON public.contract_signature_parties(status);

ALTER TABLE public.contract_signature_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_signature_parties_tenant ON public.contract_signature_parties;
CREATE POLICY contract_signature_parties_tenant ON public.contract_signature_parties
  FOR ALL
  USING (
    public.is_super_admin()
    OR company_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR company_id = public.current_tenant_id()
  );

COMMENT ON TABLE public.contract_signature_parties IS
  'Participantes individuais (BUYER/SPOUSE/VENDOR) de um processo contract_signatures.';

COMMENT ON COLUMN public.contract_signature_parties.signature_token_hash IS
  'SHA-256 do token público. Token em texto puro não é persistido nesta coluna.';

COMMENT ON COLUMN public.contract_signature_parties.signature_url IS
  'URL pública do link (apenas BUYER/SPOUSE). Usada para compartilhamento administrativo.';

NOTIFY pgrst, 'reload schema';
