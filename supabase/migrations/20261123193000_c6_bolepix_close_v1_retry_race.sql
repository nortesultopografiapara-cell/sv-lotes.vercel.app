-- Complementa 20261123120000. Não aplicada nesta fase:
-- falta PostgreSQL isolado e backup recuperável conferido nesta execução.
-- Fecha a janela em que uma reserva v1 FAILED com nova tentativa
-- e uma reserva v2 da mesma parcela podiam ser aceitas juntas.
-- O mesmo lock c6-boleto da reserva v1 serializa o INSERT e o UPDATE.
-- Não altera recebíveis, caixa, vendas, contratos nem cobranças históricas.
-- Não apaga reservas nem cobranças.
--
-- Rollback, somente com autorização e enquanto não houver emissão v2:
--   DROP TRIGGER IF EXISTS trg_c6_boleto_reservations_block_bolepix_update ON public.c6_boleto_reservations;
--   Reaplicar o corpo de reserve_c6_bolepix e c6_bolepix_reject_v1_when_v2_exists
--   a partir de supabase/migrations/20261123120000_c6_bolepix_v2_reservation.sql.
-- Não remover trg_c6_boleto_reservations_block_bolepix nem o lock da conta financeira.

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
  ) THEN
    RAISE EXCEPTION 'A parcela já possui reserva Bolepix v2.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_c6_boleto_reservations_block_bolepix_update ON public.c6_boleto_reservations;
CREATE TRIGGER trg_c6_boleto_reservations_block_bolepix_update
  BEFORE UPDATE ON public.c6_boleto_reservations
  FOR EACH ROW
  EXECUTE PROCEDURE public.c6_bolepix_reject_v1_when_v2_exists();

ALTER FUNCTION public.c6_bolepix_reject_v1_when_v2_exists() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.c6_bolepix_reject_v1_when_v2_exists() FROM PUBLIC, anon, authenticated, service_role;

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
        OR (status = 'FAILED' AND retry_allowed IS TRUE)
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

REVOKE ALL ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) TO service_role;
ALTER FUNCTION public.reserve_c6_bolepix(uuid, uuid, uuid, text, text) OWNER TO postgres;
