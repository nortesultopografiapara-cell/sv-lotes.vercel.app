-- Bolepix v2. NÃO EXECUTAR EM PRODUCTION (aezktedncttwpqeunjej).
-- Não altera linhas de c6_boleto_reservations, bank_charges, finance_receipts nem credenciais.
-- O trigger novo só recusa um INSERT v1 quando a mesma parcela já tem reserva v2.
-- Rollback, com as tabelas vazias e somente no Develop:
--   DROP TRIGGER IF EXISTS trg_c6_boleto_reservations_block_bolepix ON public.c6_boleto_reservations;
--   DROP FUNCTION IF EXISTS public.c6_bolepix_reject_v1_when_v2_exists();
--   DROP FUNCTION IF EXISTS public.reserve_c6_bolepix(uuid, uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean);
--   DROP TABLE IF EXISTS public.c6_bolepix_pix_keys, public.c6_bolepix_official, public.c6_bolepix_reservations;

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
  CONSTRAINT c6_bolepix_reservations_receipt_unique UNIQUE (company_id, integration_id, finance_receipt_id),
  CONSTRAINT c6_bolepix_reservations_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_reservations_integration_fk FOREIGN KEY (integration_id) REFERENCES public.bank_integrations(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_reservations_receipt_fk FOREIGN KEY (finance_receipt_id) REFERENCES public.finance_receipts(id) ON DELETE RESTRICT
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
  ),
  CONSTRAINT c6_bolepix_official_receipt_unique UNIQUE (company_id, finance_receipt_id),
  CONSTRAINT c6_bolepix_official_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_official_integration_fk FOREIGN KEY (integration_id) REFERENCES public.bank_integrations(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_official_receipt_fk FOREIGN KEY (finance_receipt_id) REFERENCES public.finance_receipts(id) ON DELETE RESTRICT
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
  CONSTRAINT c6_bolepix_pix_keys_fingerprint_chk CHECK (key_fingerprint ~ '^[a-f0-9]{12}$'),
  CONSTRAINT c6_bolepix_pix_keys_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_pix_keys_integration_fk FOREIGN KEY (integration_id) REFERENCES public.bank_integrations(id) ON DELETE RESTRICT
);

ALTER TABLE public.c6_bolepix_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.c6_bolepix_official ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.c6_bolepix_pix_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.c6_bolepix_reservations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.c6_bolepix_official FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.c6_bolepix_pix_keys FROM PUBLIC, anon, authenticated, service_role;
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
  v_v1_ref text;
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

  v_v1_ref := upper(right(regexp_replace(p_finance_receipt_id::text, '[^A-Za-z0-9]', '', 'g'), 10));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-charge:' || p_company_id::text || ':' || p_finance_receipt_id::text)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-boleto:' || p_company_id::text || ':' || p_integration_id::text || ':' || v_v1_ref)
  );

  IF EXISTS (
    SELECT 1
    FROM public.bank_charges
    WHERE company_id = p_company_id
      AND finance_receipt_id = p_finance_receipt_id
      AND provider = 'C6'
      AND nullif(btrim(external_id), '') IS NOT NULL
      AND status NOT IN ('CANCELLED', 'EXPIRED')
  ) OR EXISTS (
    SELECT 1
    FROM public.c6_boleto_reservations
    WHERE company_id = p_company_id
      AND integration_id = p_integration_id
      AND upper(external_reference_id) = v_v1_ref
      AND (
        status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN')
        OR nullif(btrim(c6_bank_slip_id), '') IS NOT NULL
      )
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
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
ALTER FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean) OWNER TO postgres;

COMMENT ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) IS
  'Reserva Bolepix v2 por parcela. Recusa parcela que já tenha cobrança C6 ou reserva v1 ativa. Não altera a reserva v1 nem o recebível.';

CREATE OR REPLACE FUNCTION public.c6_bolepix_reject_v1_when_v2_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.c6_bolepix_reservations
    WHERE company_id = NEW.company_id
      AND integration_id = NEW.integration_id
      AND upper(right(regexp_replace(finance_receipt_id::text, '[^A-Za-z0-9]', '', 'g'), 10))
        = upper(NEW.external_reference_id)
  ) THEN
    RAISE EXCEPTION 'A parcela já possui reserva Bolepix v2.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_c6_boleto_reservations_block_bolepix ON public.c6_boleto_reservations;
CREATE TRIGGER trg_c6_boleto_reservations_block_bolepix
  BEFORE INSERT ON public.c6_boleto_reservations
  FOR EACH ROW
  EXECUTE PROCEDURE public.c6_bolepix_reject_v1_when_v2_exists();

ALTER FUNCTION public.c6_bolepix_reject_v1_when_v2_exists() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.c6_bolepix_reject_v1_when_v2_exists() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.c6_bolepix_official_same_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_reservation public.c6_bolepix_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM public.c6_bolepix_reservations
  WHERE id = NEW.reservation_id;
  IF NOT FOUND
     OR v_reservation.company_id IS DISTINCT FROM NEW.company_id
     OR v_reservation.integration_id IS DISTINCT FROM NEW.integration_id
     OR v_reservation.finance_receipt_id IS DISTINCT FROM NEW.finance_receipt_id THEN
    RAISE EXCEPTION 'Cobrança oficial de outra empresa ou parcela.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_c6_bolepix_official_same_company ON public.c6_bolepix_official;
CREATE TRIGGER trg_c6_bolepix_official_same_company
  BEFORE INSERT OR UPDATE ON public.c6_bolepix_official
  FOR EACH ROW
  EXECUTE PROCEDURE public.c6_bolepix_official_same_company();

ALTER FUNCTION public.c6_bolepix_official_same_company() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.c6_bolepix_official_same_company() FROM PUBLIC, anon, authenticated, service_role;
