-- Tokens independentes por parte + geolocalização opcional (novas assinaturas).
ALTER TABLE public.company_contract_signatures
  ADD COLUMN IF NOT EXISTS provider_signature_token TEXT,
  ADD COLUMN IF NOT EXISTS signer_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS signer_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS signer_geo_city TEXT,
  ADD COLUMN IF NOT EXISTS provider_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS provider_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS provider_geo_city TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_contract_signatures_provider_token_unique
  ON public.company_contract_signatures (provider_signature_token)
  WHERE provider_signature_token IS NOT NULL;

COMMENT ON COLUMN public.company_contract_signatures.provider_signature_token IS
  'Token exclusivo da assinatura da CONTRATADA (SV). Distinto do signature_token do cliente.';
