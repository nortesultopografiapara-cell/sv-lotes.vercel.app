-- Bolepix v2: histórico de nova tentativa após rejeição reconciliada.
-- NÃO APLICAR em Production (aezktedncttwpqeunjej) sem autorização específica.
-- Não apaga nem reescreve c6_bolepix_reservations, finance_receipts, bank_charges,
-- vendas, contratos, caixa, credenciais ou a EVP.
--
-- Rollback, somente com autorização e enquanto c6_bolepix_attempts estiver vazia:
--   DROP FUNCTION IF EXISTS public.complete_c6_bolepix_attempt(uuid, uuid, text, text, integer, text, text);
--   DROP FUNCTION IF EXISTS public.claim_c6_bolepix_attempt(uuid, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.prepare_c6_bolepix_attempt(uuid, uuid, uuid, uuid, text, text, integer, text, text, uuid);
--   DROP TABLE IF EXISTS public.c6_bolepix_attempts;
--   Reaplicar reserve_c6_bolepix, complete_c6_bolepix e c6_bolepix_reject_v1_when_v2_exists
--   a partir de 20261123193000_c6_bolepix_close_v1_retry_race.sql e
--   20261123120000_c6_bolepix_v2_reservation.sql.

CREATE TABLE IF NOT EXISTS public.c6_bolepix_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  financial_account_id uuid NOT NULL,
  finance_receipt_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  external_reference_id text NOT NULL,
  environment text NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED',
  last_http_status integer,
  bank_diagnostic text,
  c6_charge_id text,
  prior_reservation_id uuid NOT NULL,
  prior_external_reference_id text NOT NULL,
  reconciliation_http integer NOT NULL,
  reconciliation_trace text,
  reconciliation_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  authorized_by uuid NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  request_fingerprint text NOT NULL,
  retry_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT c6_bolepix_attempts_number_chk CHECK (attempt_number >= 2),
  CONSTRAINT c6_bolepix_attempts_reference_chk CHECK (external_reference_id ~ '^[A-Z0-9]{26}$'),
  CONSTRAINT c6_bolepix_attempts_prior_reference_chk CHECK (prior_external_reference_id ~ '^[A-Z0-9]{26}$'),
  CONSTRAINT c6_bolepix_attempts_distinct_reference_chk CHECK (external_reference_id <> prior_external_reference_id),
  CONSTRAINT c6_bolepix_attempts_fingerprint_chk CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT c6_bolepix_attempts_environment_chk CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  CONSTRAINT c6_bolepix_attempts_status_chk CHECK (status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  CONSTRAINT c6_bolepix_attempts_retry_chk CHECK (retry_allowed = false),
  CONSTRAINT c6_bolepix_attempts_reconcile_chk CHECK (reconciliation_http = 404),
  CONSTRAINT c6_bolepix_attempts_trace_chk CHECK (
    reconciliation_trace IS NULL OR reconciliation_trace ~ '^[A-Za-z0-9._:-]{6,80}$'
  ),
  CONSTRAINT c6_bolepix_attempts_diagnostic_chk CHECK (
    bank_diagnostic IS NULL OR char_length(bank_diagnostic) <= 2000
  ),
  CONSTRAINT c6_bolepix_attempts_reference_unique UNIQUE (company_id, external_reference_id),
  CONSTRAINT c6_bolepix_attempts_number_unique UNIQUE (company_id, integration_id, finance_receipt_id, attempt_number),
  CONSTRAINT c6_bolepix_attempts_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_attempts_integration_fk FOREIGN KEY (integration_id) REFERENCES public.bank_integrations(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_attempts_account_fk FOREIGN KEY (financial_account_id) REFERENCES public.company_financial_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_attempts_receipt_fk FOREIGN KEY (finance_receipt_id) REFERENCES public.finance_receipts(id) ON DELETE RESTRICT,
  CONSTRAINT c6_bolepix_attempts_prior_fk FOREIGN KEY (prior_reservation_id) REFERENCES public.c6_bolepix_reservations(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_c6_bolepix_attempts_one_open
  ON public.c6_bolepix_attempts (company_id, finance_receipt_id)
  WHERE status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN');

ALTER TABLE public.c6_bolepix_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.c6_bolepix_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.c6_bolepix_attempts TO service_role;

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
        OR (status = 'FAILED' AND retry_allowed IS TRUE)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.c6_bolepix_attempts
    WHERE company_id = p_company_id
      AND finance_receipt_id = p_finance_receipt_id
      AND status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN')
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
  IF v_existing.status = 'UNKNOWN' OR v_existing.status = 'FAILED' THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'reason', CASE WHEN v_existing.status = 'UNKNOWN' THEN 'needs_reconciliation' ELSE 'blocked' END
    );
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
  IF v_status = 'SUCCEEDED' AND (p_http_status IS DISTINCT FROM 201 OR v_id IS NULL) THEN
    v_status := 'UNKNOWN';
  END IF;
  IF v_status = 'FAILED' THEN
    v_id := NULL;
  END IF;
  UPDATE public.c6_bolepix_reservations
  SET status = v_status,
      last_http_status = p_http_status,
      c6_charge_id = v_id,
      retry_allowed = false,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_existing.id
    AND company_id = p_company_id
    AND status IN ('RESERVED', 'PROCESSING');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'reason', v_status, 'retry_allowed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_c6_bolepix_attempt(
  p_company_id uuid,
  p_integration_id uuid,
  p_financial_account_id uuid,
  p_finance_receipt_id uuid,
  p_external_reference_id text,
  p_request_fingerprint text,
  p_reconciliation_http integer,
  p_reconciliation_trace text,
  p_bank_diagnostic text,
  p_authorized_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_prior public.c6_bolepix_reservations%ROWTYPE;
  v_environment text;
  v_attempt integer;
  v_v1_ref text;
  v_id uuid;
BEGIN
  IF p_external_reference_id !~ '^[A-Z0-9]{26}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Impressão da requisição inválida.';
  END IF;
  IF p_reconciliation_http IS DISTINCT FROM 404 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'not_reconciled');
  END IF;
  IF p_reconciliation_trace IS NOT NULL AND p_reconciliation_trace !~ '^[A-Za-z0-9._:-]{6,80}$' THEN
    RAISE EXCEPTION 'Rastreio inválido.';
  END IF;
  IF p_bank_diagnostic IS NOT NULL AND char_length(p_bank_diagnostic) > 2000 THEN
    RAISE EXCEPTION 'Diagnóstico excede o limite.';
  END IF;
  IF p_authorized_by IS NULL THEN
    RAISE EXCEPTION 'Autorização administrativa ausente.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-bolepix:' || p_company_id::text || ':' || p_finance_receipt_id::text)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_receipts
    WHERE id = p_finance_receipt_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Parcela de outra empresa.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_financial_accounts
    WHERE id = p_financial_account_id
      AND company_id = p_company_id
      AND bank_integration_id = p_integration_id
  ) THEN
    RAISE EXCEPTION 'Integração de outra empresa.';
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

  SELECT * INTO v_prior
  FROM public.c6_bolepix_reservations
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND finance_receipt_id = p_finance_receipt_id
  FOR UPDATE;
  IF NOT FOUND OR v_prior.status <> 'FAILED' OR v_prior.c6_charge_id IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  IF v_prior.last_http_status NOT IN (400, 409, 422) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  IF p_external_reference_id = v_prior.external_reference_id THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'reference_reused');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.c6_bolepix_reservations
    WHERE company_id = p_company_id
      AND external_reference_id = p_external_reference_id
  ) OR EXISTS (
    SELECT 1 FROM public.c6_bolepix_attempts
    WHERE company_id = p_company_id
      AND external_reference_id = p_external_reference_id
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'reference_reused');
  END IF;

  v_v1_ref := upper(right(regexp_replace(p_finance_receipt_id::text, '[^A-Za-z0-9]', '', 'g'), 10));
  IF EXISTS (
    SELECT 1 FROM public.bank_charges
    WHERE company_id = p_company_id
      AND finance_receipt_id = p_finance_receipt_id
      AND provider = 'C6'
      AND nullif(btrim(external_id), '') IS NOT NULL
      AND status NOT IN ('CANCELLED', 'EXPIRED')
  ) OR EXISTS (
    SELECT 1 FROM public.c6_boleto_reservations
    WHERE company_id = p_company_id
      AND integration_id = p_integration_id
      AND upper(external_reference_id) = v_v1_ref
      AND (
        status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN')
        OR nullif(btrim(c6_bank_slip_id), '') IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1 FROM public.c6_bolepix_attempts
    WHERE company_id = p_company_id
      AND finance_receipt_id = p_finance_receipt_id
      AND (
        status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN')
        OR c6_charge_id IS NOT NULL
      )
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;

  SELECT COALESCE(MAX(attempt_number), 1) + 1 INTO v_attempt
  FROM public.c6_bolepix_attempts
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND finance_receipt_id = p_finance_receipt_id;

  INSERT INTO public.c6_bolepix_attempts (
    company_id, integration_id, financial_account_id, finance_receipt_id,
    attempt_number, external_reference_id, environment, status,
    bank_diagnostic, prior_reservation_id, prior_external_reference_id,
    reconciliation_http, reconciliation_trace, authorized_by, request_fingerprint
  ) VALUES (
    p_company_id, p_integration_id, p_financial_account_id, p_finance_receipt_id,
    v_attempt, p_external_reference_id, v_environment, 'RESERVED',
    p_bank_diagnostic, v_prior.id, v_prior.external_reference_id,
    404, p_reconciliation_trace, p_authorized_by, p_request_fingerprint
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'accepted', true,
    'reason', 'prepared',
    'attempt_id', v_id,
    'attempt_number', v_attempt,
    'external_reference_id', p_external_reference_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_c6_bolepix_attempt(
  p_company_id uuid,
  p_integration_id uuid,
  p_finance_receipt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-bolepix:' || p_company_id::text || ':' || p_finance_receipt_id::text)
  );
  UPDATE public.c6_bolepix_attempts
  SET status = 'PROCESSING',
      updated_at = timezone('utc'::text, now())
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND finance_receipt_id = p_finance_receipt_id
    AND status = 'RESERVED'
    AND c6_charge_id IS NULL
    AND last_http_status IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'reason', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_c6_bolepix_attempt(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_status text,
  p_http_status integer,
  p_c6_charge_id text,
  p_bank_diagnostic text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.c6_bolepix_attempts%ROWTYPE;
  v_count integer;
  v_status text;
  v_id text;
BEGIN
  IF p_external_reference_id !~ '^[A-Z0-9]{26}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Status final inválido.';
  END IF;
  IF p_bank_diagnostic IS NOT NULL AND char_length(p_bank_diagnostic) > 2000 THEN
    RAISE EXCEPTION 'Diagnóstico excede o limite.';
  END IF;
  SELECT * INTO v_existing
  FROM public.c6_bolepix_attempts
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND external_reference_id = p_external_reference_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa inexistente.';
  END IF;
  IF v_existing.status IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  v_status := p_status;
  v_id := nullif(btrim(coalesce(p_c6_charge_id, '')), '');
  IF v_status = 'SUCCEEDED' AND (p_http_status IS DISTINCT FROM 201 OR v_id IS NULL) THEN
    v_status := 'UNKNOWN';
  END IF;
  IF v_status = 'FAILED' THEN
    v_id := NULL;
  END IF;
  UPDATE public.c6_bolepix_attempts
  SET status = v_status,
      last_http_status = p_http_status,
      c6_charge_id = v_id,
      bank_diagnostic = COALESCE(p_bank_diagnostic, bank_diagnostic),
      retry_allowed = false,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_existing.id
    AND company_id = p_company_id
    AND status IN ('RESERVED', 'PROCESSING');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'reason', v_status, 'retry_allowed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.c6_bolepix_reject_v1_when_v2_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'c6-boleto:' || NEW.company_id::text || ':' || NEW.integration_id::text || ':' || upper(btrim(NEW.external_reference_id))
    )
  );
  IF TG_OP = 'UPDATE'
     AND NOT (NEW.status = 'RESERVED' AND OLD.status IS DISTINCT FROM 'RESERVED') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.c6_bolepix_reservations
    WHERE company_id = NEW.company_id
      AND integration_id = NEW.integration_id
      AND upper(right(regexp_replace(finance_receipt_id::text, '[^A-Za-z0-9]', '', 'g'), 10))
        = upper(NEW.external_reference_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.c6_bolepix_attempts
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

REVOKE ALL ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_c6_bolepix_attempt(uuid, uuid, uuid, uuid, text, text, integer, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_c6_bolepix_attempt(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_c6_bolepix_attempt(uuid, uuid, text, text, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c6_bolepix_reject_v1_when_v2_exists()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_c6_bolepix_attempt(uuid, uuid, uuid, uuid, text, text, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_c6_bolepix_attempt(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_bolepix_attempt(uuid, uuid, text, text, integer, text, text) TO service_role;

ALTER FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.complete_c6_bolepix(uuid, uuid, text, text, integer, text, boolean) OWNER TO postgres;
ALTER FUNCTION public.prepare_c6_bolepix_attempt(uuid, uuid, uuid, uuid, text, text, integer, text, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.claim_c6_bolepix_attempt(uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.complete_c6_bolepix_attempt(uuid, uuid, text, text, integer, text, text) OWNER TO postgres;
ALTER FUNCTION public.c6_bolepix_reject_v1_when_v2_exists() OWNER TO postgres;
