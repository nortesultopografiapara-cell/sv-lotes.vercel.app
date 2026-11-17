-- Regularização administrativa de sinal antigo marcado como pago.
-- Develop somente até autorização de publicação. Não altera Production.
-- Não apaga recebimentos, não grava caixa, contrato, comissão nem cobrança.
-- A mesma venda não é regularizada duas vezes. Falha em qualquer etapa desfaz a transação.
-- As parcelas criadas ficam no grupo SIGNAL. A edição comum da venda preserva esse grupo
-- e só recalcula parcelas do lote (grupo LOT ou grupo nulo). Esta função não muda o modo do contrato.

CREATE TABLE IF NOT EXISTS public.legacy_signal_regularizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  request_key text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  fingerprint text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT legacy_signal_regularizations_sale_uidx UNIQUE (sale_id),
  CONSTRAINT legacy_signal_regularizations_request_uidx UNIQUE (tenant_id, request_key)
);

ALTER TABLE public.legacy_signal_regularizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legacy_signal_regularizations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.legacy_signal_regularizations TO service_role;

CREATE OR REPLACE FUNCTION public.execute_legacy_signal_regularization(
  p_sale_id uuid,
  p_actor_id uuid,
  p_tenant_id uuid,
  p_received_cents integer,
  p_installments jsonb,
  p_reason text,
  p_request_key text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_receipt public.finance_receipts%ROWTYPE;
  v_role text;
  v_status text;
  v_user_tenant uuid;
  v_original_cents integer;
  v_paid_cents integer;
  v_contract_cents integer;
  v_paid_at_sale_cents integer;
  v_remaining_cents integer;
  v_lot_cents integer;
  v_sum integer := 0;
  v_count integer;
  v_index integer;
  v_item jsonb;
  v_due text;
  v_cents integer;
  v_fingerprint text := '';
  v_existing public.legacy_signal_regularizations%ROWTYPE;
  v_created jsonb := '[]'::jsonb;
  v_audit_id uuid;
  v_inserted integer;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  IF p_confirm IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'confirmation_required', 'message', 'A regularização exige confirmação explícita.');
  END IF;
  IF p_sale_id IS NULL OR p_actor_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'A confirmação está incompleta.');
  END IF;
  IF p_request_key IS NULL OR p_request_key !~ '^[A-Za-z0-9_-]{12,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'A confirmação não possui uma chave válida.');
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 OR char_length(btrim(p_reason)) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Informe o motivo da regularização.');
  END IF;
  IF p_received_cents IS NULL OR p_received_cents <= 0 OR jsonb_typeof(p_installments) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Informe o valor recebido e as parcelas do saldo.');
  END IF;

  v_count := jsonb_array_length(p_installments);
  IF v_count < 1 OR v_count > 36 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Informe de uma a 36 parcelas do saldo.');
  END IF;

  v_fingerprint := '{"receivedCents":' || p_received_cents::text || ',"installments":[';
  FOR v_index IN 0 .. v_count - 1 LOOP
    v_item := p_installments -> v_index;
    v_due := v_item->>'dueDate';
    IF v_due IS NULL OR v_due !~ '^\d{4}-\d{2}-\d{2}$' OR (v_item->>'amountCents') !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Cada parcela precisa de vencimento e valor válidos.');
    END IF;
    v_cents := (v_item->>'amountCents')::integer;
    IF v_cents <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Cada parcela precisa de vencimento e valor válidos.');
    END IF;
    BEGIN
      IF to_char(v_due::date, 'YYYY-MM-DD') <> v_due THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Cada parcela precisa de vencimento e valor válidos.');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Cada parcela precisa de vencimento e valor válidos.');
    END;
    v_sum := v_sum + v_cents;
    IF v_index > 0 THEN
      v_fingerprint := v_fingerprint || ',';
    END IF;
    v_fingerprint := v_fingerprint || '{"dueDate":"' || v_due || '","amountCents":' || v_cents::text || '}';
  END LOOP;
  v_fingerprint := v_fingerprint || '],"reason":' || to_json(btrim(p_reason))::text || '}';

  PERFORM pg_advisory_xact_lock(hashtext(p_sale_id::text));

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Venda não encontrada.');
  END IF;

  SELECT u.role, u.status, u.tenant_id
    INTO v_role, v_status, v_user_tenant
  FROM public.users u
  WHERE u.id = p_actor_id;

  IF v_user_tenant IS DISTINCT FROM p_tenant_id OR v_user_tenant IS DISTINCT FROM v_sale.tenant_id
     OR (v_sale.company_id IS NOT NULL AND v_sale.company_id IS DISTINCT FROM v_sale.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_company', 'message', 'A venda não pertence a esta empresa.');
  END IF;
  IF upper(COALESCE(v_role, '')) NOT IN ('ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN')
     OR lower(COALESCE(v_status, 'active')) IN ('inactive', 'inativo', 'disabled', 'bloqueado') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Somente um administrador da empresa pode regularizar o sinal.');
  END IF;

  SELECT * INTO v_existing
  FROM public.legacy_signal_regularizations
  WHERE sale_id = p_sale_id;
  IF FOUND THEN
    IF v_existing.request_key = p_request_key AND v_existing.fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object(
        'ok', true,
        'code', 'replayed',
        'replayed', true,
        'message', 'Esta regularização já foi aplicada.',
        'receiptId', v_existing.receipt_id,
        'auditId', v_existing.id
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN v_existing.request_key = p_request_key THEN 'idempotency_conflict' ELSE 'already_regularized' END,
      'message', CASE WHEN v_existing.request_key = p_request_key THEN 'A chave já foi usada com outros valores.' ELSE 'Esta venda já foi regularizada.' END,
      'auditId', v_existing.id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.legacy_signal_regularizations
    WHERE tenant_id = p_tenant_id AND request_key = p_request_key AND sale_id IS DISTINCT FROM p_sale_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A chave já foi usada em outra venda.');
  END IF;

  IF lower(COALESCE(v_sale.status, '')) IN ('cancelled', 'cancelado', 'canceled', 'rescindido', 'distrato') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed_sale', 'message', 'A venda não está ativa.');
  END IF;
  IF upper(COALESCE(v_sale.signal_schedule_mode, '')) = 'SEPARATE'
     OR EXISTS (
       SELECT 1 FROM public.finance_receipts fr
       WHERE fr.sale_id = p_sale_id AND fr.schedule_group IS NOT NULL
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'separate_schedule', 'message', 'Esta venda já usa o sinal parcelado novo.', 'blockers', jsonb_build_array('separate_schedule'));
  END IF;

  PERFORM 1 FROM public.finance_receipts WHERE sale_id = p_sale_id AND installment_number = 0 FOR UPDATE;
  IF (SELECT count(*) FROM public.finance_receipts WHERE sale_id = p_sale_id AND installment_number = 0) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_legacy_paid_signal', 'message', 'A parcela inicial do sinal não está única.');
  END IF;

  SELECT * INTO v_receipt
  FROM public.finance_receipts
  WHERE sale_id = p_sale_id AND installment_number = 0
  FOR UPDATE;

  v_original_cents := ROUND(v_receipt.amount * 100)::integer;
  v_paid_cents := ROUND(COALESCE(v_receipt.paid_amount, 0) * 100)::integer;
  v_contract_cents := ROUND(COALESCE(v_sale.signal_contract_value, v_sale.down_payment, 0) * 100)::integer;
  v_paid_at_sale_cents := CASE WHEN v_sale.signal_paid_at_sale IS NULL THEN NULL ELSE ROUND(v_sale.signal_paid_at_sale * 100)::integer END;
  v_remaining_cents := CASE WHEN v_sale.signal_remaining_value IS NULL THEN NULL ELSE ROUND(v_sale.signal_remaining_value * 100)::integer END;

  IF v_receipt.tenant_id IS DISTINCT FROM v_sale.tenant_id
     OR lower(trim(COALESCE(v_receipt.status, ''))) NOT IN ('pago', 'paid', 'paga')
     OR v_receipt.paid_at IS NULL
     OR v_paid_cents <> v_original_cents
     OR v_original_cents <= 0
     OR v_contract_cents <> v_original_cents THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_legacy_paid_signal', 'message', 'O sinal não está marcado como integralmente pago.');
  END IF;
  IF p_received_cents >= v_original_cents OR p_received_cents + v_sum <> v_original_cents THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'O sinal total precisa ser a soma do valor recebido e das parcelas restantes.');
  END IF;
  IF v_paid_at_sale_cents IS NOT NULL AND v_paid_at_sale_cents <> p_received_cents THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'O valor recebido não confere com o valor já registrado na venda.');
  END IF;
  IF v_remaining_cents IS NOT NULL AND v_remaining_cents <> v_sum THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'O saldo informado não confere com o saldo já registrado na venda.');
  END IF;

  SELECT COALESCE(SUM(ROUND(fr.amount * 100)), 0)::integer INTO v_lot_cents
  FROM public.finance_receipts fr
  WHERE fr.sale_id = p_sale_id
    AND fr.installment_number >= 1
    AND COALESCE(fr.schedule_group, '') <> 'SIGNAL'
    AND lower(trim(COALESCE(fr.status, ''))) NOT IN ('cancelado', 'canceled', 'cancelled', 'cancelada');
  IF v_lot_cents <> ROUND(COALESCE(v_sale.total_value, 0) * 100)::integer THEN
    RETURN jsonb_build_object('ok', false, 'code', 'lot_schedule_mismatch', 'message', 'As parcelas do lote não fecham com o preço do lote.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_movements cm
    WHERE COALESCE(cm.status, 'ativo') NOT IN ('estornado', 'cancelado', 'cancelled', 'canceled')
      AND (
        cm.sale_id = p_sale_id
        OR cm.metadata->>'installment_id' = v_receipt.id::text
        OR cm.metadata->>'receipt_id' = v_receipt.id::text
        OR cm.metadata->>'finance_receipt_id' = v_receipt.id::text
        OR (v_receipt.contract_id IS NOT NULL AND cm.contract_id = v_receipt.contract_id)
      )
      AND (cm.receipt_number IS NOT NULL OR cm.receipt_url IS NOT NULL OR cm.validation_code IS NOT NULL)
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('receipt');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_movements cm
    WHERE COALESCE(cm.status, 'ativo') NOT IN ('estornado', 'cancelado', 'cancelled', 'canceled')
      AND (
        cm.sale_id = p_sale_id
        OR cm.metadata->>'installment_id' = v_receipt.id::text
        OR cm.metadata->>'receipt_id' = v_receipt.id::text
        OR cm.metadata->>'finance_receipt_id' = v_receipt.id::text
        OR (v_receipt.contract_id IS NOT NULL AND cm.contract_id = v_receipt.contract_id)
      )
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('cash');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bank_charges bc
    WHERE bc.finance_receipt_id = v_receipt.id AND upper(bc.status) <> 'CANCELLED'
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('bank_charge');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_asaas_charges ac
    WHERE ac.installment_id = v_receipt.id AND upper(ac.status) <> 'CANCELLED'
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('asaas_charge');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sale_release_settlements st
    WHERE st.sale_id = p_sale_id
      AND upper(COALESCE(st.status, '')) NOT IN ('CANCELLED', 'CANCELED')
      AND lower(COALESCE(st.status, '')) <> 'cancelado'
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('settlement');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.broker_commissions bc
    WHERE bc.sale_id = p_sale_id
      AND lower(COALESCE(bc.status, '')) IN ('pago', 'paid', 'paga', 'settled', 'repassado', 'liquidado')
  ) THEN
    v_blockers := v_blockers || jsonb_build_array('paid_commission');
  END IF;
  IF v_receipt.financial_account_id IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array('financial_account');
  END IF;
  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'blocked',
      'message', 'Há caixa, recibo, cobrança ou repasse vinculado. A regularização automática foi bloqueada.',
      'blockers', v_blockers
    );
  END IF;

  UPDATE public.finance_receipts
  SET
    amount = p_received_cents::numeric / 100,
    paid_amount = p_received_cents::numeric / 100,
    base_amount = p_received_cents::numeric / 100,
    signal_addon_amount = 0,
    schedule_group = 'SIGNAL'
  WHERE id = v_receipt.id
    AND paid_at IS NOT DISTINCT FROM v_receipt.paid_at
    AND status = v_receipt.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A parcela original não foi preservada.';
  END IF;

  FOR v_index IN 0 .. v_count - 1 LOOP
    v_item := p_installments -> v_index;
    v_cents := (v_item->>'amountCents')::integer;
    INSERT INTO public.finance_receipts (
      tenant_id, company_id, sale_id, customer_id, project_id, block_id, broker_id, contract_id,
      installment_number, due_date, amount, paid_amount, paid_at, status,
      schedule_group, base_amount, signal_addon_amount, financial_account_id
    ) VALUES (
      v_receipt.tenant_id,
      COALESCE(v_receipt.company_id, v_receipt.tenant_id),
      v_receipt.sale_id,
      v_receipt.customer_id,
      v_receipt.project_id,
      v_receipt.block_id,
      v_receipt.broker_id,
      v_receipt.contract_id,
      v_index + 1,
      (v_item->>'dueDate')::date,
      v_cents::numeric / 100,
      NULL,
      NULL,
      'pendente',
      'SIGNAL',
      v_cents::numeric / 100,
      0,
      NULL
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', fr.id,
    'installmentNumber', fr.installment_number,
    'dueDate', fr.due_date,
    'amountCents', ROUND(fr.amount * 100)::integer,
    'status', fr.status,
    'scheduleGroup', fr.schedule_group
  ) ORDER BY fr.installment_number), '[]'::jsonb)
  INTO v_created
  FROM public.finance_receipts fr
  WHERE fr.sale_id = p_sale_id
    AND fr.schedule_group = 'SIGNAL'
    AND fr.installment_number > 0;
  v_inserted := COALESCE(jsonb_array_length(v_created), 0);
  IF v_inserted <> v_count THEN
    RAISE EXCEPTION 'As parcelas do saldo não foram gravadas por completo.';
  END IF;

  SELECT COALESCE(SUM(ROUND(fr.amount * 100)), 0)::integer INTO v_lot_cents
  FROM public.finance_receipts fr
  WHERE fr.sale_id = p_sale_id
    AND fr.installment_number >= 1
    AND COALESCE(fr.schedule_group, '') <> 'SIGNAL'
    AND lower(trim(COALESCE(fr.status, ''))) NOT IN ('cancelado', 'canceled', 'cancelled', 'cancelada');
  IF v_lot_cents <> ROUND(COALESCE(v_sale.total_value, 0) * 100)::integer THEN
    RAISE EXCEPTION 'As parcelas do lote seriam alteradas.';
  END IF;

  INSERT INTO public.legacy_signal_regularizations (
    tenant_id, company_id, sale_id, receipt_id, request_key, actor_user_id, reason, fingerprint, before_state, after_state
  ) VALUES (
    v_sale.tenant_id,
    COALESCE(v_sale.company_id, v_sale.tenant_id),
    v_sale.id,
    v_receipt.id,
    p_request_key,
    p_actor_id,
    btrim(p_reason),
    v_fingerprint,
    jsonb_build_object(
      'originalReceiptId', v_receipt.id,
      'originalAmountCents', v_original_cents,
      'originalPaidAmountCents', v_paid_cents,
      'originalPaidAt', v_receipt.paid_at,
      'originalDueDate', v_receipt.due_date,
      'originalStatus', v_receipt.status,
      'originalScheduleGroup', v_receipt.schedule_group,
      'lotCents', v_lot_cents
    ),
    jsonb_build_object(
      'originalReceiptId', v_receipt.id,
      'receivedCents', p_received_cents,
      'pendingCents', v_sum,
      'installmentCount', v_count,
      'lotCents', v_lot_cents,
      'createdInstallments', v_created
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'applied',
    'replayed', false,
    'message', 'Sinal regularizado sem lançamento de caixa.',
    'receiptId', v_receipt.id,
    'auditId', v_audit_id,
    'createdInstallmentCount', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_legacy_signal_regularization(uuid, uuid, uuid, integer, jsonb, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_legacy_signal_regularization(uuid, uuid, uuid, integer, jsonb, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.execute_legacy_signal_regularization(uuid, uuid, uuid, integer, jsonb, text, text, boolean) IS
  'Ajusta o sinal antigo já marcado como pago e cria o saldo pendente. Não cria caixa, cobrança, contrato nem comissão.';

NOTIFY pgrst, 'reload schema';
