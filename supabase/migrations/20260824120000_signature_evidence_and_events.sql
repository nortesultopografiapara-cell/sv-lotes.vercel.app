-- Evidências eletrônicas ampliadas + histórico público de eventos de assinatura.

-- Venda (contratos de lote)
ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS signer_phone text,
  ADD COLUMN IF NOT EXISTS signer_browser text,
  ADD COLUMN IF NOT EXISTS signer_os text,
  ADD COLUMN IF NOT EXISTS signer_device text,
  ADD COLUMN IF NOT EXISTS signer_ip_city text,
  ADD COLUMN IF NOT EXISTS signer_ip_region text,
  ADD COLUMN IF NOT EXISTS signer_ip_country text,
  ADD COLUMN IF NOT EXISTS signed_at_iso text,
  ADD COLUMN IF NOT EXISTS signature_event_id uuid,
  ADD COLUMN IF NOT EXISTS signed_document_type text DEFAULT 'CONTRATO_VENDA',
  ADD COLUMN IF NOT EXISTS validation_public_url text,
  ADD COLUMN IF NOT EXISTS certificate_status text DEFAULT 'VALIDADO';

-- SaaS (contratos bilaterais)
ALTER TABLE public.company_contract_signatures
  ADD COLUMN IF NOT EXISTS signer_phone text,
  ADD COLUMN IF NOT EXISTS signer_browser text,
  ADD COLUMN IF NOT EXISTS signer_os text,
  ADD COLUMN IF NOT EXISTS signer_device text,
  ADD COLUMN IF NOT EXISTS signer_ip_city text,
  ADD COLUMN IF NOT EXISTS signer_ip_region text,
  ADD COLUMN IF NOT EXISTS signer_ip_country text,
  ADD COLUMN IF NOT EXISTS signed_at_iso text,
  ADD COLUMN IF NOT EXISTS signature_event_id uuid,
  ADD COLUMN IF NOT EXISTS signed_document_type text DEFAULT 'CONTRATO_SAAS',
  ADD COLUMN IF NOT EXISTS validation_public_url text,
  ADD COLUMN IF NOT EXISTS certificate_status text DEFAULT 'VALIDADO',
  ADD COLUMN IF NOT EXISTS provider_signer_phone text,
  ADD COLUMN IF NOT EXISTS provider_browser text,
  ADD COLUMN IF NOT EXISTS provider_os text,
  ADD COLUMN IF NOT EXISTS provider_device text,
  ADD COLUMN IF NOT EXISTS provider_ip_city text,
  ADD COLUMN IF NOT EXISTS provider_ip_region text,
  ADD COLUMN IF NOT EXISTS provider_ip_country text,
  ADD COLUMN IF NOT EXISTS provider_signed_at_iso text,
  ADD COLUMN IF NOT EXISTS provider_signature_event_id uuid;

COMMENT ON COLUMN public.contract_signatures.signed_document_type IS
  'CONTRATO_SAAS | CONTRATO_VENDA | TERMO | OUTRO';
COMMENT ON COLUMN public.company_contract_signatures.signed_document_type IS
  'CONTRATO_SAAS | CONTRATO_VENDA | TERMO | OUTRO';

CREATE TABLE IF NOT EXISTS public.signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_token text NOT NULL,
  signature_source text NOT NULL CHECK (signature_source IN ('SAAS', 'SALE')),
  signature_record_id uuid,
  event_type text NOT NULL,
  person_name text,
  person_email text,
  person_phone text,
  ip_address text,
  ip_port text,
  user_agent text,
  event_description text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signature_events_token
  ON public.signature_events(signature_token);

CREATE INDEX IF NOT EXISTS idx_signature_events_occurred
  ON public.signature_events(occurred_at DESC);

ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signature_events_super_admin ON public.signature_events;
CREATE POLICY signature_events_super_admin ON public.signature_events
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.signature_events IS
  'Histórico de eventos da assinatura eletrônica (geração, visualização, assinatura, validação).';

NOTIFY pgrst, 'reload schema';
