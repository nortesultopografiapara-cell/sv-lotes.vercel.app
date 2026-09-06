-- Fase 4 — execução atômica da Troca de lote (substituição de unidade).
-- Aditivo. DEVELOP somente nesta etapa. Sem comandos destrutivos de dados.
-- Idempotente; seguro reaplicar.
--
-- Isolamento: NÃO reutiliza ReleaseLot, sale_release_settlements nem retenção 25%.
-- Sem Asaas/Inter (Fase 5). Sem termo TL-… (Fase 6).
-- Mesma sale_id permanece a identidade histórica da negociação.

CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap_id uuid;
  v_company_id uuid;
  v_operator uuid;
  v_idempotency text;
  v_swap public.sale_lot_swaps%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_from public.blocks%ROWTYPE;
  v_to public.blocks%ROWTYPE;
  v_first_block uuid;
  v_second_block uuid;
  v_cancel_ids uuid[] := ARRAY[]::uuid[];
  v_preserve_ids uuid[] := ARRAY[]::uuid[];
  v_paid_count integer;
  v_unpaid_cancel integer;
  v_new_contract_id uuid;
  v_old_contract_id uuid;
  v_old_number text;
  v_new_number text;
  v_html text;
  v_version integer;
  v_new_price numeric(14,2);
  v_installments integer;
  v_rec jsonb;
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_rid uuid;
  v_now timestamptz := now();
  v_from_html text;
  v_from_html_after text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:INVALID_PAYLOAD:Payload obrigatório.';
  END IF;

  v_swap_id := NULLIF(p_payload->>'swap_id', '')::uuid;
  v_company_id := NULLIF(p_payload->>'company_id', '')::uuid;
  v_operator := NULLIF(p_payload->>'operator_user_id', '')::uuid;
  v_idempotency := NULLIF(btrim(p_payload->>'idempotency_key'), '');
  IF v_swap_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:INVALID_PAYLOAD:swap_id e company_id obrigatórios.';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND v_company_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:TENANT_MISMATCH:A troca não pertence à empresa atual.';
  END IF;

  SELECT * INTO v_swap
  FROM public.sale_lot_swaps
  WHERE id = v_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:SWAP_NOT_FOUND:Plano da troca não encontrado.';
  END IF;

  IF v_swap.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:TENANT_MISMATCH:A troca não pertence à empresa atual.';
  END IF;

  IF v_idempotency IS NOT NULL
     AND v_swap.idempotency_key IS NOT NULL
     AND v_swap.idempotency_key IS DISTINCT FROM v_idempotency THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:IDEMPOTENCY_MISMATCH:Chave de idempotência não confere com o plano.';
  END IF;

  IF v_swap.status = 'EXECUTED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'status', 'EXECUTED',
      'swap_id', v_swap.id,
      'sale_id', v_swap.sale_id,
      'from_block_id', v_swap.from_block_id,
      'to_block_id', v_swap.to_block_id,
      'from_contract_id', v_swap.from_contract_id,
      'to_contract_id', v_swap.to_contract_id,
      'sale_id_unchanged', true,
      'charges_untouched', true
    );
  END IF;

  IF v_swap.status = 'FAILED' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:SWAP_FAILED:Este plano falhou. Confirme um novo plano CALCULATED.';
  END IF;

  IF v_swap.status = 'EXECUTING' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:EXECUTING_IN_PROGRESS:Já existe uma troca em execução para esta venda.';
  END IF;

  IF v_swap.status IS DISTINCT FROM 'CALCULATED' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:NOT_CALCULATED:A execução exige um plano CALCULATED.';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = v_swap.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:SALE_NOT_FOUND:Venda não encontrada.';
  END IF;

  IF coalesce(v_sale.company_id, v_sale.tenant_id) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:TENANT_MISMATCH:A venda não pertence à empresa atual.';
  END IF;

  IF upper(btrim(coalesce(v_sale.status, ''))) NOT IN ('ACTIVE', 'ATIVO', 'VENDIDO') THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:SALE_NOT_ACTIVE:A venda precisa estar ativa para a troca de lote.';
  END IF;

  IF v_sale.block_id IS DISTINCT FROM v_swap.from_block_id THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:ORIGIN_MISMATCH:O lote origem da venda não confere com o plano.';
  END IF;

  IF v_swap.from_block_id < v_swap.to_block_id THEN
    v_first_block := v_swap.from_block_id;
    v_second_block := v_swap.to_block_id;
  ELSE
    v_first_block := v_swap.to_block_id;
    v_second_block := v_swap.from_block_id;
  END IF;

  PERFORM 1 FROM public.blocks WHERE id = v_first_block FOR UPDATE;
  PERFORM 1 FROM public.blocks WHERE id = v_second_block FOR UPDATE;

  SELECT * INTO v_from FROM public.blocks WHERE id = v_swap.from_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:LOT_NOT_FOUND:Lote origem não encontrado.';
  END IF;
  SELECT * INTO v_to FROM public.blocks WHERE id = v_swap.to_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:LOT_NOT_FOUND:Lote destino não encontrado.';
  END IF;

  IF coalesce(v_from.company_id, v_from.tenant_id) IS DISTINCT FROM v_company_id
     OR coalesce(v_to.company_id, v_to.tenant_id) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:TENANT_MISMATCH:Os lotes não pertencem à empresa atual.';
  END IF;

  IF v_from.project_id IS DISTINCT FROM v_to.project_id
     OR v_from.project_id IS DISTINCT FROM v_swap.from_project_id
     OR v_to.project_id IS DISTINCT FROM v_swap.to_project_id THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:PROJECT_MISMATCH:A troca v1 exige o mesmo empreendimento.';
  END IF;

  IF v_from.sale_id IS DISTINCT FROM v_swap.sale_id
     OR btrim(coalesce(v_from.status, '')) IS DISTINCT FROM 'Vendido' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:ORIGIN_MISMATCH:O lote origem precisa estar Vendido nesta venda.';
  END IF;

  IF btrim(coalesce(v_to.status, '')) IS DISTINCT FROM 'Disponível'
     OR v_to.sale_id IS NOT NULL
     OR v_to.contract_id IS NOT NULL THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:DESTINATION_NOT_AVAILABLE:O lote destino precisa estar Disponível, sem venda e sem contrato.';
  END IF;

  PERFORM 1
  FROM public.finance_receipts
  WHERE sale_id = v_swap.sale_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_cancel_ids
  FROM jsonb_array_elements_text(COALESCE(p_payload->'cancel_receipt_ids', '[]'::jsonb)) AS x;

  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[])
  INTO v_preserve_ids
  FROM jsonb_array_elements_text(COALESCE(p_payload->'preserve_receipt_ids', '[]'::jsonb)) AS x;

  IF cardinality(v_preserve_ids) > 0 THEN
    SELECT COUNT(*) INTO v_paid_count
    FROM public.finance_receipts
    WHERE sale_id = v_swap.sale_id
      AND id = ANY (v_preserve_ids)
      AND (
        lower(btrim(coalesce(status, ''))) IN ('pago', 'paid')
        OR coalesce(paid_amount, 0) > 0
      );
    IF v_paid_count IS DISTINCT FROM cardinality(v_preserve_ids) THEN
      RAISE EXCEPTION 'LOT_SWAP_EXECUTE:PRESERVE_RECEIPT_CHANGED:Um recebimento pago do plano foi alterado. Recalcule o plano.';
    END IF;
  END IF;

  IF cardinality(v_cancel_ids) > 0 THEN
    SELECT COUNT(*) INTO v_unpaid_cancel
    FROM public.finance_receipts
    WHERE sale_id = v_swap.sale_id
      AND id = ANY (v_cancel_ids)
      AND lower(btrim(coalesce(status, ''))) IN ('pendente', 'atrasado', 'pending', 'overdue')
      AND coalesce(paid_amount, 0) = 0
      AND paid_at IS NULL;
    IF v_unpaid_cancel IS DISTINCT FROM cardinality(v_cancel_ids) THEN
      RAISE EXCEPTION 'LOT_SWAP_EXECUTE:RECEIPT_PAID_SINCE_PLAN:Uma parcela futura do plano foi paga ou alterada. Recalcule o plano.';
    END IF;
  END IF;

  v_html := p_payload->'new_contract'->>'generated_html';
  v_new_number := btrim(COALESCE(p_payload->'new_contract'->>'contract_number', ''));
  IF v_html IS NULL OR length(btrim(v_html)) < 20 THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:CONTRACT_HTML_REQUIRED:HTML do novo contrato é obrigatório.';
  END IF;
  IF v_new_number IS NULL OR v_new_number !~ '^\d{9}/\d{4}$' THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:CONTRACT_NUMBER_INVALID:Número do novo contrato fora do formato oficial.';
  END IF;

  v_old_contract_id := v_swap.from_contract_id;
  IF v_old_contract_id IS NOT NULL THEN
    SELECT contract_number, generated_html
      INTO v_old_number, v_from_html
    FROM public.contracts
    WHERE id = v_old_contract_id
    FOR UPDATE;
    IF v_old_number IS NOT NULL AND btrim(v_old_number) = v_new_number THEN
      RAISE EXCEPTION 'LOT_SWAP_EXECUTE:CONTRACT_NUMBER_REUSED:A troca não pode reutilizar o número do contrato anterior.';
    END IF;
  END IF;

  v_new_price := COALESCE((p_payload->'sale_patch'->>'agreed_price')::numeric, v_swap.new_lot_price);
  v_installments := COALESCE((p_payload->'sale_patch'->>'installments_count')::integer, 0);

  UPDATE public.sale_lot_swaps
  SET status = 'EXECUTING',
      operator_user_id = COALESCE(v_operator, operator_user_id),
      updated_at = v_now
  WHERE id = v_swap.id;

  IF cardinality(v_cancel_ids) > 0 THEN
    UPDATE public.finance_receipts
    SET status = 'cancelado'
    WHERE sale_id = v_swap.sale_id
      AND id = ANY (v_cancel_ids)
      AND lower(btrim(coalesce(status, ''))) IN ('pendente', 'atrasado', 'pending', 'overdue')
      AND coalesce(paid_amount, 0) = 0
      AND paid_at IS NULL;
  END IF;

  FOR v_rec IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_payload->'new_receipts', '[]'::jsonb))
  LOOP
    INSERT INTO public.finance_receipts (
      tenant_id,
      sale_id,
      customer_id,
      project_id,
      block_id,
      installment_number,
      due_date,
      amount,
      paid_amount,
      paid_at,
      status
    )
    VALUES (
      v_company_id,
      v_swap.sale_id,
      v_sale.customer_id,
      v_swap.to_project_id,
      v_swap.to_block_id,
      COALESCE((v_rec->>'installment_number')::integer, 1),
      COALESCE(NULLIF(v_rec->>'due_date', ''), (CURRENT_DATE + 30))::date,
      COALESCE((v_rec->>'amount')::numeric, 0),
      0,
      NULL,
      'pendente'
    )
    RETURNING id INTO v_rid;
    v_created_ids := array_append(v_created_ids, v_rid);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'finance_receipts' AND column_name = 'company_id'
    ) THEN
      EXECUTE 'UPDATE public.finance_receipts SET company_id = $1 WHERE id = $2'
        USING v_company_id, v_rid;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'finance_receipts' AND column_name = 'broker_id'
    ) THEN
      EXECUTE 'UPDATE public.finance_receipts SET broker_id = $1 WHERE id = $2'
        USING v_sale.broker_id, v_rid;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'finance_receipts'
        AND column_name = 'financial_account_id'
    ) AND NULLIF(v_rec->>'financial_account_id', '') IS NOT NULL THEN
      EXECUTE 'UPDATE public.finance_receipts SET financial_account_id = $1 WHERE id = $2'
        USING NULLIF(v_rec->>'financial_account_id', '')::uuid, v_rid;
    END IF;
  END LOOP;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.contracts
  WHERE sale_id = v_swap.sale_id;

  v_new_contract_id := gen_random_uuid();

  INSERT INTO public.contracts (
    id,
    tenant_id,
    company_id,
    sale_id,
    customer_id,
    project_id,
    block_id,
    broker_id,
    contract_number,
    generated_html,
    status,
    version,
    is_current,
    needs_regenerar,
    regenerated_from,
    regenerated_at,
    regenerated_by,
    pdf_url,
    sale_value,
    down_payment,
    installments,
    contract_model,
    project_name_snapshot,
    project_city_snapshot,
    project_uf_snapshot,
    forum_city_snapshot
  )
  VALUES (
    v_new_contract_id,
    v_company_id,
    v_company_id,
    v_swap.sale_id,
    v_sale.customer_id,
    v_swap.to_project_id,
    v_swap.to_block_id,
    v_sale.broker_id,
    v_new_number,
    v_html,
    'ativo',
    v_version,
    true,
    false,
    v_old_contract_id,
    v_now,
    v_operator,
    NULL,
    v_new_price,
    COALESCE((p_payload->'new_contract'->>'down_payment')::numeric, v_sale.down_payment),
    COALESCE((p_payload->'new_contract'->>'installments')::integer, v_installments),
    NULLIF(p_payload->'new_contract'->>'contract_model', ''),
    NULLIF(p_payload->'new_contract'->>'project_name_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'project_city_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'project_uf_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'forum_city_snapshot', '')
  );

  IF v_old_contract_id IS NOT NULL THEN
    UPDATE public.contracts
    SET status = 'superseded',
        is_current = false,
        superseded_by = v_new_contract_id
    WHERE id = v_old_contract_id;

    SELECT generated_html INTO v_from_html_after
    FROM public.contracts
    WHERE id = v_old_contract_id;
    IF v_from_html IS DISTINCT FROM v_from_html_after THEN
      RAISE EXCEPTION 'LOT_SWAP_EXECUTE:OLD_CONTRACT_HTML_CHANGED:O contrato anterior não pode ter o HTML alterado.';
    END IF;
  END IF;

  UPDATE public.contracts
  SET is_current = false
  WHERE sale_id = v_swap.sale_id
    AND id IS DISTINCT FROM v_new_contract_id
    AND coalesce(is_current, false) = true;

  UPDATE public.sales
  SET block_id = v_swap.to_block_id,
      agreed_price = v_new_price,
      lot_price = v_new_price,
      total_value = v_new_price,
      contract_id = v_new_contract_id,
      installments_count = COALESCE(NULLIF(v_installments, 0), installments_count)
  WHERE id = v_swap.sale_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'lot_id'
  ) THEN
    EXECUTE 'UPDATE public.sales SET lot_id = $1 WHERE id = $2'
      USING v_swap.to_block_id, v_swap.sale_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'block_number'
  ) AND NULLIF(p_payload->'sale_patch'->>'block_number', '') IS NOT NULL THEN
    EXECUTE 'UPDATE public.sales SET block_number = $1 WHERE id = $2'
      USING p_payload->'sale_patch'->>'block_number', v_swap.sale_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'lot_number'
  ) AND NULLIF(p_payload->'sale_patch'->>'lot_number', '') IS NOT NULL THEN
    EXECUTE 'UPDATE public.sales SET lot_number = $1 WHERE id = $2'
      USING p_payload->'sale_patch'->>'lot_number', v_swap.sale_id;
  END IF;

  UPDATE public.blocks
  SET status = 'Disponível',
      customer_id = NULL,
      sale_id = NULL,
      contract_id = NULL,
      broker_id = NULL
  WHERE id = v_swap.from_block_id
    AND sale_id = v_swap.sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:ORIGIN_MISMATCH:O lote origem não pôde ser liberado porque já não pertence a esta venda.';
  END IF;

  UPDATE public.blocks
  SET status = 'Vendido',
      customer_id = v_sale.customer_id,
      sale_id = v_swap.sale_id,
      contract_id = v_new_contract_id,
      broker_id = v_sale.broker_id,
      price = v_new_price
  WHERE id = v_swap.to_block_id
    AND sale_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_SWAP_EXECUTE:DESTINATION_NOT_AVAILABLE:O lote destino deixou de estar disponível durante a execução.';
  END IF;

  INSERT INTO public.lot_audit_logs (
    company_id, project_id, block_id, lot_id, sale_id, contract_id, user_id,
    action, title, description, old_data, new_data, source
  )
  VALUES
  (
    v_company_id, v_swap.from_project_id, v_swap.from_block_id, v_swap.from_block_id,
    v_swap.sale_id, v_old_contract_id, v_operator,
    'status_changed',
    'Troca de lote — origem liberada',
    'Lote origem voltou para Disponível. A venda permanece a mesma.',
    jsonb_build_object('status', 'Vendido', 'sale_id', v_swap.sale_id, 'contract_id', v_old_contract_id),
    jsonb_build_object(
      'status', 'Disponível',
      'sale_id', v_swap.sale_id,
      'motiveCode', 'troca_lote',
      'to_block_id', v_swap.to_block_id,
      'swap_id', v_swap.id
    ),
    'sale_flow'
  ),
  (
    v_company_id, v_swap.to_project_id, v_swap.to_block_id, v_swap.to_block_id,
    v_swap.sale_id, v_new_contract_id, v_operator,
    'sold',
    'Troca de lote — destino vinculado',
    'Lote destino passou para Vendido na mesma venda.',
    jsonb_build_object('status', 'Disponível', 'sale_id', NULL),
    jsonb_build_object(
      'status', 'Vendido',
      'sale_id', v_swap.sale_id,
      'motiveCode', 'troca_lote',
      'from_block_id', v_swap.from_block_id,
      'from_contract_id', v_old_contract_id,
      'to_contract_id', v_new_contract_id,
      'swap_id', v_swap.id
    ),
    'sale_flow'
  );

  UPDATE public.sale_lot_swaps
  SET status = 'EXECUTED',
      to_contract_id = v_new_contract_id,
      executed_at = v_now,
      operator_user_id = COALESCE(v_operator, operator_user_id),
      updated_at = v_now,
      financial_snapshot = COALESCE(financial_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'executedAt', v_now,
          'execute', true,
          'phase', 4,
          'toContractId', v_new_contract_id,
          'toContractNumber', v_new_number,
          'fromContractId', v_old_contract_id,
          'chargesUntouched', true
        )
  WHERE id = v_swap.id;

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'status', 'EXECUTED',
    'swap_id', v_swap.id,
    'sale_id', v_swap.sale_id,
    'from_block_id', v_swap.from_block_id,
    'to_block_id', v_swap.to_block_id,
    'from_contract_id', v_old_contract_id,
    'to_contract_id', v_new_contract_id,
    'to_contract_number', v_new_number,
    'canceled_receipt_ids', to_jsonb(v_cancel_ids),
    'created_receipt_ids', to_jsonb(v_created_ids),
    'sale_id_unchanged', true,
    'charges_untouched', true
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.execute_sale_lot_swap(jsonb) IS
  'Fase 4 — troca de lote atômica. Mesma sale_id. Sem Asaas/Inter. Sem ReleaseLot. Rollback integral em qualquer RAISE.';

REVOKE ALL ON FUNCTION public.execute_sale_lot_swap(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_sale_lot_swap(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sale_lot_swap(jsonb) TO service_role;

COMMENT ON COLUMN public.sale_lot_swaps.to_contract_id IS
  'Contrato vigente após a troca (Fase 4). O contrato anterior permanece em from_contract_id, com HTML intacto e status superseded.';

NOTIFY pgrst, 'reload schema';
