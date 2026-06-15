-- Assinatura bilateral SaaS: cliente assina primeiro, SV assina depois.

ALTER TABLE public.company_contract_signatures
  ADD COLUMN IF NOT EXISTS provider_signer_name text,
  ADD COLUMN IF NOT EXISTS provider_signer_email text,
  ADD COLUMN IF NOT EXISTS provider_signer_document text,
  ADD COLUMN IF NOT EXISTS provider_signer_role text,
  ADD COLUMN IF NOT EXISTS provider_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_signature_hash text,
  ADD COLUMN IF NOT EXISTS provider_ip_address text,
  ADD COLUMN IF NOT EXISTS provider_user_agent text;

ALTER TABLE public.company_contract_signatures
  DROP CONSTRAINT IF EXISTS company_contract_signatures_signature_status_check;

ALTER TABLE public.company_contract_signatures
  ADD CONSTRAINT company_contract_signatures_signature_status_check
  CHECK (signature_status IN (
    'PENDING',
    'VIEWED',
    'CLIENT_SIGNED',
    'SIGNED',
    'EXPIRED',
    'CANCELLED'
  ));

COMMENT ON COLUMN public.company_contract_signatures.provider_signed_at IS
  'Data/hora da assinatura eletrônica da CONTRATADA (SV LOTES).';

NOTIFY pgrst, 'reload schema';
