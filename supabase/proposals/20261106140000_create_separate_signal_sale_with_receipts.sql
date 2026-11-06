-- PROPOSTA. Não executar sem autorização.
-- Develop hoynysmynxncdlptuzub apenas. Production proibida.
-- Não altera vendas antigas, não emite boleto ou Pix e não recria as colunas já existentes.
-- Uma única função grava a venda SEPARATE e todos os recebíveis.
-- Se qualquer validação ou insert falhar, o PostgreSQL desfaz a função inteira.

CREATE OR REPLACE FUNCTION public.create_separate_signal_sale_with_receipts(
  p_sale jsonb,
  p_receipts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_key text;
  v_sale jsonb;
  v_rec public.sales;
  v_sale_id uuid;
  v_count integer;
  v_lot_sum numeric;
  v_signal_sum numeric;
  v_paid_sum numeric;
  v_lot_count bigint;
  v_signal_future_count bigint;
  v_signal_initial_count bigint;
  v_lot_first date;
  v_signal_first date;
BEGIN
  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_INVALID:A venda separada está incompleta.';
  END IF;
  IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) = 0 THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_RECEIPTS_INCOMPLETE:Falha ao gravar as parcelas. Nenhuma venda foi mantida.';
  END IF;
  IF COALESCE(p_sale->>'signal_schedule_mode', '') <> 'SEPARATE' THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_INVALID:A venda não está na modalidade separada.';
  END IF;
  IF NULLIF(p_sale->>'signal_remaining_payment_mode', '') IS NOT NULL
     OR NULLIF(p_sale->>'signal_remaining_installments', '') IS NOT NULL
     OR NULLIF(p_sale->>'signal_remaining_installment_value', '') IS NOT NULL
     OR COALESCE(p_sale->>'use_balloon_installments', 'false') IN ('true', 't') THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_EMBEDDED:A modalidade separada não aceita o parcelamento embutido.';
  END IF;

  v_tenant := NULLIF(p_sale->>'tenant_id', '')::uuid;
  v_key := NULLIF(btrim(p_sale->>'separate_signal_request_key'), '');
  IF v_tenant IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_TENANT_MISMATCH:Os recebíveis não pertencem a esta empresa.';
  END IF;
  IF NULLIF(p_sale->>'company_id', '') IS NOT NULL
     AND NULLIF(p_sale->>'company_id', '')::uuid IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_TENANT_MISMATCH:Os recebíveis não pertencem a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_receipts) AS item
    WHERE COALESCE(item->>'schedule_group', '') NOT IN ('SIGNAL', 'LOT')
       OR (
         item ? 'signal_addon_amount'
         AND NULLIF(item->>'signal_addon_amount', '') IS NOT NULL
         AND round((item->>'signal_addon_amount')::numeric, 2) <> 0
       )
       OR NULLIF(item->>'due_date', '') IS NULL
       OR NULLIF(item->>'amount', '') IS NULL
       OR NULLIF(item->>'base_amount', '') IS NULL
       OR round((item->>'amount')::numeric, 2) <> round((item->>'base_amount')::numeric, 2)
       OR (
         NULLIF(item->>'project_id', '') IS NOT NULL
         AND NULLIF(item->>'project_id', '') IS DISTINCT FROM NULLIF(p_sale->>'project_id', '')
       )
       OR (
         NULLIF(item->>'block_id', '') IS NOT NULL
         AND NULLIF(item->>'block_id', '') IS DISTINCT FROM NULLIF(p_sale->>'block_id', '')
       )
       OR (
         NULLIF(item->>'customer_id', '') IS NOT NULL
         AND NULLIF(item->>'customer_id', '') IS DISTINCT FROM NULLIF(p_sale->>'customer_id', '')
       )
       OR (
         item->>'schedule_group' = 'LOT'
         AND (
           COALESCE(item->>'status', '') <> 'pendente'
           OR round(COALESCE(NULLIF(item->>'paid_amount', '')::numeric, 0), 2) <> 0
           OR COALESCE((item->>'installment_number')::integer, 0) < 1
         )
       )
       OR (
         item->>'schedule_group' = 'SIGNAL'
         AND COALESCE((item->>'installment_number')::integer, -1) < 0
       )
       OR COALESCE(item->>'tenant_id', '') <> v_tenant::text
       OR (
         item ? 'company_id'
         AND item->>'company_id' IS NOT NULL
         AND item->>'company_id' <> v_tenant::text
       )
       OR item ?| ARRAY['asaas', 'pix', 'boleto', 'barcode', 'charge_id', 'asaas_payment_id']
  ) THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_RECEIPTS_INCOMPLETE:Falha ao gravar as parcelas. Nenhuma venda foi mantida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.blocks
    WHERE id = NULLIF(p_sale->>'block_id', '')::uuid
      AND tenant_id = v_tenant
      AND project_id = NULLIF(p_sale->>'project_id', '')::uuid
  ) THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_TENANT_MISMATCH:Os recebíveis não pertencem a esta empresa.';
  END IF;

  SELECT
    COALESCE(sum(round((item->>'amount')::numeric, 2)) FILTER (WHERE item->>'schedule_group' = 'LOT'), 0),
    COALESCE(sum(round((item->>'amount')::numeric, 2)) FILTER (WHERE item->>'schedule_group' = 'SIGNAL'), 0),
    COALESCE(sum(round((item->>'amount')::numeric, 2)) FILTER (
      WHERE item->>'schedule_group' = 'SIGNAL' AND item->>'status' = 'pago'
    ), 0),
    count(*) FILTER (WHERE item->>'schedule_group' = 'LOT'),
    count(*) FILTER (
      WHERE item->>'schedule_group' = 'SIGNAL'
        AND (item->>'installment_number')::integer > 0
    ),
    count(*) FILTER (
      WHERE item->>'schedule_group' = 'SIGNAL'
        AND (item->>'installment_number')::integer = 0
    ),
    min((item->>'due_date')::date) FILTER (WHERE item->>'schedule_group' = 'LOT'),
    min((item->>'due_date')::date) FILTER (
      WHERE item->>'schedule_group' = 'SIGNAL'
        AND (item->>'installment_number')::integer > 0
    )
  INTO
    v_lot_sum,
    v_signal_sum,
    v_paid_sum,
    v_lot_count,
    v_signal_future_count,
    v_signal_initial_count,
    v_lot_first,
    v_signal_first
  FROM jsonb_array_elements(p_receipts) AS item;

  IF round(v_lot_sum, 2) <> round(COALESCE(NULLIF(p_sale->>'total_value', '')::numeric, 0), 2)
     OR round(v_signal_sum, 2) <> round(COALESCE(NULLIF(p_sale->>'signal_contract_value', '')::numeric, 0), 2)
     OR round(v_lot_sum + v_signal_sum, 2) <> round(
       COALESCE(NULLIF(p_sale->>'total_value', '')::numeric, 0)
       + COALESCE(NULLIF(p_sale->>'signal_contract_value', '')::numeric, 0),
       2
     )
     OR round(v_paid_sum, 2) <> round(COALESCE(NULLIF(p_sale->>'signal_paid_at_sale', '')::numeric, 0), 2)
     OR v_lot_count <> COALESCE(NULLIF(p_sale->>'installments_count', '')::bigint, 0)
     OR v_signal_future_count <> COALESCE(NULLIF(p_sale->>'signal_installment_count', '')::bigint, 0)
     OR v_signal_initial_count > 1
     OR (round(v_paid_sum, 2) > 0 AND v_signal_initial_count <> 1)
     OR (round(v_paid_sum, 2) = 0 AND v_signal_initial_count <> 0)
     OR v_lot_first IS DISTINCT FROM NULLIF(p_sale->>'lot_schedule_first_due_date', '')::date
     OR (
       COALESCE(NULLIF(p_sale->>'signal_installment_count', '')::integer, 0) > 0
       AND v_signal_first IS DISTINCT FROM NULLIF(p_sale->>'signal_first_due_date', '')::date
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_receipts) AS item
       GROUP BY item->>'schedule_group', (item->>'installment_number')::integer
       HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_receipts) AS earlier
       JOIN jsonb_array_elements(p_receipts) AS later
         ON earlier->>'schedule_group' = later->>'schedule_group'
        AND (earlier->>'installment_number')::integer < (later->>'installment_number')::integer
        AND (earlier->>'due_date')::date > (later->>'due_date')::date
     )
  THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_RECEIPTS_INCOMPLETE:Falha ao gravar as parcelas. Nenhuma venda foi mantida.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':' || v_key, 0));

  IF EXISTS (
    SELECT 1
    FROM public.sales
    WHERE tenant_id = v_tenant
      AND separate_signal_request_key = v_key
  ) THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_ALREADY_REGISTERED:Esta confirmação de sinal já foi registrada.';
  END IF;

  v_sale := p_sale || jsonb_build_object('company_id', v_tenant);
  v_rec := jsonb_populate_record(NULL::public.sales, v_sale);

  INSERT INTO public.sales (
    tenant_id,
    company_id,
    project_id,
    block_id,
    block_number,
    lot_number,
    lot_id,
    customer_id,
    client_id,
    user_id,
    agreed_price,
    lot_price,
    broker_id,
    payment_type,
    discount,
    total_value,
    down_payment,
    installments_count,
    installment_correction_type,
    status,
    signal_contract_value,
    signal_paid_at_sale,
    signal_remaining_value,
    signal_remaining_payment_mode,
    signal_remaining_installments,
    signal_remaining_installment_value,
    installment_definition_mode,
    regular_installment_amount,
    has_residual_installment,
    residual_installment_amount,
    use_balloon_installments,
    balloon_mode,
    balloon_config,
    financial_account_id,
    contract_model,
    termination_policy_snapshot,
    termination_policy_version,
    termination_policy_source,
    sale_spouse_name,
    sale_spouse_nationality,
    sale_spouse_marital_status,
    sale_spouse_profession,
    sale_spouse_rg,
    sale_spouse_rg_issuer,
    sale_spouse_cpf,
    sale_spouse_phone,
    sale_spouse_email,
    sale_spouse_address,
    signal_schedule_mode,
    signal_installment_count,
    signal_first_due_date,
    lot_schedule_start_mode,
    lot_schedule_first_due_date,
    hold_lot_charges_until_signal_settled,
    separate_signal_request_key
  ) VALUES (
    v_tenant,
    v_tenant,
    v_rec.project_id,
    v_rec.block_id,
    v_rec.block_number,
    v_rec.lot_number,
    v_rec.lot_id,
    v_rec.customer_id,
    v_rec.client_id,
    v_rec.user_id,
    v_rec.agreed_price,
    v_rec.lot_price,
    v_rec.broker_id,
    v_rec.payment_type,
    v_rec.discount,
    v_rec.total_value,
    v_rec.down_payment,
    v_rec.installments_count,
    v_rec.installment_correction_type,
    v_rec.status,
    v_rec.signal_contract_value,
    v_rec.signal_paid_at_sale,
    NULL,
    NULL,
    NULL,
    NULL,
    v_rec.installment_definition_mode,
    v_rec.regular_installment_amount,
    v_rec.has_residual_installment,
    v_rec.residual_installment_amount,
    false,
    NULL,
    NULL,
    v_rec.financial_account_id,
    v_rec.contract_model,
    v_rec.termination_policy_snapshot,
    v_rec.termination_policy_version,
    v_rec.termination_policy_source,
    v_rec.sale_spouse_name,
    v_rec.sale_spouse_nationality,
    v_rec.sale_spouse_marital_status,
    v_rec.sale_spouse_profession,
    v_rec.sale_spouse_rg,
    v_rec.sale_spouse_rg_issuer,
    v_rec.sale_spouse_cpf,
    v_rec.sale_spouse_phone,
    v_rec.sale_spouse_email,
    v_rec.sale_spouse_address,
    'SEPARATE',
    v_rec.signal_installment_count,
    v_rec.signal_first_due_date,
    v_rec.lot_schedule_start_mode,
    v_rec.lot_schedule_first_due_date,
    v_rec.hold_lot_charges_until_signal_settled,
    v_key
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.finance_receipts (
    tenant_id,
    company_id,
    sale_id,
    customer_id,
    broker_id,
    project_id,
    block_id,
    financial_account_id,
    schedule_group,
    installment_number,
    amount,
    base_amount,
    signal_addon_amount,
    due_date,
    status,
    paid_amount,
    paid_at
  )
  SELECT
    v_tenant,
    v_tenant,
    v_sale_id,
    NULLIF(item->>'customer_id', '')::uuid,
    NULLIF(item->>'broker_id', '')::uuid,
    NULLIF(item->>'project_id', '')::uuid,
    NULLIF(item->>'block_id', '')::uuid,
    NULLIF(item->>'financial_account_id', '')::uuid,
    item->>'schedule_group',
    (item->>'installment_number')::integer,
    (item->>'amount')::numeric,
    (item->>'base_amount')::numeric,
    0,
    (item->>'due_date')::date,
    item->>'status',
    COALESCE((item->>'paid_amount')::numeric, 0),
    NULLIF(item->>'paid_at', '')::timestamptz
  FROM jsonb_array_elements(p_receipts) AS item;

  SELECT count(*)
    INTO v_count
  FROM public.finance_receipts
  WHERE sale_id = v_sale_id
    AND schedule_group IN ('SIGNAL', 'LOT');

  IF v_count <> jsonb_array_length(p_receipts) THEN
    RAISE EXCEPTION 'SEPARATE_SIGNAL_RECEIPTS_INCOMPLETE:Falha ao gravar as parcelas. Nenhuma venda foi mantida.';
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_count', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) IS
  'Grava venda SEPARATE e recebíveis SIGNAL/LOT na mesma transação. Não emite cobrança.';

REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
