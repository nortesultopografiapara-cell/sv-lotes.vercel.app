-- Correção pontual — COALESCE uuid/text em public.execute_sale_title_transfer(p_payload jsonb).
-- 20261017120000 já foi aplicada no DEVELOP hoynysmynxncdlptuzub.
-- CREATE OR REPLACE da função. Sem mudar tabela/schema. Sem backfill. Sem executar transferência.
--
-- Causa: COALESCE misturava company_id (uuid) com tenant_id (text) em
-- customers, e o mesmo padrão arriscado em sales/contracts.
-- Payload JSON continua text; IDs entram via NULLIF(... )::uuid.

CREATE OR REPLACE FUNCTION public.execute_sale_title_transfer(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_company_id uuid;
  v_operator uuid;
  v_idempotency text;
  v_from_expected uuid;
  v_to_expected uuid;
  v_contract_expected uuid;
  v_block_expected uuid;
  v_transfer public.sale_title_transfers%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_block public.blocks%ROWTYPE;
  v_to_customer public.customers%ROWTYPE;
  v_old_contract_id uuid;
  v_old_number text;
  v_old_contract_company uuid;
  v_old_contract_tenant text;
  v_new_contract_id uuid;
  v_new_number text;
  v_html text;
  v_version integer;
  v_now timestamptz := now();
  v_from_html text;
  v_from_html_after text;
  v_current_contract_id uuid;
  v_retarget uuid[] := ARRAY[]::uuid[];
  v_retarget_ok integer;
  v_receipt_count integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:INVALID_PAYLOAD:Payload obrigatório.';
  END IF;

  v_transfer_id := NULLIF(p_payload->>'transfer_id', '')::uuid;
  v_company_id := NULLIF(p_payload->>'company_id', '')::uuid;
  v_operator := NULLIF(p_payload->>'operator_user_id', '')::uuid;
  v_idempotency := NULLIF(btrim(p_payload->>'idempotency_key'), '');
  v_from_expected := NULLIF(p_payload->>'expected_from_customer_id', '')::uuid;
  v_to_expected := NULLIF(p_payload->>'expected_to_customer_id', '')::uuid;
  v_contract_expected := NULLIF(p_payload->>'expected_contract_id', '')::uuid;
  v_block_expected := NULLIF(p_payload->>'expected_block_id', '')::uuid;

  IF v_transfer_id IS NULL OR v_company_id IS NULL OR v_from_expected IS NULL OR v_to_expected IS NULL THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:INVALID_PAYLOAD:transfer_id, company_id e titulares obrigatórios.';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND v_company_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:A transferência não pertence à empresa atual.';
  END IF;

  SELECT * INTO v_transfer
  FROM public.sale_title_transfers
  WHERE id = v_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:TRANSFER_NOT_FOUND:Plano da transferência não encontrado.';
  END IF;

  IF v_transfer.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:A transferência não pertence à empresa atual.';
  END IF;

  IF v_idempotency IS NOT NULL
     AND v_transfer.idempotency_key IS NOT NULL
     AND v_transfer.idempotency_key IS DISTINCT FROM v_idempotency THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:IDEMPOTENCY_MISMATCH:Chave de idempotência não confere.';
  END IF;

  IF v_transfer.status = 'EXECUTED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'status', 'EXECUTED',
      'transfer_id', v_transfer.id,
      'sale_id', v_transfer.sale_id,
      'block_id', v_transfer.block_id,
      'from_customer_id', v_transfer.from_customer_id,
      'to_customer_id', v_transfer.to_customer_id,
      'from_contract_id', v_transfer.from_contract_id,
      'to_contract_id', v_transfer.to_contract_id,
      'previous_transfer_id', v_transfer.previous_transfer_id,
      'sale_id_unchanged', true,
      'block_id_unchanged', true,
      'lot_still_sold', true,
      'receipts_preserved', true,
      'generate_charges', false
    );
  END IF;

  IF v_transfer.status = 'FAILED' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:TRANSFER_FAILED:Este plano falhou. Confirme um novo plano CALCULATED.';
  END IF;

  IF v_transfer.status = 'EXECUTING' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:EXECUTING_IN_PROGRESS:Já existe uma transferência em execução para esta venda.';
  END IF;

  IF v_transfer.status IS DISTINCT FROM 'CALCULATED' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:NOT_CALCULATED:A execução exige um plano CALCULATED.';
  END IF;

  IF v_transfer.from_customer_id IS DISTINCT FROM v_from_expected
     OR v_transfer.to_customer_id IS DISTINCT FROM v_to_expected THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:TITULAR_CHANGED:O titular informado não confere com o plano.';
  END IF;

  IF v_from_expected = v_to_expected THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:SAME_TITULAR:O novo titular não pode ser o titular atual.';
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = v_transfer.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:SALE_NOT_FOUND:Venda não encontrada.';
  END IF;

  IF COALESCE(v_sale.company_id, NULLIF(btrim(v_sale.tenant_id::text), '')::uuid) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:A venda não pertence à empresa atual.';
  END IF;

  IF upper(btrim(coalesce(v_sale.status, ''))) NOT IN ('ACTIVE', 'ATIVO', 'VENDIDO') THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:SALE_NOT_ACTIVE:A venda precisa estar ativa.';
  END IF;

  IF v_sale.customer_id IS DISTINCT FROM v_from_expected THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:TITULAR_CHANGED:O titular da venda mudou desde a prévia.';
  END IF;

  IF v_sale.block_id IS DISTINCT FROM v_transfer.block_id
     OR (v_block_expected IS NOT NULL AND v_sale.block_id IS DISTINCT FROM v_block_expected) THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:ORIGIN_MISMATCH:O lote da venda não confere.';
  END IF;

  SELECT * INTO v_block
  FROM public.blocks
  WHERE id = v_transfer.block_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:LOT_NOT_FOUND:Lote não encontrado.';
  END IF;

  IF COALESCE(v_block.company_id, NULLIF(btrim(v_block.tenant_id::text), '')::uuid) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:O lote não pertence à empresa atual.';
  END IF;

  IF v_block.sale_id IS DISTINCT FROM v_transfer.sale_id
     OR btrim(coalesce(v_block.status, '')) IS DISTINCT FROM 'Vendido' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:LOT_NOT_SOLD:O lote precisa permanecer Vendido nesta venda.';
  END IF;

  SELECT * INTO v_to_customer
  FROM public.customers
  WHERE id = v_to_expected
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CUSTOMER_NOT_FOUND:Novo titular não encontrado.';
  END IF;

  IF COALESCE(v_to_customer.company_id, NULLIF(btrim(v_to_customer.tenant_id::text), '')::uuid) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:O novo titular pertence a outra empresa.';
  END IF;

  PERFORM 1
  FROM public.finance_receipts
  WHERE sale_id = v_transfer.sale_id
  FOR UPDATE;

  SELECT c.id
    INTO v_current_contract_id
  FROM public.contracts c
  WHERE c.sale_id = v_transfer.sale_id
    AND coalesce(c.is_current, false) = true
  ORDER BY c.version DESC NULLS LAST, c.created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_contract_expected IS NOT NULL
     AND v_current_contract_id IS DISTINCT FROM v_contract_expected THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_CHANGED:O contrato vigente mudou desde a prévia.';
  END IF;

  IF v_transfer.from_contract_id IS NOT NULL
     AND v_current_contract_id IS DISTINCT FROM v_transfer.from_contract_id THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_CHANGED:O contrato vigente mudou desde a prévia.';
  END IF;

  v_html := p_payload->'new_contract'->>'generated_html';
  v_new_number := btrim(COALESCE(p_payload->'new_contract'->>'contract_number', ''));
  IF v_html IS NULL OR length(btrim(v_html)) < 20 THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_HTML_REQUIRED:HTML do novo contrato é obrigatório.';
  END IF;
  IF v_new_number IS NULL OR v_new_number !~ '^\d{9}/\d{4}$' THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_NUMBER_INVALID:Número do novo contrato fora do formato oficial.';
  END IF;

  v_old_contract_id := v_transfer.from_contract_id;
  IF v_contract_expected IS NOT NULL AND v_old_contract_id IS DISTINCT FROM v_contract_expected THEN
    RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_CHANGED:O contrato vigente mudou desde a prévia.';
  END IF;

  IF v_old_contract_id IS NOT NULL THEN
    SELECT contract_number, generated_html, company_id, tenant_id::text
      INTO v_old_number, v_from_html, v_old_contract_company, v_old_contract_tenant
    FROM public.contracts
    WHERE id = v_old_contract_id
    FOR UPDATE;
    IF COALESCE(v_old_contract_company, NULLIF(btrim(v_old_contract_tenant), '')::uuid) IS DISTINCT FROM v_company_id THEN
      RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:O contrato anterior não pertence à empresa atual.';
    END IF;
    IF v_old_number IS NOT NULL AND btrim(v_old_number) = v_new_number THEN
      RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:CONTRACT_NUMBER_REUSED:A transferência não pode reutilizar o número do contrato anterior.';
    END IF;
  END IF;

  SELECT COALESCE(
           array_agg(NULLIF(btrim(x), '')::uuid) FILTER (WHERE NULLIF(btrim(x), '') IS NOT NULL),
           ARRAY[]::uuid[]
         )
  INTO v_retarget
  FROM jsonb_array_elements_text(COALESCE(p_payload->'retarget_receipt_ids', '[]'::jsonb)) AS x;

  SELECT COUNT(*) INTO v_receipt_count
  FROM public.finance_receipts
  WHERE sale_id = v_transfer.sale_id;

  IF cardinality(v_retarget) > 0 THEN
    SELECT COUNT(*) INTO v_retarget_ok
    FROM public.finance_receipts
    WHERE sale_id = v_transfer.sale_id
      AND id = ANY (v_retarget);
    IF v_retarget_ok IS DISTINCT FROM cardinality(v_retarget) THEN
      RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:RECEIPT_MISMATCH:Parcela informada não pertence a esta venda.';
    END IF;
  END IF;

  UPDATE public.sale_title_transfers
  SET status = 'EXECUTING',
      operator_user_id = COALESCE(v_operator, operator_user_id),
      updated_at = v_now
  WHERE id = v_transfer.id;

  UPDATE public.finance_receipts
  SET customer_id = v_to_expected
  WHERE sale_id = v_transfer.sale_id;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.contracts
  WHERE sale_id = v_transfer.sale_id;

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
    regenerated_from,
    regenerated_at,
    down_payment,
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
    v_transfer.sale_id,
    v_to_expected,
    v_transfer.project_id,
    v_transfer.block_id,
    v_sale.broker_id,
    v_new_number,
    v_html,
    'ativo',
    v_version,
    true,
    v_old_contract_id,
    v_now,
    0,
    NULLIF(p_payload->'new_contract'->>'contract_model', ''),
    NULLIF(p_payload->'new_contract'->>'project_name_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'project_city_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'project_uf_snapshot', ''),
    NULLIF(p_payload->'new_contract'->>'forum_city_snapshot', '')
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'regenerated_by'
  ) THEN
    EXECUTE 'UPDATE public.contracts SET regenerated_by = $1 WHERE id = $2'
      USING v_operator, v_new_contract_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'installments'
  ) THEN
    EXECUTE 'UPDATE public.contracts SET installments = $1 WHERE id = $2'
      USING COALESCE((p_payload->'new_contract'->>'installments')::integer, 0),
            v_new_contract_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'needs_regenerar'
  ) THEN
    EXECUTE 'UPDATE public.contracts SET needs_regenerar = false WHERE id = $1'
      USING v_new_contract_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'html_content'
  ) THEN
    EXECUTE 'UPDATE public.contracts SET html_content = $1 WHERE id = $2'
      USING v_html, v_new_contract_id;
  END IF;

  IF v_old_contract_id IS NOT NULL THEN
    UPDATE public.contracts
    SET status = 'superseded',
        is_current = false
    WHERE id = v_old_contract_id;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'superseded_by'
    ) THEN
      EXECUTE 'UPDATE public.contracts SET superseded_by = $1 WHERE id = $2'
        USING v_new_contract_id, v_old_contract_id;
    END IF;
    SELECT generated_html INTO v_from_html_after
    FROM public.contracts
    WHERE id = v_old_contract_id;
    IF v_from_html IS DISTINCT FROM v_from_html_after THEN
      RAISE EXCEPTION 'TITLE_TRANSFER_EXECUTE:OLD_CONTRACT_HTML_CHANGED:O contrato anterior não pode ter o HTML alterado.';
    END IF;
  END IF;

  UPDATE public.contracts
  SET is_current = false
  WHERE sale_id = v_transfer.sale_id
    AND id IS DISTINCT FROM v_new_contract_id
    AND coalesce(is_current, false) = true;

  UPDATE public.sales
  SET customer_id = v_to_expected
  WHERE id = v_transfer.sale_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'contract_id'
  ) THEN
    EXECUTE 'UPDATE public.sales SET contract_id = $1 WHERE id = $2'
      USING v_new_contract_id, v_transfer.sale_id;
  END IF;

  UPDATE public.blocks
  SET customer_id = v_to_expected
  WHERE id = v_transfer.block_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocks' AND column_name = 'contract_id'
  ) THEN
    EXECUTE 'UPDATE public.blocks SET contract_id = $1 WHERE id = $2'
      USING v_new_contract_id, v_transfer.block_id;
  END IF;

  UPDATE public.sale_title_transfers
  SET status = 'EXECUTED',
      to_contract_id = v_new_contract_id,
      executed_at = v_now,
      charges_phase = COALESCE(charges_phase, 'COMPLETED'),
      updated_at = v_now
  WHERE id = v_transfer.id;

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'status', 'EXECUTED',
    'transfer_id', v_transfer.id,
    'sale_id', v_transfer.sale_id,
    'block_id', v_transfer.block_id,
    'from_customer_id', v_transfer.from_customer_id,
    'to_customer_id', v_transfer.to_customer_id,
    'from_contract_id', v_old_contract_id,
    'to_contract_id', v_new_contract_id,
    'to_contract_number', v_new_number,
    'previous_transfer_id', v_transfer.previous_transfer_id,
    'sale_id_unchanged', true,
    'block_id_unchanged', true,
    'lot_still_sold', true,
    'receipts_preserved', true,
    'generate_charges', false,
    'receipt_count', v_receipt_count
  );
END;
$$;

COMMENT ON FUNCTION public.execute_sale_title_transfer(jsonb) IS
  'P4 — transferência de titularidade atômica. Mesma sale_id e mesmo block_id. Sem ReleaseLot. Sem RPC da Troca. Sem gerar cobrança.';

REVOKE ALL ON FUNCTION public.execute_sale_title_transfer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_sale_title_transfer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sale_title_transfer(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
