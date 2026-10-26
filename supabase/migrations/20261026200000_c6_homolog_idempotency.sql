-- C6 Bank Fase 3B.3 / 3B.3A - c6_homolog_idempotency (Sandbox boleto).
-- EXCLUSIVE to Supabase Develop (hoynysmynxncdlptuzub).
-- DO NOT APPLY on Production.
-- DO NOT APPLY on Develop without explicit authorization.
-- Idempotent. No emit. No PII. No tokens/certs.
-- 3B.3A final: SHA-256 fingerprint required and immutable; payload_mismatch;
-- mark_processing requires attempt_count; UNKNOWN stays blocked;
-- client JSON is not bank proof; isolated HTTP 404 is not absence;
-- official OpenAPI GET is only /v1/bank_slips/{id}; no undocumented consult;
-- deny anon/authenticated JWT; search_path public, pg_temp; service_role writes only.

CREATE TABLE IF NOT EXISTS public.c6_homolog_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.bank_integrations(id) ON DELETE CASCADE,
  external_reference_id text NOT NULL,
  environment text NOT NULL DEFAULT 'SANDBOX',
  scenario text NOT NULL DEFAULT 'B_01',
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  request_fingerprint text NOT NULL,
  last_http_status integer,
  last_error_code text,
  last_error_message text,
  c6_bank_slip_id text,
  reserved_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  processing_at timestamptz,
  completed_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT c6_homolog_idempotency_unique
    UNIQUE (company_id, integration_id, external_reference_id)
);

ALTER TABLE public.c6_homolog_idempotency
  ALTER COLUMN request_fingerprint SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_environment_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_environment_check
      CHECK (environment = 'SANDBOX');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_status_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_status_check
      CHECK (status IN ('RESERVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_ref_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_ref_check
      CHECK (external_reference_id ~ '^[a-zA-Z0-9]{1,10}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_attempt_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_attempt_check
      CHECK (attempt_count >= 1);
  END IF;

  ALTER TABLE public.c6_homolog_idempotency
    DROP CONSTRAINT IF EXISTS c6_homolog_idempotency_fingerprint_check;
  ALTER TABLE public.c6_homolog_idempotency
    ADD CONSTRAINT c6_homolog_idempotency_fingerprint_check
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_scenario_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_scenario_check
      CHECK (char_length(scenario) BETWEEN 1 AND 16);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c6_homolog_idempotency_bank_slip_id_check'
  ) THEN
    ALTER TABLE public.c6_homolog_idempotency
      ADD CONSTRAINT c6_homolog_idempotency_bank_slip_id_check
      CHECK (c6_bank_slip_id IS NULL OR char_length(c6_bank_slip_id) BETWEEN 1 AND 80);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS c6_homolog_idempotency_company_status_idx
  ON public.c6_homolog_idempotency (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS c6_homolog_idempotency_integration_idx
  ON public.c6_homolog_idempotency (integration_id, last_attempt_at DESC);

COMMENT ON TABLE public.c6_homolog_idempotency IS
  'Controle transacional de homologacao C6 B_01 (Sandbox). UNIQUE por empresa+integracao+referencia. UNKNOWN permanece bloqueado ate confirmacao bancaria verificavel. JSON do cliente nao e prova. HTTP 404 isolado nao prova ausencia. OpenAPI oficial: GET somente /v1/bank_slips/{id}. Sem consulta por external_reference_id.';

COMMENT ON COLUMN public.c6_homolog_idempotency.request_fingerprint IS
  'SHA-256 hex (64) obrigatorio e imutavel. Mesma referencia com outro payload => payload_mismatch.';

COMMENT ON COLUMN public.c6_homolog_idempotency.status IS
  'RESERVED=slot obtido; PROCESSING=HTTP em voo; SUCCEEDED=201; FAILED=erro conhecido sem criacao; UNKNOWN=timeout/5xx/indefinido (nao e retry seguro).';

ALTER TABLE public.c6_homolog_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS c6_homolog_idempotency_tenant ON public.c6_homolog_idempotency;
DROP POLICY IF EXISTS c6_homolog_idempotency_tenant_select ON public.c6_homolog_idempotency;
CREATE POLICY c6_homolog_idempotency_tenant_select ON public.c6_homolog_idempotency
  FOR SELECT
  USING (public.is_super_admin() OR company_id = public.current_tenant_id());

REVOKE ALL ON TABLE public.c6_homolog_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.c6_homolog_idempotency FROM anon;
REVOKE ALL ON TABLE public.c6_homolog_idempotency FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.c6_homolog_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.c6_homolog_sanitize_error(p_message text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            coalesce(p_message, ''),
            '(?i)(access_token|client_secret)[[:space:]]*[=:][[:space:]]*[^[:space:]]+',
            '[redacted]',
            'g'
          ),
          '(?i)Bearer[[:space:]]+[^[:space:]]+',
          'Bearer [redacted]',
          'g'
        ),
        '(?i)(access_token|client_secret|BEGIN [A-Z ]*PRIVATE KEY|BEGIN CERTIFICATE)',
        '[redacted]',
        'g'
      ),
      '\d{11,14}',
      '[id-redacted]',
      'g'
    ),
    240
  );
$$;

CREATE OR REPLACE FUNCTION public.c6_homolog_deny_browser_jwt()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  BEGIN
    v_role := coalesce(auth.role(), '');
  EXCEPTION
    WHEN undefined_function THEN
      v_role := '';
  END;
  IF v_role = '' THEN
    v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  END IF;
  IF v_role IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'c6 homolog rpc denied';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.c6_homolog_assert_sandbox_integration(
  p_company_id uuid,
  p_integration_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_integration_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT true
    INTO v_ok
  FROM public.bank_integrations bi
  WHERE bi.id = p_integration_id
    AND bi.company_id = p_company_id
    AND bi.provider = 'C6'
    AND upper(bi.environment) = 'SANDBOX'
  LIMIT 1;
  RETURN coalesce(v_ok, false);
END;
$$;

DROP FUNCTION IF EXISTS public.c6_homolog_evidence_is_valid(text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.mark_c6_homolog_idempotency_processing(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, text, text, text);
DROP FUNCTION IF EXISTS public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text);
DROP FUNCTION IF EXISTS public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.reserve_c6_homolog_idempotency(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_environment text,
  p_scenario text DEFAULT 'B_01',
  p_request_fingerprint text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.c6_homolog_idempotency%ROWTYPE;
  v_row public.c6_homolog_idempotency%ROWTYPE;
  v_stale_before timestamptz := timezone('utc'::text, now()) - interval '20 seconds';
  v_fingerprint text;
  v_scenario text;
BEGIN
  PERFORM public.c6_homolog_deny_browser_jwt();

  IF upper(coalesce(p_environment, '')) <> 'SANDBOX' THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'production_blocked',
      'row', NULL
    );
  END IF;

  IF p_external_reference_id IS NULL OR p_external_reference_id !~ '^[a-zA-Z0-9]{1,10}$' THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'invalid_reference',
      'row', NULL
    );
  END IF;

  v_fingerprint := lower(trim(coalesce(p_request_fingerprint, '')));
  IF v_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'invalid_fingerprint',
      'row', NULL
    );
  END IF;
  v_scenario := left(coalesce(nullif(trim(p_scenario), ''), 'B_01'), 16);

  IF NOT public.c6_homolog_assert_sandbox_integration(p_company_id, p_integration_id) THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'integration_mismatch',
      'row', NULL
    );
  END IF;

  SELECT *
    INTO v_existing
  FROM public.c6_homolog_idempotency
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND external_reference_id = p_external_reference_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RETURN jsonb_build_object('acquired', false, 'reason', 'payload_mismatch', 'row', to_jsonb(v_existing));
    END IF;

    IF v_existing.status = 'SUCCEEDED' THEN
      RETURN jsonb_build_object('acquired', false, 'reason', 'already_succeeded', 'row', to_jsonb(v_existing));
    END IF;

    IF v_existing.status = 'UNKNOWN' THEN
      RETURN jsonb_build_object('acquired', false, 'reason', 'needs_reconciliation', 'row', to_jsonb(v_existing));
    END IF;

    IF v_existing.status IN ('RESERVED', 'PROCESSING') THEN
      IF v_existing.last_attempt_at < v_stale_before THEN
        UPDATE public.c6_homolog_idempotency
           SET status = 'UNKNOWN',
               last_error_code = 'STALE_IN_FLIGHT',
               last_error_message = 'Reserva em voo expirou sem resultado HTTP conhecido. Reconciliacao obrigatoria.',
               completed_at = timezone('utc'::text, now()),
               updated_at = timezone('utc'::text, now())
         WHERE id = v_existing.id
           AND status IN ('RESERVED', 'PROCESSING')
         RETURNING * INTO v_row;
        RETURN jsonb_build_object('acquired', false, 'reason', 'needs_reconciliation', 'row', to_jsonb(v_row));
      END IF;
      RETURN jsonb_build_object('acquired', false, 'reason', 'in_flight', 'row', to_jsonb(v_existing));
    END IF;
  END IF;

  INSERT INTO public.c6_homolog_idempotency (
    company_id,
    integration_id,
    external_reference_id,
    environment,
    scenario,
    status,
    attempt_count,
    request_fingerprint,
    created_by,
    last_attempt_at
  ) VALUES (
    p_company_id,
    p_integration_id,
    p_external_reference_id,
    'SANDBOX',
    v_scenario,
    'RESERVED',
    1,
    v_fingerprint,
    NULL,
    timezone('utc'::text, now())
  )
  ON CONFLICT (company_id, integration_id, external_reference_id)
  DO UPDATE SET
    status = 'RESERVED',
    attempt_count = public.c6_homolog_idempotency.attempt_count + 1,
    request_fingerprint = public.c6_homolog_idempotency.request_fingerprint,
    last_http_status = NULL,
    last_error_code = NULL,
    last_error_message = NULL,
    c6_bank_slip_id = NULL,
    processing_at = NULL,
    completed_at = NULL,
    last_attempt_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE public.c6_homolog_idempotency.status = 'FAILED'
    AND public.c6_homolog_idempotency.request_fingerprint = EXCLUDED.request_fingerprint
  RETURNING * INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('acquired', true, 'reason', 'acquired', 'row', to_jsonb(v_row));
  END IF;

  SELECT * INTO v_existing
  FROM public.c6_homolog_idempotency
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND external_reference_id = p_external_reference_id;

  IF v_existing.id IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', NULL);
  END IF;

  RETURN jsonb_build_object(
    'acquired', false,
    'reason', CASE
      WHEN v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN 'payload_mismatch'
      WHEN v_existing.status = 'SUCCEEDED' THEN 'already_succeeded'
      WHEN v_existing.status = 'UNKNOWN' THEN 'needs_reconciliation'
      ELSE 'in_flight'
    END,
    'row', to_jsonb(v_existing)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_c6_homolog_idempotency_processing(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_attempt_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.c6_homolog_idempotency%ROWTYPE;
BEGIN
  PERFORM public.c6_homolog_deny_browser_jwt();

  IF p_attempt_count IS NULL OR p_attempt_count < 1 THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', NULL);
  END IF;

  IF NOT public.c6_homolog_assert_sandbox_integration(p_company_id, p_integration_id) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'integration_mismatch', 'row', NULL);
  END IF;

  UPDATE public.c6_homolog_idempotency
     SET status = 'PROCESSING',
         processing_at = timezone('utc'::text, now()),
         last_attempt_at = timezone('utc'::text, now()),
         updated_at = timezone('utc'::text, now())
   WHERE company_id = p_company_id
     AND integration_id = p_integration_id
     AND external_reference_id = p_external_reference_id
     AND status = 'RESERVED'
     AND attempt_count = p_attempt_count
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.c6_homolog_idempotency
    WHERE company_id = p_company_id
      AND integration_id = p_integration_id
      AND external_reference_id = p_external_reference_id;
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', CASE
        WHEN v_row.id IS NULL THEN 'invalid_transition'
        WHEN v_row.attempt_count IS DISTINCT FROM p_attempt_count THEN 'invalid_transition'
        WHEN v_row.status = 'UNKNOWN' THEN 'needs_reconciliation'
        WHEN v_row.status = 'SUCCEEDED' THEN 'already_succeeded'
        ELSE 'in_flight'
      END,
      'row', to_jsonb(v_row)
    );
  END IF;

  RETURN jsonb_build_object('acquired', true, 'reason', 'acquired', 'row', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_c6_homolog_idempotency(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_status text,
  p_attempt_count integer,
  p_http_status integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_c6_bank_slip_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.c6_homolog_idempotency%ROWTYPE;
  v_slip text;
BEGIN
  PERFORM public.c6_homolog_deny_browser_jwt();

  IF NOT public.c6_homolog_assert_sandbox_integration(p_company_id, p_integration_id) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'integration_mismatch', 'row', NULL);
  END IF;

  IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', NULL);
  END IF;

  IF p_attempt_count IS NULL OR p_attempt_count < 1 THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', NULL);
  END IF;

  v_slip := NULLIF(left(coalesce(p_c6_bank_slip_id, ''), 80), '');
  IF p_status = 'SUCCEEDED' AND v_slip IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', NULL);
  END IF;

  UPDATE public.c6_homolog_idempotency
     SET status = p_status,
         last_http_status = p_http_status,
         last_error_code = left(coalesce(p_error_code, ''), 80),
         last_error_message = public.c6_homolog_sanitize_error(p_error_message),
         c6_bank_slip_id = CASE WHEN p_status = 'SUCCEEDED' THEN v_slip ELSE c6_bank_slip_id END,
         completed_at = timezone('utc'::text, now()),
         updated_at = timezone('utc'::text, now())
   WHERE company_id = p_company_id
     AND integration_id = p_integration_id
     AND external_reference_id = p_external_reference_id
     AND status = 'PROCESSING'
     AND attempt_count = p_attempt_count
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.c6_homolog_idempotency
    WHERE company_id = p_company_id
      AND integration_id = p_integration_id
      AND external_reference_id = p_external_reference_id;
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_transition', 'row', to_jsonb(v_row));
  END IF;

  RETURN jsonb_build_object('acquired', true, 'reason', 'acquired', 'row', to_jsonb(v_row));
END;
$$;

-- Safe reconciliation: confirmation phrase + operator note only.
-- Does NOT treat client JSON as bank proof.
-- Does NOT treat isolated HTTP 404 as absence.
-- Does NOT change UNKNOWN to FAILED/SUCCEEDED.
-- Does NOT release re-emit. New boleto requires a new external_reference_id
-- unless a later authorized server-side GET /v1/bank_slips/{id} (OpenAPI official,
-- only if c6_bank_slip_id is already stored) confirms the original charge.
-- That GET is NOT implemented here.
CREATE OR REPLACE FUNCTION public.reconcile_c6_homolog_idempotency(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_confirmation text,
  p_operator_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.c6_homolog_idempotency%ROWTYPE;
  v_note text;
BEGIN
  PERFORM public.c6_homolog_deny_browser_jwt();

  IF NOT public.c6_homolog_assert_sandbox_integration(p_company_id, p_integration_id) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'integration_mismatch', 'row', NULL);
  END IF;

  IF p_confirmation IS DISTINCT FROM 'RECONCILIAR_B01_SANDBOX' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_confirmation', 'row', NULL);
  END IF;

  v_note := public.c6_homolog_sanitize_error(p_operator_note);

  UPDATE public.c6_homolog_idempotency
     SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'reconciliation', jsonb_build_object(
             'recorded_at', timezone('utc'::text, now()),
             'operator_note', v_note,
             'auto_reemit_released', false,
             'status_unchanged', 'UNKNOWN',
             'client_json_not_proof', true,
             'http_404_not_absence', true,
             'official_get_path', '/v1/bank_slips/{id}'
           )
         ),
         last_error_message = 'Reconciliacao registrada. UNKNOWN permanece bloqueado ate confirmacao bancaria verificavel. Sem reemissao automatica.',
         updated_at = timezone('utc'::text, now())
   WHERE company_id = p_company_id
     AND integration_id = p_integration_id
     AND external_reference_id = p_external_reference_id
     AND status = 'UNKNOWN'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.c6_homolog_idempotency
    WHERE company_id = p_company_id
      AND integration_id = p_integration_id
      AND external_reference_id = p_external_reference_id;
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', CASE
        WHEN v_row.status = 'SUCCEEDED' THEN 'already_succeeded'
        ELSE 'invalid_transition'
      END,
      'row', to_jsonb(v_row)
    );
  END IF;

  RETURN jsonb_build_object(
    'acquired', false,
    'reason', 'needs_bank_confirmation',
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.c6_homolog_sanitize_error(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.c6_homolog_deny_browser_jwt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.c6_homolog_assert_sandbox_integration(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.c6_homolog_sanitize_error(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.c6_homolog_deny_browser_jwt() TO service_role;
GRANT EXECUTE ON FUNCTION public.c6_homolog_assert_sandbox_integration(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Rollback (nao executar agora):
-- DROP FUNCTION IF EXISTS public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text);
-- DROP FUNCTION IF EXISTS public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text);
-- DROP FUNCTION IF EXISTS public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer);
-- DROP FUNCTION IF EXISTS public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid);
-- DROP FUNCTION IF EXISTS public.c6_homolog_assert_sandbox_integration(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.c6_homolog_deny_browser_jwt();
-- DROP FUNCTION IF EXISTS public.c6_homolog_sanitize_error(text);
-- DROP TABLE IF EXISTS public.c6_homolog_idempotency;
