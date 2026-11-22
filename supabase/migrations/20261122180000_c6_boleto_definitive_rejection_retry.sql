-- Reabre somente rejeição C6 definitiva, sem identificador de boleto.
-- Não executar antes da publicação do código que classifica HTTP 409, 429 e 5xx como incerto.
-- Não emite boleto, não altera venda, recebível, credencial nem webhook.

ALTER TABLE public.c6_boleto_reservations
  ADD COLUMN IF NOT EXISTS retry_allowed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.c6_boleto_reservations.retry_allowed IS
  'Verdadeiro apenas após rejeição HTTP definitiva sem id de boleto. Não autoriza reemissão de resposta incerta.';

CREATE OR REPLACE FUNCTION public.complete_c6_boleto(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_status text,
  p_http_status integer,
  p_c6_bank_slip_id text,
  p_retry_allowed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_existing public.c6_boleto_reservations%ROWTYPE;
  v_count integer;
  v_status text;
  v_slip text;
  v_retry boolean;
BEGIN
  IF p_external_reference_id !~ '^[a-zA-Z0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Status final inválido.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_integrations
    WHERE id = p_integration_id
      AND company_id = p_company_id
      AND provider = 'C6'
      AND environment IN ('SANDBOX', 'PRODUCTION')
  ) THEN
    RAISE EXCEPTION 'Integração C6 não encontrada nesta empresa.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('c6-boleto:' || p_company_id::text || ':' || p_integration_id::text || ':' || p_external_reference_id)
  );

  SELECT * INTO v_existing
  FROM public.c6_boleto_reservations
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
  v_slip := nullif(btrim(coalesce(p_c6_bank_slip_id, '')), '');
  v_retry := false;

  IF v_status = 'SUCCEEDED' AND (p_http_status IS DISTINCT FROM 201 OR v_slip IS NULL) THEN
    v_status := 'UNKNOWN';
  END IF;
  IF v_status = 'FAILED'
     AND p_retry_allowed IS TRUE
     AND v_slip IS NULL
     AND p_http_status IN (400, 401, 403, 404, 422) THEN
    v_retry := true;
  END IF;
  IF v_status <> 'FAILED' THEN
    v_retry := false;
  END IF;
  IF v_status = 'SUCCEEDED' THEN
    v_slip := v_slip;
  ELSIF v_status = 'UNKNOWN' THEN
    v_slip := v_slip;
  ELSE
    v_slip := NULL;
  END IF;

  UPDATE public.c6_boleto_reservations
  SET status = v_status,
      last_http_status = p_http_status,
      c6_bank_slip_id = v_slip,
      retry_allowed = v_retry,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_existing.id
    AND company_id = p_company_id
    AND integration_id = p_integration_id
    AND status IN ('RESERVED', 'PROCESSING');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'reason', v_status, 'retry_allowed', v_retry);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_c6_boleto(
  p_company_id uuid,
  p_integration_id uuid,
  p_external_reference_id text,
  p_status text,
  p_http_status integer,
  p_c6_bank_slip_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN public.complete_c6_boleto(
    p_company_id,
    p_integration_id,
    p_external_reference_id,
    p_status,
    p_http_status,
    p_c6_bank_slip_id,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_c6_boleto(
  p_company_id uuid,
  p_integration_id uuid,
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
  v_existing public.c6_boleto_reservations%ROWTYPE;
  v_count integer;
BEGIN
  IF p_external_reference_id !~ '^[a-zA-Z0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Referência inválida.';
  END IF;
  IF p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Impressão da requisição inválida.';
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
    pg_catalog.hashtext('c6-boleto:' || p_company_id::text || ':' || p_integration_id::text || ':' || p_external_reference_id)
  );

  INSERT INTO public.c6_boleto_reservations (
    company_id, integration_id, external_reference_id, environment, status, request_fingerprint
  ) VALUES (
    p_company_id, p_integration_id, p_external_reference_id, v_environment, 'RESERVED', p_request_fingerprint
  )
  ON CONFLICT (company_id, integration_id, external_reference_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', true, 'reason', 'reserved');
  END IF;

  SELECT * INTO v_existing
  FROM public.c6_boleto_reservations
  WHERE company_id = p_company_id
    AND integration_id = p_integration_id
    AND external_reference_id = p_external_reference_id
  FOR UPDATE;

  IF v_existing.status = 'FAILED'
     AND v_existing.retry_allowed IS TRUE
     AND v_existing.c6_bank_slip_id IS NULL
     AND v_existing.last_http_status IN (400, 401, 403, 404, 422)
     AND NOT EXISTS (
       SELECT 1
       FROM public.bank_charges bc
       WHERE bc.company_id = p_company_id
         AND bc.integration_id = p_integration_id
         AND bc.provider = 'C6'
         AND nullif(btrim(bc.external_id), '') IS NOT NULL
         AND coalesce(bc.metadata ->> 'external_reference_id', '') = p_external_reference_id
         AND bc.status IN ('PENDING', 'REGISTERED', 'PAID', 'OVERDUE')
     ) THEN
    UPDATE public.c6_boleto_reservations
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
      AND c6_bank_slip_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 1 THEN
      RETURN jsonb_build_object('accepted', true, 'reason', 'retry');
    END IF;
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;

  IF v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
  END IF;
  IF v_existing.status = 'UNKNOWN' THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'needs_reconciliation');
  END IF;
  IF v_existing.status IN ('RESERVED', 'PROCESSING')
     AND v_existing.reserved_at <= timezone('utc'::text, now()) - interval '20 seconds' THEN
    UPDATE public.c6_boleto_reservations
    SET status = 'UNKNOWN',
        retry_allowed = false,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_existing.id
      AND company_id = p_company_id
      AND status IN ('RESERVED', 'PROCESSING');
    RETURN jsonb_build_object('accepted', false, 'reason', 'needs_reconciliation');
  END IF;
  RETURN jsonb_build_object('accepted', false, 'reason', 'blocked');
END;
$$;

ALTER FUNCTION public.reserve_c6_boleto(uuid, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text) OWNER TO postgres;
ALTER FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text, boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reserve_c6_boleto(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_c6_boleto(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_boleto(uuid, uuid, text, text, integer, text, boolean) TO service_role;

COMMENT ON FUNCTION public.reserve_c6_boleto(uuid, uuid, text, text) IS
  'Reserva a emissão C6. Reabre apenas FAILED com retry_allowed, sem id bancário e sem cobrança registrada.';
