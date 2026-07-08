-- OTP do Portal do Cliente (hash apenas — sem código em texto puro)

CREATE TABLE IF NOT EXISTS public.client_portal_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_key text NOT NULL,
  document_hash text NOT NULL,
  otp_hash text NOT NULL,
  otp_salt text NOT NULL,
  phone_masked text,
  attempts int NOT NULL DEFAULT 0,
  resend_count int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  last_sent_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_client_portal_otp_challenges_lookup
  ON public.client_portal_otp_challenges (link_key, document_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_portal_otp_challenges_expires
  ON public.client_portal_otp_challenges (expires_at);

COMMENT ON TABLE public.client_portal_otp_challenges IS
  'Desafios OTP do Portal do Cliente — somente hash do código.';
