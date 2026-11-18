-- Estorno de uma parcela e gravação financeira da edição da venda.
-- Aplicar somente no Supabase Develop hoynysmynxncdlptuzub, depois de revisão.
-- Não aplicar em Production. Este arquivo não é executado automaticamente.
-- Cada função roda em uma transação. Qualquer falha desfaz a operação inteira.
-- Não apaga caixa, não cria lançamento de caixa e não altera parcela de outra venda.

CREATE OR REPLACE FUNCTION public.execute_receipt_payment_reversal(
  p_receipt_id uuid,
  p_reason text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt public.finance_receipts%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_role text;
  v_status text;
  v_tenant uuid;
  v_paid boolean;
  v_before jsonb;
  v_cash_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized', 'message', 'Sessão inválida.');
  END IF;
  IF p_confirm IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'confirmation_required', 'message', 'O estorno exige confirmação.');
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 OR char_length(btrim(p_reason)) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Informe uma justificativa entre 10 e 500 caracteres.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('receipt-reversal:' || p_receipt_id::text));

  SELECT * INTO v_receipt FROM public.finance_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Parcela não encontrada.');
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = v_receipt.sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Venda não encontrada.');
  END IF;

  SELECT u.role, u.status, u.tenant_id INTO v_role, v_status, v_tenant
  FROM public.users u WHERE u.id = auth.uid();
  IF v_tenant IS DISTINCT FROM v_sale.tenant_id
     OR upper(COALESCE(v_role, '')) NOT IN ('ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN')
     OR lower(COALESCE(v_status, 'active')) IN ('inactive', 'inativo', 'disabled', 'bloqueado') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Somente um administrador da empresa pode estornar este pagamento.');
  END IF;

  v_paid := lower(trim(COALESCE(v_receipt.status, ''))) IN ('pago', 'paid') OR v_receipt.paid_at IS NOT NULL;
  IF NOT v_paid THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'message', 'Esta parcela já está pendente.');
  END IF;

  IF to_regclass('public.bank_charges') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bank_charges bc
    WHERE bc.finance_receipt_id = v_receipt.id
      AND upper(COALESCE(bc.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bank_charge', 'message', 'Há cobrança bancária vinculada. Cancele a cobrança antes de estornar.');
  END IF;
  IF to_regclass('public.company_asaas_charges') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_asaas_charges ac
    WHERE ac.installment_id = v_receipt.id
      AND upper(COALESCE(ac.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'asaas_charge', 'message', 'Há cobrança Asaas vinculada. Cancele a cobrança antes de estornar.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_movements cm
    WHERE COALESCE(cm.status, 'ativo') NOT IN ('estornado', 'cancelado', 'cancelled', 'canceled')
      AND (
        cm.metadata->>'installment_id' = v_receipt.id::text
        OR cm.metadata->>'receipt_id' = v_receipt.id::text
        OR cm.metadata->>'finance_receipt_id' = v_receipt.id::text
      )
      AND (
        cm.receipt_number IS NOT NULL
        OR cm.receipt_url IS NOT NULL
        OR cm.validation_code IS NOT NULL
        OR cm.metadata->>'receipt_url' IS NOT NULL
        OR cm.metadata->>'validation_code' IS NOT NULL
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'receipt_document', 'message', 'Há recibo emitido. O estorno automático fica bloqueado.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_movements cm
    WHERE COALESCE(cm.status, 'ativo') NOT IN ('estornado', 'cancelado', 'cancelled', 'canceled')
      AND (
        cm.metadata->>'installment_id' = v_receipt.id::text
        OR cm.metadata->>'receipt_id' = v_receipt.id::text
        OR cm.metadata->>'finance_receipt_id' = v_receipt.id::text
      )
      AND upper(COALESCE(cm.metadata->>'provider', '')) IN ('ASAAS', 'INTER', 'C6')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bank_cash', 'message', 'O caixa veio de uma cobrança bancária. Use o fluxo dessa cobrança.');
  END IF;

  v_before := jsonb_build_object(
    'amount', v_receipt.amount,
    'paidAmount', v_receipt.paid_amount,
    'paidAt', v_receipt.paid_at,
    'status', v_receipt.status
  );

  UPDATE public.finance_receipts
  SET status = 'pendente', paid_amount = NULL, paid_at = NULL
  WHERE id = v_receipt.id;

  WITH marked AS (
    UPDATE public.cash_movements cm
    SET status = 'estornado'
    WHERE COALESCE(cm.status, 'ativo') NOT IN ('estornado', 'cancelado', 'cancelled', 'canceled')
      AND (
        cm.metadata->>'installment_id' = v_receipt.id::text
        OR cm.metadata->>'receipt_id' = v_receipt.id::text
        OR cm.metadata->>'finance_receipt_id' = v_receipt.id::text
      )
    RETURNING cm.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_cash_ids FROM marked;

  INSERT INTO public.audit_logs (
    tenant_id, company_id, user_id, action, module, entity_type, entity_id, reference_id, description, old_data, new_data
  ) VALUES (
    v_sale.tenant_id,
    v_sale.tenant_id,
    auth.uid(),
    'payment_reversed',
    'FINANCE',
    'finance_receipts',
    v_receipt.id,
    v_receipt.sale_id,
    btrim(p_reason),
    v_before,
    jsonb_build_object('status', 'pendente', 'paid_amount', NULL, 'paid_at', NULL, 'cash_ids', v_cash_ids, 'operation', 'receipt_payment_reversal')
  );

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'message', 'Pagamento estornado. A parcela voltou a pendente e o caixa vinculado foi estornado.', 'cashIds', v_cash_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_sale_edit_finance(
  p_sale_id uuid,
  p_sale_patch jsonb,
  p_updates jsonb,
  p_delete_ids uuid[],
  p_inserts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_role text;
  v_status text;
  v_tenant uuid;
  v_key text;
  v_type text;
  v_item jsonb;
  v_row public.finance_receipts%ROWTYPE;
  v_id uuid;
  v_paid boolean;
  v_charged boolean;
  v_group text;
  v_number integer;
  v_allowed text[] := ARRAY[
    'customer_id', 'agreed_price', 'lot_price', 'discount', 'total_value', 'payment_type',
    'down_payment', 'installments_count', 'installment_correction_type', 'broker_id',
    'signal_contract_value', 'signal_paid_at_sale', 'signal_remaining_value',
    'signal_remaining_payment_mode', 'signal_remaining_installments', 'signal_remaining_installment_value',
    'financial_account_id', 'use_balloon_installments', 'balloon_mode', 'balloon_config',
    'installment_definition_mode', 'regular_installment_amount', 'has_residual_installment',
    'residual_installment_amount', 'first_installment_due_date', 'down_payment_due_date'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized', 'message', 'Sessão inválida.');
  END IF;
  IF p_sale_patch ? 'signal_schedule_mode' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Esta edição não grava o modo SEPARATE.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance_receipts' AND column_name = 'schedule_group'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'schema', 'message', 'A coluna finance_receipts.schedule_group não existe neste banco. Nenhuma parcela foi alterada.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sale-edit-finance:' || p_sale_id::text));
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Venda não encontrada.');
  END IF;
  PERFORM 1 FROM public.finance_receipts WHERE sale_id = p_sale_id FOR UPDATE;

  SELECT u.role, u.status, u.tenant_id INTO v_role, v_status, v_tenant
  FROM public.users u WHERE u.id = auth.uid();
  IF v_tenant IS DISTINCT FROM v_sale.tenant_id
     OR upper(COALESCE(v_role, '')) NOT IN ('ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN')
     OR lower(COALESCE(v_status, 'active')) IN ('inactive', 'inativo', 'disabled', 'bloqueado') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Somente um administrador da empresa pode gravar esta edição.');
  END IF;

  FOREACH v_key IN ARRAY v_allowed LOOP
    IF NOT (p_sale_patch ? v_key) THEN
      CONTINUE;
    END IF;
    SELECT data_type INTO v_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = v_key;
    IF v_type IS NULL THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(p_sale_patch -> v_key) = 'null' OR NULLIF(p_sale_patch ->> v_key, '') IS NULL THEN
      EXECUTE format('UPDATE public.sales SET %I = NULL WHERE id = $1', v_key) USING p_sale_id;
    ELSIF v_type IN ('numeric', 'integer', 'bigint', 'double precision', 'real', 'smallint') THEN
      EXECUTE format('UPDATE public.sales SET %I = $1::numeric WHERE id = $2', v_key) USING p_sale_patch ->> v_key, p_sale_id;
    ELSIF v_type = 'boolean' THEN
      EXECUTE format('UPDATE public.sales SET %I = $1::boolean WHERE id = $2', v_key) USING p_sale_patch ->> v_key, p_sale_id;
    ELSIF v_type IN ('json', 'jsonb') THEN
      EXECUTE format('UPDATE public.sales SET %I = $1 WHERE id = $2', v_key) USING p_sale_patch -> v_key, p_sale_id;
    ELSIF v_type = 'uuid' THEN
      EXECUTE format('UPDATE public.sales SET %I = $1::uuid WHERE id = $2', v_key) USING p_sale_patch ->> v_key, p_sale_id;
    ELSE
      EXECUTE format('UPDATE public.sales SET %I = $1 WHERE id = $2', v_key) USING p_sale_patch ->> v_key, p_sale_id;
    END IF;
  END LOOP;

  IF p_delete_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY p_delete_ids LOOP
      SELECT * INTO v_row FROM public.finance_receipts WHERE id = v_id AND sale_id = p_sale_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela informada não pertence a esta venda.';
      END IF;
      v_paid := lower(trim(COALESCE(v_row.status, ''))) IN ('pago', 'paid') OR v_row.paid_at IS NOT NULL;
      v_charged := (to_regclass('public.bank_charges') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.bank_charges bc WHERE bc.finance_receipt_id = v_row.id
          AND upper(COALESCE(bc.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
      )) OR (to_regclass('public.company_asaas_charges') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.company_asaas_charges ac WHERE ac.installment_id = v_row.id
          AND upper(COALESCE(ac.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
      ));
      IF v_paid OR v_charged THEN
        RAISE EXCEPTION 'Parcela protegida não pode ser removida. Nenhuma alteração foi salva.';
      END IF;
      DELETE FROM public.finance_receipts WHERE id = v_row.id AND sale_id = p_sale_id;
    END LOOP;
  END IF;

  IF p_updates IS NOT NULL AND jsonb_typeof(p_updates) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
      v_id := (v_item->>'id')::uuid;
      SELECT * INTO v_row FROM public.finance_receipts WHERE id = v_id AND sale_id = p_sale_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela informada não pertence a esta venda.';
      END IF;
      v_paid := lower(trim(COALESCE(v_row.status, ''))) IN ('pago', 'paid') OR v_row.paid_at IS NOT NULL;
      v_charged := (to_regclass('public.bank_charges') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.bank_charges bc WHERE bc.finance_receipt_id = v_row.id
          AND upper(COALESCE(bc.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
      )) OR (to_regclass('public.company_asaas_charges') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.company_asaas_charges ac WHERE ac.installment_id = v_row.id
          AND upper(COALESCE(ac.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELADO')
      ));
      IF (v_paid OR v_charged) AND (
        (v_item ? 'amount' AND abs(COALESCE((v_item->>'amount')::numeric, v_row.amount) - v_row.amount) > 0.009)
        OR (v_item ? 'due_date' AND (v_item->>'due_date') IS DISTINCT FROM to_char(v_row.due_date, 'YYYY-MM-DD'))
        OR (v_item ? 'status' AND lower(COALESCE(v_item->>'status', '')) NOT IN ('pago', 'paid'))
      ) THEN
        RAISE EXCEPTION 'Parcela paga ou com cobrança bancária não pode ser alterada. Nenhuma alteração foi salva.';
      END IF;
      UPDATE public.finance_receipts
      SET
        due_date = CASE WHEN v_item ? 'due_date' AND NULLIF(v_item->>'due_date', '') IS NOT NULL THEN (v_item->>'due_date')::date ELSE due_date END,
        amount = CASE WHEN v_item ? 'amount' THEN (v_item->>'amount')::numeric ELSE amount END,
        status = CASE WHEN v_item ? 'status' THEN v_item->>'status' ELSE status END,
        paid_amount = CASE WHEN v_item ? 'paid_amount' THEN NULLIF(v_item->>'paid_amount', '')::numeric ELSE paid_amount END,
        paid_at = CASE WHEN v_item ? 'paid_at' THEN NULLIF(v_item->>'paid_at', '')::timestamptz ELSE paid_at END,
        schedule_group = CASE WHEN v_item ? 'schedule_group' THEN NULLIF(v_item->>'schedule_group', '') ELSE schedule_group END,
        base_amount = CASE WHEN v_item ? 'amount' AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'finance_receipts' AND column_name = 'base_amount'
        ) THEN (v_item->>'amount')::numeric ELSE base_amount END,
        signal_addon_amount = CASE WHEN v_item ? 'amount' AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'finance_receipts' AND column_name = 'signal_addon_amount'
        ) THEN 0 ELSE signal_addon_amount END
      WHERE id = v_row.id AND sale_id = p_sale_id;
    END LOOP;
  END IF;

  IF p_inserts IS NOT NULL AND jsonb_typeof(p_inserts) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_inserts) LOOP
      v_group := NULLIF(v_item->>'schedule_group', '');
      v_number := (v_item->>'installment_number')::integer;
      IF v_group IS NOT NULL AND v_group NOT IN ('SIGNAL', 'LOT') THEN
        RAISE EXCEPTION 'Grupo de parcela inválido.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.finance_receipts fr
        WHERE fr.sale_id = p_sale_id
          AND fr.installment_number = v_number
          AND COALESCE(fr.schedule_group, '') = COALESCE(v_group, '')
          AND lower(trim(COALESCE(fr.status, ''))) NOT IN ('cancelado', 'canceled', 'cancelled', 'cancelada')
      ) THEN
        RAISE EXCEPTION 'A parcela já existe. A edição não foi gravada de novo.';
      END IF;
      INSERT INTO public.finance_receipts (
        tenant_id, company_id, sale_id, customer_id, broker_id, project_id, block_id,
        financial_account_id, installment_number, amount, due_date, status, paid_amount, paid_at, schedule_group
      ) VALUES (
        v_sale.tenant_id,
        COALESCE(v_sale.company_id, v_sale.tenant_id),
        p_sale_id,
        NULLIF(v_item->>'customer_id', '')::uuid,
        NULLIF(v_item->>'broker_id', '')::uuid,
        NULLIF(v_item->>'project_id', '')::uuid,
        NULLIF(v_item->>'block_id', '')::uuid,
        NULLIF(v_item->>'financial_account_id', '')::uuid,
        v_number,
        (v_item->>'amount')::numeric,
        (v_item->>'due_date')::date,
        COALESCE(NULLIF(v_item->>'status', ''), 'pendente'),
        NULLIF(v_item->>'paid_amount', '')::numeric,
        NULLIF(v_item->>'paid_at', '')::timestamptz,
        v_group
      );
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, company_id, user_id, action, module, entity_type, entity_id, reference_id, description, new_data
  ) VALUES (
    v_sale.tenant_id,
    v_sale.tenant_id,
    auth.uid(),
    'sale_finance_updated',
    'FINANCE',
    'sales',
    p_sale_id,
    p_sale_id,
    'Edição financeira da venda gravada em uma transação.',
    jsonb_build_object('updates', COALESCE(jsonb_array_length(p_updates), 0), 'deletes', COALESCE(array_length(p_delete_ids, 1), 0), 'inserts', COALESCE(jsonb_array_length(p_inserts), 0))
  );

  RETURN jsonb_build_object('ok', true, 'message', 'Venda e parcelas gravadas.');
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_receipt_payment_reversal(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_sale_edit_finance(uuid, jsonb, jsonb, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_receipt_payment_reversal(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_sale_edit_finance(uuid, jsonb, jsonb, uuid[], jsonb) TO authenticated, service_role;
