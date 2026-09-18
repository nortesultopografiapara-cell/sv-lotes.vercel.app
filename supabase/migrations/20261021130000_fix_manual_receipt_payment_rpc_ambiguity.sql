-- SV LOTES — Hotfix Fase 2: desambigua paid_amount na RPC de baixa manual.
-- NÃO recria o trigger finance_receipts_block_client_paid_update.
-- NÃO altera RLS, grants de browser, nem a regra financeira.

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
  v_paid_amount numeric;
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

  SELECT cm.id INTO existing_cash
  FROM cash_movements cm
  WHERE cm.tenant_id = COALESCE(r.tenant_id, r.company_id)
    AND COALESCE(cm.status, 'ativo') = 'ativo'
    AND (
      cm.metadata->>'installment_id' = r.id::text
      OR cm.metadata->>'receipt_id' = r.id::text
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
  v_paid_amount := COALESCE(p_amount, r.amount, 0);

  UPDATE public.finance_receipts fr
  SET
    status = 'pago',
    paid_amount = v_paid_amount,
    paid_at = paid_ts
  WHERE fr.id = r.id;

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
    v_paid_amount,
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
    'amount', v_paid_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) TO service_role;

COMMENT ON FUNCTION public.execute_authorized_manual_receipt_payment(uuid, uuid, timestamptz, numeric) IS
  'Baixa manual atômica. Só service_role. created_by = operador, não o Principal. v_paid_amount evita ambiguidade com a coluna.';

NOTIFY pgrst, 'reload schema';
