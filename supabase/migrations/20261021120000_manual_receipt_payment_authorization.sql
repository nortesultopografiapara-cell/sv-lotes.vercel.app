-- SV LOTES — Fase 2: baixa manual de parcela só com autorização do Principal.
-- Trigger bloqueia UPDATE client-side de status/paid_at/paid_amount para pago.
-- service_role (webhooks Asaas/Inter e API server-side) continua permitido.
-- RPC atômica: lock da parcela + update + cash_movement. Sem backfill.

CREATE OR REPLACE FUNCTION public.finance_receipts_block_client_paid_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
  old_paid boolean;
  new_paid boolean;
BEGIN
  jwt_role := COALESCE(auth.role(), '');

  IF jwt_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  old_paid := lower(trim(COALESCE(OLD.status, ''))) IN ('pago', 'paid', 'paga');
  new_paid := lower(trim(COALESCE(NEW.status, ''))) IN ('pago', 'paid', 'paga');

  IF (new_paid AND NOT old_paid)
     OR (NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL AND NOT old_paid)
     OR (
       COALESCE(NEW.paid_amount, 0) > COALESCE(OLD.paid_amount, 0)
       AND NOT old_paid
     )
  THEN
    RAISE EXCEPTION 'Baixa manual de parcela só pode ser feita com autorização do Administrador Principal.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_receipts_block_client_paid_update ON public.finance_receipts;
CREATE TRIGGER finance_receipts_block_client_paid_update
  BEFORE UPDATE ON public.finance_receipts
  FOR EACH ROW
  EXECUTE PROCEDURE public.finance_receipts_block_client_paid_update();

COMMENT ON FUNCTION public.finance_receipts_block_client_paid_update() IS
  'Impede que o browser marque finance_receipts como pago. service_role/webhooks não são bloqueados.';

CREATE OR REPLACE FUNCTION public.execute_authorized_manual_receipt_payment(
  p_receipt_id uuid,
  p_operator_id uuid,
  p_paid_at timestamptz,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r finance_receipts%ROWTYPE;
  existing_cash uuid;
  new_cash uuid;
  paid_ts timestamptz;
  paid_amount numeric;
  desc_text text;
  contract_no text;
BEGIN
  IF p_receipt_id IS NULL OR p_operator_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;

  SELECT * INTO r
  FROM finance_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT id INTO existing_cash
  FROM cash_movements
  WHERE tenant_id = COALESCE(r.tenant_id, r.company_id)
    AND COALESCE(status, 'ativo') = 'ativo'
    AND (
      metadata->>'installment_id' = r.id::text
      OR metadata->>'receipt_id' = r.id::text
    )
  LIMIT 1;

  IF lower(trim(COALESCE(r.status, ''))) IN ('pago', 'paid', 'paga')
     OR r.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_paid',
      'receiptId', r.id,
      'cashMovementId', existing_cash
    );
  END IF;

  paid_ts := COALESCE(p_paid_at, timezone('utc', now()));
  paid_amount := COALESCE(p_amount, r.amount, 0);

  UPDATE finance_receipts
  SET
    status = 'pago',
    paid_amount = paid_amount,
    paid_at = paid_ts
  WHERE id = r.id;

  SELECT c.contract_number INTO contract_no
  FROM contracts c
  WHERE c.sale_id = r.sale_id
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1;

  desc_text := format(
    'Pagamento de Parcela %s - CT %s',
    COALESCE(r.installment_number::text, '1'),
    COALESCE(contract_no, 'S/N')
  );

  INSERT INTO cash_movements (
    tenant_id,
    company_id,
    project_id,
    type,
    category,
    description,
    amount,
    customer_id,
    sale_id,
    movement_date,
    status,
    created_by,
    metadata
  ) VALUES (
    COALESCE(r.tenant_id, r.company_id),
    COALESCE(r.company_id, r.tenant_id),
    r.project_id,
    'entrada',
    'Venda de Lote',
    desc_text,
    paid_amount,
    r.customer_id,
    r.sale_id,
    (paid_ts AT TIME ZONE 'utc')::date,
    'ativo',
    p_operator_id,
    jsonb_build_object(
      'provider', 'MANUAL_FINANCE',
      'installment_id', r.id,
      'receipt_id', r.id
    )
  )
  RETURNING id INTO new_cash;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyPaid', false,
    'receiptId', r.id,
    'cashMovementId', new_cash,
    'paidAt', paid_ts,
    'amount', paid_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) TO service_role;

COMMENT ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) IS
  'Baixa manual atômica. Só service_role. created_by = operador, não o Principal.';

NOTIFY pgrst, 'reload schema';
