-- Bolepix v2. NÃO EXECUTAR EM PRODUCTION.
-- Não altera c6_boleto_reservations, bank_charges, finance_receipts, credenciais nem o boleto já emitido.

CREATE TABLE IF NOT EXISTS public.c6_bolepix_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  finance_receipt_id uuid NOT NULL,
  external_reference_id text NOT NULL,
  environment text NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED',
  attempt_count integer NOT NULL DEFAULT 1,
  request_fingerprint text NOT NULL,
  last_http_status integer,
  c6_charge_id text,
  retry_allowed boolean NOT NULL DEFAULT false,
  reserved_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT c6_bolepix_reservations_reference_chk CHECK (external_reference_id ~ '^[A-Z0-9]{26}$'),
  CONSTRAINT c6_bolepix_reservations_fingerprint_chk CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT c6_bolepix_reservations_environment_chk CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  CONSTRAINT c6_bolepix_reservations_status_chk CHECK (
    status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')
  ),
  CONSTRAINT c6_bolepix_reservations_reference_unique UNIQUE (company_id, integration_id, external_reference_id),
  CONSTRAINT c6_bolepix_reservations_receipt_unique UNIQUE (company_id, integration_id, finance_receipt_id)
);

CREATE TABLE IF NOT EXISTS public.c6_bolepix_official (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.c6_bolepix_reservations(id),
  company_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  finance_receipt_id uuid NOT NULL,
  c6_id text,
  external_reference_id text NOT NULL,
  digitable_line text,
  bar_code text,
  our_number text,
  pix_copy_paste text,
  pix_qr_image text,
  pix_mime_type text,
  pix_reference text,
  pdf_path text,
  pdf_sha256 text,
  bank_status text,
  settlement_method text,
  billing_type text,
  billing_scheme text,
  amount numeric(14, 2),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT c6_bolepix_official_reference_chk CHECK (external_reference_id ~ '^[A-Z0-9]{26}$'),
  CONSTRAINT c6_bolepix_official_status_chk CHECK (
    bank_status IS NULL OR bank_status IN ('CREATED', 'PAID', 'CANCELED', 'WAITING_CONFIRMATION')
  ),
  CONSTRAINT c6_bolepix_official_settlement_chk CHECK (
    settlement_method IS NULL OR settlement_method IN ('BANK_SLIP', 'PIX')
  )
);

CREATE TABLE IF NOT EXISTS public.c6_bolepix_pix_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  encrypted_key text NOT NULL,
  key_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT c6_bolepix_pix_keys_company_unique UNIQUE (company_id, integration_id),
  CONSTRAINT c6_bolepix_pix_keys_cipher_chk CHECK (encrypted_key ~ '^v1:'),
  CONSTRAINT c6_bolepix_pix_keys_fingerprint_chk CHECK (key_fingerprint ~ '^[a-f0-9]{12}$')
);

ALTER TABLE public.c6_bolepix_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.c6_bolepix_official ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.c6_bolepix_pix_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.c6_bolepix_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.c6_bolepix_official FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.c6_bolepix_pix_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.c6_bolepix_reservations TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.c6_bolepix_official TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.c6_bolepix_pix_keys TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_c6_bolepix(
  p_company_id uuid,
  p_integration_id uuid,
  p_finance_receipt_id uuid,
  p_external_reference_id text,
  p_request_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_environment text;
  v_inserted uuid;
  v_existing public.c6_bolepix_reservations%ROWTYPE;
  v_count integer;
BEGIN
  IF p_external_reference_id !~ '^[A-Z0-9]{26}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Impressão da requisição inválida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_receipts
    WHERE id = p_finance_receipt_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Parcela de outra empresa.';
  END IF;
  SELECT environment INTO v_environment
  FROM public.bank_integrations
  WHERE id = p_integration_id
    AND company_id = p_company_id
    AND provider = 'C6'
    AND environment IN ('SANDBOX', 'PRODUCTION');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integração C6 não encontrada nesta empresa.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-bolepix:' || p_company_id::text || ':' || p_finance_receipt_id::text)
  );

  INSERT INTO public.c6_bolepix_reservations (
    company_id, integration_id, finance_receipt_id, external_reference_id,
    environment, status, request_fingerprint
  ) VALUES (
    p_company_id, p_integration_id, p_finance_receipt_id, p_external_reference_id,
    v_environment, 'RESERVED', p_request_fingerprint
  )
  ON CONFLICT (company_id, integration_id, finance_receipt_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', true, 'reason', 'reserved');
  END IF;

  SELECT * INTO v_existing
  FROM public.c6_bolepix_reservations
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND finance_receipt_id = p_finance_receipt_id
  FOR UPDATE;

  IF v_existing.external_reference_id IS DISTINCT FROM p_external_reference_id THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  IF v_existing.status = 'FAILED'
     AND v_existing.retry_allowed IS TRUE
     AND v_existing.c6_charge_id IS NULL
     AND v_existing.last_http_status IN (400, 401, 403, 404, 422) THEN
    UPDATE public.c6_bolepix_reservations
    SET status = 'RESERVED',
        request_fingerprint = p_request_fingerprint,
        retry_allowed = false,
        last_http_status = NULL,
        attempt_count = attempt_count + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_existing.id
      AND company_id = p_company_id
      AND status = 'FAILED'
      AND retry_allowed IS TRUE
      AND c6_charge_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 1 THEN
      RETURN jsonb_build_object('accepted', true, 'reason', 'retry');
    END IF;
  END IF;
  IF v_existing.status = 'UNKNOWN' THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'needs_reconciliation');
  END IF;
  RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_c6_bolepix(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_status text,
  p_http_status integer,
  p_c6_charge_id text,
  p_retry_allowed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.c6_bolepix_reservations%ROWTYPE;
  v_count integer;
  v_status text;
  v_id text;
  v_retry boolean;
BEGIN
  IF p_external_reference_id !~ '^[A-Z0-9]{26}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Status final inválido.';
  END IF;
  SELECT * INTO v_existing
  FROM public.c6_bolepix_reservations
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND external_reference_id = p_external_reference_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva inexistente.';
  END IF;
  IF v_existing.status IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  v_status := p_status;
  v_id := nullif(btrim(coalesce(p_c6_charge_id, '')), '');
  v_retry := false;
  IF v_status = 'SUCCEEDED' AND (p_http_status IS DISTINCT FROM 201 OR v_id IS NULL) THEN
    v_status := 'UNKNOWN';
  END IF;
  IF v_status = 'FAILED'
     AND p_retry_allowed IS TRUE
     AND v_id IS NULL
     AND p_http_status IN (400, 401, 403, 404, 422) THEN
    v_retry := true;
  END IF;
  IF v_status <> 'FAILED' THEN
    v_retry := false;
  END IF;
  IF v_status = 'FAILED' THEN
    v_id := NULL;
  END IF;
  UPDATE public.c6_bolepix_reservations
  SET status = v_status,
      last_http_status = p_http_status,
      c6_charge_id = v_id,
      retry_allowed = v_retry,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_existing.id
    AND company_id = p_company_id
    AND status IN ('RESERVED', 'PROCESSING');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'reason', v_status, 'retry_allowed', v_retry);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean) TO service_role;

COMMENT ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) IS
  'Reserva Bolepix v2 por parcela. Não altera a reserva v1 nem o recebível.';
