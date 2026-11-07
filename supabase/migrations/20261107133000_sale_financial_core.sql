-- Núcleo financeiro da venda em uma transação.
-- Aplicar em Production somente depois das contagens de duplicidade e da autorização.
-- Não altera a baixa manual já publicada.
-- Não altera create_separate_signal_sale_with_receipts.
-- Não emite boleto nem PIX.
-- CREATE INDEX sem CONCURRENTLY pode travar escrita durante a criação.
-- O índice de contrato vigente aborta esta migration se já existir duplicidade.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_create_request_key text,
  ADD COLUMN IF NOT EXISTS sale_create_request_fingerprint text;

COMMENT ON COLUMN public.sales.sale_create_request_key IS
  'Chave estável da tentativa, enviada de novo no timeout. Não é derivada do cronograma.';

CREATE UNIQUE INDEX IF NOT EXISTS sales_create_request_key_uidx
  ON public.sales (tenant_id, sale_create_request_key)
  WHERE sale_create_request_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_sale_create_receipt_uidx
  ON public.cash_movements (tenant_id, company_id, (metadata->>'installment_id'))
  WHERE status = 'ativo'
    AND metadata->>'provider' = 'SALE_CREATE'
    AND COALESCE(metadata->>'installment_id', '') <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contracts
    WHERE is_current IS TRUE
      AND sale_id IS NOT NULL
    GROUP BY tenant_id, sale_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CONTRACT_CURRENT_DUPLICATES:há mais de um contrato vigente para a mesma venda.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_current_per_sale_uidx
  ON public.contracts (tenant_id, sale_id)
  WHERE is_current IS TRUE
    AND sale_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sale_financial_core_fingerprint(
  p_sale jsonb,
  p_receipts jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fp$
  SELECT concat_ws(
    '|',
    'v1',
    COALESCE(p_sale->>'tenant_id', ''),
    COALESCE(p_sale->>'block_id', ''),
    COALESCE(p_sale->>'customer_id', ''),
    COALESCE(p_sale->>'project_id', ''),
    CASE
      WHEN NULLIF(p_sale->>'total_value', '') IS NULL THEN ''
      ELSE round((p_sale->>'total_value')::numeric * 100)::bigint::text
    END,
    CASE
      WHEN NULLIF(p_sale->>'down_payment', '') IS NULL THEN ''
      ELSE round((p_sale->>'down_payment')::numeric * 100)::bigint::text
    END,
    CASE
      WHEN NULLIF(p_sale->>'signal_contract_value', '') IS NULL THEN ''
      ELSE round((p_sale->>'signal_contract_value')::numeric * 100)::bigint::text
    END,
    CASE
      WHEN NULLIF(p_sale->>'signal_paid_at_sale', '') IS NULL THEN ''
      ELSE round((p_sale->>'signal_paid_at_sale')::numeric * 100)::bigint::text
    END,
    COALESCE(p_sale->>'installments_count', ''),
    COALESCE(p_sale->>'signal_schedule_mode', ''),
    COALESCE((
      SELECT string_agg(
        concat_ws(
          ':',
          COALESCE(item->>'schedule_group', ''),
          COALESCE(item->>'installment_number', ''),
          round(COALESCE(NULLIF(item->>'amount', '')::numeric, 0) * 100)::bigint::text,
          CASE
            WHEN NULLIF(item->>'paid_amount', '') IS NULL THEN ''
            ELSE round((item->>'paid_amount')::numeric * 100)::bigint::text
          END,
          COALESCE(item->>'status', ''),
          COALESCE(item->>'due_date', '')
        ),
        ';'
        ORDER BY COALESCE(item->>'schedule_group', ''), COALESCE((item->>'installment_number')::integer, 0)
      )
      FROM jsonb_array_elements(COALESCE(p_receipts, '[]'::jsonb)) AS item
    ), '')
  );
$fp$;

CREATE OR REPLACE FUNCTION public.create_sale_financial_core(
  p_sale jsonb,
  p_receipts jsonb,
  p_request_key text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid;
  v_key text;
  v_lot uuid;
  v_project uuid;
  v_customer uuid;
  v_fingerprint text;
  v_existing public.sales%ROWTYPE;
  v_sale jsonb;
  v_rec public.sales%ROWTYPE;
  v_sale_id uuid;
  v_count integer;
  v_cash_id uuid;
  v_cash_amount numeric;
  v_receipt_id uuid;
  v_contract_id uuid;
  v_constraint text;
  v_replay boolean := false;
BEGIN
  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'SALE_CORE_INVALID:A venda está incompleta.';
  END IF;
  IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' THEN
    RAISE EXCEPTION 'SALE_CORE_RECEIPTS:Os recebíveis da venda estão incompletos.';
  END IF;
  IF p_request_key IS NULL
     OR btrim(p_request_key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'SALE_CORE_KEY:A chave da venda é obrigatória e precisa ser estável.';
  END IF;
  v_key := lower(btrim(p_request_key));

  BEGIN
    v_tenant := NULLIF(p_sale->>'tenant_id', '')::uuid;
    v_lot := NULLIF(p_sale->>'block_id', '')::uuid;
    v_project := NULLIF(p_sale->>'project_id', '')::uuid;
    v_customer := NULLIF(p_sale->>'customer_id', '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'SALE_CORE_TENANT:A venda não pertence a esta empresa.';
  END;
  IF v_tenant IS NULL OR v_lot IS NULL OR v_project IS NULL OR v_customer IS NULL THEN
    RAISE EXCEPTION 'SALE_CORE_TENANT:Empresa, empreendimento, comprador e lote são obrigatórios.';
  END IF;
  IF NULLIF(p_sale->>'company_id', '') IS NOT NULL
     AND NULLIF(p_sale->>'company_id', '')::uuid IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'SALE_CORE_TENANT:A venda não pertence a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_receipts) AS item
    WHERE item ?| ARRAY['asaas', 'pix', 'boleto', 'barcode', 'charge_id', 'asaas_payment_id']
       OR (
         NULLIF(item->>'amount', '') IS NOT NULL
         AND (item->>'amount')::numeric < 0
       )
       OR (
         NULLIF(item->>'paid_amount', '') IS NOT NULL
         AND (item->>'paid_amount')::numeric < 0
       )
       OR (
         NULLIF(item->>'paid_amount', '') IS NOT NULL
         AND NULLIF(item->>'amount', '') IS NOT NULL
         AND round((item->>'paid_amount')::numeric, 2) > round((item->>'amount')::numeric, 2)
       )
       OR COALESCE(item->>'tenant_id', '') <> v_tenant::text
       OR (
         NULLIF(item->>'company_id', '') IS NOT NULL
         AND item->>'company_id' <> v_tenant::text
       )
       OR (
         NULLIF(item->>'block_id', '') IS NOT NULL
         AND item->>'block_id' <> v_lot::text
       )
       OR (
         NULLIF(item->>'project_id', '') IS NOT NULL
         AND item->>'project_id' <> v_project::text
       )
       OR (
         NULLIF(item->>'customer_id', '') IS NOT NULL
         AND item->>'customer_id' <> v_customer::text
       )
  ) THEN
    RAISE EXCEPTION 'SALE_CORE_RECEIPTS:Recebível inconsistente, negativo ou de outra empresa.';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_receipts) AS item
    WHERE COALESCE((item->>'installment_number')::integer, -999) = 0
      AND lower(COALESCE(item->>'status', '')) IN ('pago', 'paid', 'paga')
      AND NULLIF(item->>'paid_amount', '') IS NOT NULL
      AND round((item->>'paid_amount')::numeric, 2) > 0
  ) > 1 THEN
    RAISE EXCEPTION 'SALE_CORE_CASH:Há mais de uma entrada inicial confirmada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = v_customer
      AND CASE
        WHEN tenant_id IS NULL
          OR btrim(tenant_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN false
        ELSE btrim(tenant_id)::uuid = v_tenant
      END
      AND (company_id IS NULL OR company_id = v_tenant)
  ) THEN
    RAISE EXCEPTION 'SALE_CORE_CUSTOMER:O comprador não pertence a esta empresa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = v_project
      AND (
        (
          tenant_id IS NOT NULL
          AND btrim(tenant_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND btrim(tenant_id)::uuid = v_tenant
        )
        OR company_id = v_tenant
      )
  ) THEN
    RAISE EXCEPTION 'SALE_CORE_PROJECT:O empreendimento não pertence a esta empresa.';
  END IF;

  v_fingerprint := public.sale_financial_core_fingerprint(p_sale, p_receipts);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':' || v_key, 0));

  SELECT *
    INTO v_existing
  FROM public.sales
  WHERE tenant_id = v_tenant
    AND sale_create_request_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.sale_create_request_fingerprint IS DISTINCT FROM v_fingerprint
       OR v_existing.block_id IS DISTINCT FROM v_lot
       OR v_existing.customer_id IS DISTINCT FROM v_customer
       OR v_existing.project_id IS DISTINCT FROM v_project
       OR v_existing.tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'SALE_REQUEST_MISMATCH:A chave já foi usada com empresa, lote, comprador ou valores diferentes.';
    END IF;
    v_sale_id := v_existing.id;
    v_replay := true;
  ELSE
    PERFORM 1
    FROM public.blocks
    WHERE id = v_lot
    FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1
      FROM public.blocks
      WHERE id = v_lot
        AND CASE
          WHEN tenant_id IS NULL
            OR btrim(tenant_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN false
          ELSE btrim(tenant_id)::uuid = v_tenant
        END
        AND project_id = v_project
    ) THEN
      RAISE EXCEPTION 'SALE_CORE_LOT:O lote não pertence a esta empresa e a este empreendimento.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales AS other_sale
      WHERE other_sale.tenant_id = v_tenant
        AND (other_sale.block_id = v_lot OR other_sale.lot_id = v_lot)
        AND other_sale.sale_create_request_key IS DISTINCT FROM v_key
        AND lower(COALESCE(other_sale.status, '')) NOT IN ('cancelled', 'cancelado', 'distrato', 'rescindido')
    ) OR EXISTS (
      SELECT 1
      FROM public.blocks AS locked_block
      JOIN public.sales AS linked_sale ON linked_sale.id = locked_block.sale_id
      WHERE locked_block.id = v_lot
        AND linked_sale.tenant_id = v_tenant
        AND linked_sale.sale_create_request_key IS DISTINCT FROM v_key
    ) THEN
      RAISE EXCEPTION 'LOT_ALREADY_SOLD:Este lote já possui venda registrada.';
    END IF;

    v_sale := p_sale || jsonb_build_object(
      'company_id', v_tenant,
      'sale_create_request_key', v_key,
      'sale_create_request_fingerprint', v_fingerprint
    );
    v_rec := jsonb_populate_record(NULL::public.sales, v_sale);

    INSERT INTO public.sales (
      tenant_id, company_id, project_id, block_id, block_number, lot_number, lot_id,
      customer_id, client_id, user_id, agreed_price, lot_price, broker_id, payment_type,
      discount, total_value, down_payment, installments_count, installment_correction_type,
      status, signal_contract_value, signal_paid_at_sale, signal_remaining_value,
      signal_remaining_payment_mode, signal_remaining_installments, signal_remaining_installment_value,
      installment_definition_mode, regular_installment_amount, has_residual_installment,
      residual_installment_amount, use_balloon_installments, balloon_mode, balloon_config,
      financial_account_id, contract_model, termination_policy_snapshot, termination_policy_version,
      termination_policy_source, sale_spouse_name, sale_spouse_nationality, sale_spouse_marital_status,
      sale_spouse_profession, sale_spouse_rg, sale_spouse_rg_issuer, sale_spouse_cpf, sale_spouse_phone,
      sale_spouse_email, sale_spouse_address, signal_schedule_mode, signal_installment_count,
      signal_first_due_date, lot_schedule_start_mode, lot_schedule_first_due_date,
      hold_lot_charges_until_signal_settled, separate_signal_request_key,
      buyer_person_type, buyer_signature_mode, buyer_representatives_json,
      sale_create_request_key, sale_create_request_fingerprint
    ) VALUES (
      v_tenant, v_tenant, v_rec.project_id, v_rec.block_id, v_rec.block_number, v_rec.lot_number, v_rec.lot_id,
      v_rec.customer_id, v_rec.client_id, v_rec.user_id, v_rec.agreed_price, v_rec.lot_price, v_rec.broker_id,
      v_rec.payment_type, v_rec.discount, v_rec.total_value, v_rec.down_payment, v_rec.installments_count,
      v_rec.installment_correction_type, COALESCE(v_rec.status, 'ACTIVE'), v_rec.signal_contract_value,
      v_rec.signal_paid_at_sale, v_rec.signal_remaining_value, v_rec.signal_remaining_payment_mode,
      v_rec.signal_remaining_installments, v_rec.signal_remaining_installment_value,
      v_rec.installment_definition_mode, v_rec.regular_installment_amount, v_rec.has_residual_installment,
      v_rec.residual_installment_amount, COALESCE(v_rec.use_balloon_installments, false), v_rec.balloon_mode,
      v_rec.balloon_config, v_rec.financial_account_id, v_rec.contract_model, v_rec.termination_policy_snapshot,
      v_rec.termination_policy_version, v_rec.termination_policy_source, v_rec.sale_spouse_name,
      v_rec.sale_spouse_nationality, v_rec.sale_spouse_marital_status, v_rec.sale_spouse_profession,
      v_rec.sale_spouse_rg, v_rec.sale_spouse_rg_issuer, v_rec.sale_spouse_cpf, v_rec.sale_spouse_phone,
      v_rec.sale_spouse_email, v_rec.sale_spouse_address, v_rec.signal_schedule_mode,
      v_rec.signal_installment_count, v_rec.signal_first_due_date, v_rec.lot_schedule_start_mode,
      v_rec.lot_schedule_first_due_date, v_rec.hold_lot_charges_until_signal_settled,
      CASE
        WHEN v_rec.signal_schedule_mode = 'SEPARATE' THEN v_key
        ELSE v_rec.separate_signal_request_key
      END,
      v_rec.buyer_person_type, v_rec.buyer_signature_mode, v_rec.buyer_representatives_json,
      v_key, v_fingerprint
    )
    RETURNING id INTO v_sale_id;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sales'
        AND column_name = 'lf_contract_snapshot_json'
    ) AND p_sale ? 'lf_contract_snapshot_json' THEN
      UPDATE public.sales
      SET lf_contract_snapshot_json = p_sale->'lf_contract_snapshot_json'
      WHERE id = v_sale_id
        AND tenant_id = v_tenant;
    END IF;

    INSERT INTO public.finance_receipts (
      tenant_id, company_id, sale_id, customer_id, broker_id, project_id, block_id,
      financial_account_id, schedule_group, installment_number, amount, base_amount,
      signal_addon_amount, due_date, status, paid_amount, paid_at
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
      NULLIF(item->>'schedule_group', ''),
      (item->>'installment_number')::integer,
      (item->>'amount')::numeric,
      COALESCE(NULLIF(item->>'base_amount', '')::numeric, (item->>'amount')::numeric),
      COALESCE(NULLIF(item->>'signal_addon_amount', '')::numeric, 0),
      NULLIF(item->>'due_date', '')::date,
      COALESCE(NULLIF(item->>'status', ''), 'pendente'),
      CASE
        WHEN NULLIF(item->>'paid_amount', '') IS NULL THEN 0
        ELSE (item->>'paid_amount')::numeric
      END,
      NULLIF(item->>'paid_at', '')::timestamptz
    FROM jsonb_array_elements(p_receipts) AS item;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> jsonb_array_length(p_receipts) THEN
      RAISE EXCEPTION 'SALE_CORE_RECEIPTS:A quantidade de recebíveis gravados não fecha com o cronograma.';
    END IF;

    SELECT id, paid_amount
      INTO v_receipt_id, v_cash_amount
    FROM public.finance_receipts
    WHERE sale_id = v_sale_id
      AND tenant_id = v_tenant
      AND company_id = v_tenant
      AND installment_number = 0
      AND lower(status) IN ('pago', 'paid', 'paga')
      AND paid_amount > 0
    ORDER BY id
    LIMIT 1;

    IF v_receipt_id IS NOT NULL THEN
      INSERT INTO public.cash_movements (
        tenant_id, company_id, project_id, type, category, description, amount,
        customer_id, sale_id, movement_date, status, created_by, metadata
      ) VALUES (
        v_tenant,
        v_tenant,
        v_project,
        'entrada',
        'Venda de Lote',
        'Pagamento de Parcela 0 - CT S/N',
        v_cash_amount,
        v_customer,
        v_sale_id,
        CURRENT_DATE,
        'ativo',
        p_user_id,
        jsonb_build_object(
          'provider', 'SALE_CREATE',
          'installment_id', v_receipt_id,
          'receipt_id', v_receipt_id
        )
      )
      RETURNING id INTO v_cash_id;
    END IF;

    UPDATE public.blocks
    SET status = 'Vendido',
        customer_id = v_customer,
        sale_id = v_sale_id,
        broker_id = NULLIF(p_sale->>'broker_id', '')::uuid,
        price = COALESCE(NULLIF(p_sale->>'lot_price', '')::numeric, NULLIF(p_sale->>'total_value', '')::numeric)
    WHERE id = v_lot
      AND project_id = v_project
      AND CASE
        WHEN tenant_id IS NULL
          OR btrim(tenant_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN false
        ELSE btrim(tenant_id)::uuid = v_tenant
      END
      AND (sale_id IS NULL OR sale_id = v_sale_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_CORE_LOT:O lote não pôde ser vinculado a esta venda.';
    END IF;
  END IF;

  SELECT cash.id, cash.amount
    INTO v_cash_id, v_cash_amount
  FROM public.cash_movements AS cash
  WHERE cash.sale_id = v_sale_id
    AND cash.tenant_id = v_tenant
    AND cash.company_id = v_tenant
    AND cash.status = 'ativo'
    AND cash.metadata->>'provider' = 'SALE_CREATE'
  ORDER BY cash.created_at
  LIMIT 1;

  SELECT id
    INTO v_contract_id
  FROM public.contracts
  WHERE sale_id = v_sale_id
    AND tenant_id = v_tenant
    AND is_current IS TRUE
  ORDER BY created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'replayed', v_replay,
    'cash_id', v_cash_id,
    'cash_amount', v_cash_amount,
    'contract_id', v_contract_id,
    'receipts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', receipt.id,
        'tenant_id', receipt.tenant_id,
        'company_id', receipt.company_id,
        'sale_id', receipt.sale_id,
        'project_id', receipt.project_id,
        'customer_id', receipt.customer_id,
        'amount', receipt.amount,
        'paid_amount', receipt.paid_amount,
        'status', receipt.status,
        'installment_number', receipt.installment_number,
        'schedule_group', receipt.schedule_group
      ) ORDER BY receipt.schedule_group, receipt.installment_number)
      FROM public.finance_receipts AS receipt
      WHERE receipt.sale_id = v_sale_id
        AND receipt.tenant_id = v_tenant
    ), '[]'::jsonb)
  );
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'sales_create_request_key_uidx' THEN
      RAISE;
    END IF;
    SELECT *
      INTO v_existing
    FROM public.sales
    WHERE tenant_id = v_tenant
      AND sale_create_request_key = v_key;
    IF NOT FOUND
       OR v_existing.sale_create_request_fingerprint IS DISTINCT FROM v_fingerprint
       OR v_existing.block_id IS DISTINCT FROM v_lot
       OR v_existing.customer_id IS DISTINCT FROM v_customer THEN
      RAISE EXCEPTION 'SALE_REQUEST_MISMATCH:A chave já foi usada com dados diferentes.';
    END IF;
    SELECT id
      INTO v_contract_id
    FROM public.contracts
    WHERE sale_id = v_existing.id
      AND tenant_id = v_tenant
      AND is_current IS TRUE
    LIMIT 1;
    RETURN jsonb_build_object(
      'sale_id', v_existing.id,
      'replayed', true,
      'contract_id', v_contract_id,
      'receipts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', receipt.id,
          'amount', receipt.amount,
          'paid_amount', receipt.paid_amount,
          'status', receipt.status,
          'installment_number', receipt.installment_number,
          'schedule_group', receipt.schedule_group,
          'tenant_id', receipt.tenant_id,
          'company_id', receipt.company_id,
          'sale_id', receipt.sale_id
        ))
        FROM public.finance_receipts AS receipt
        WHERE receipt.sale_id = v_existing.id
          AND receipt.tenant_id = v_tenant
      ), '[]'::jsonb)
    );
END;
$fn$;

COMMENT ON FUNCTION public.create_sale_financial_core(jsonb, jsonb, text, uuid) IS
  'Grava venda, recebíveis, uma entrada SALE_CREATE e o lote vendido na mesma transação. Repetição da mesma chave devolve a venda original somente se os dados coincidirem.';

REVOKE ALL ON FUNCTION public.create_sale_financial_core(jsonb, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sale_financial_core(jsonb, jsonb, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_sale_financial_core(jsonb, jsonb, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_financial_core(jsonb, jsonb, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
