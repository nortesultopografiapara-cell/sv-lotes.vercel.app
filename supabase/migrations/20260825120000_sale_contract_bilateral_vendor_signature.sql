-- Assinatura bilateral real — contratos de venda (comprador primeiro, vendedor depois).

ALTER TABLE public.contract_signatures
  DROP CONSTRAINT IF EXISTS contract_signatures_signature_status_check;

ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS vendor_signer_name text,
  ADD COLUMN IF NOT EXISTS vendor_signer_email text,
  ADD COLUMN IF NOT EXISTS vendor_signer_document text,
  ADD COLUMN IF NOT EXISTS vendor_signer_role text,
  ADD COLUMN IF NOT EXISTS vendor_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_signature_hash text,
  ADD COLUMN IF NOT EXISTS vendor_ip_address text,
  ADD COLUMN IF NOT EXISTS vendor_user_agent text,
  ADD COLUMN IF NOT EXISTS vendor_phone text,
  ADD COLUMN IF NOT EXISTS vendor_browser text,
  ADD COLUMN IF NOT EXISTS vendor_os text,
  ADD COLUMN IF NOT EXISTS vendor_device text,
  ADD COLUMN IF NOT EXISTS vendor_ip_city text,
  ADD COLUMN IF NOT EXISTS vendor_ip_region text,
  ADD COLUMN IF NOT EXISTS vendor_ip_country text,
  ADD COLUMN IF NOT EXISTS vendor_signed_at_iso text,
  ADD COLUMN IF NOT EXISTS vendor_signature_event_id uuid;

ALTER TABLE public.contract_signatures
  ADD CONSTRAINT contract_signatures_signature_status_check
  CHECK (signature_status IN ('PENDING', 'VIEWED', 'CLIENT_SIGNED', 'SIGNED', 'EXPIRED', 'CANCELLED'));

COMMENT ON COLUMN public.contract_signatures.vendor_signed_at IS
  'Data/hora da assinatura real do PROMITENTE VENDEDOR (imobiliária).';

NOTIFY pgrst, 'reload schema';
