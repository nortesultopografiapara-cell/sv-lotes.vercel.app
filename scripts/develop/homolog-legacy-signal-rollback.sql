-- Homologação da regularização do sinal antigo, exclusiva do Supabase Develop.
-- Projeto autorizado: hoynysmynxncdlptuzub
-- Projeto proibido:   aezktedncttwpqeunjej
--
-- A função execute_legacy_signal_regularization não possui COMMIT nem chamada externa.
-- O PASSO 1 termina com erro proposital HOMOLOG_ROLLBACK_OK para desfazer a transação.
-- Não há caixa, cobrança, recibo, e-mail, WhatsApp ou migration neste script.
--
-- Como executar, nesta ordem, no SQL Editor do Develop:
-- 1. Confira na barra de endereço: hoynysmynxncdlptuzub.
--    Se aparecer aezktedncttwpqeunjej ou zumwvcxgrpxggyxomzic, feche a aba e não execute nada.
-- 2. Execute somente o PASSO 0. Ele apenas lê o tipo de paid_at e os triggers.
-- 3. Execute somente o PASSO 1. O erro HOMOLOG_ROLLBACK_OK é o descarte da transação.
--    Se paid_at for date, o PASSO 1 aborta antes de inserir a venda.
-- 4. Execute o PASSO 2. Todas as quantidades precisam ser zero.
-- 5. Execute o PASSO 3 somente se alguma quantidade do PASSO 2 for maior que zero.

-- =============================================================================
-- PASSO 0 — somente leitura
-- =============================================================================

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  t.typname AS type_name,
  format_type(a.atttypid, a.atttypmod) AS formatted_type,
  a.atttypmod
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE n.nspname = 'public'
  AND c.relname = 'finance_receipts'
  AND a.attname = 'paid_at'
  AND NOT a.attisdropped;

SELECT
  tgname,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.finance_receipts'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- =============================================================================
-- PASSO 1
-- =============================================================================

DROP FUNCTION IF EXISTS pg_temp.homolog_insert(text, jsonb);

CREATE FUNCTION pg_temp.homolog_insert(p_table text, p_values jsonb)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  rec record;
  fk_target text;
  parts_cols text[] := ARRAY[]::text[];
  parts_vals text[] := ARRAY[]::text[];
  literal text;
  raw text;
  enum_label text;
BEGIN
  FOR rec IN
    SELECT
      a.attname AS column_name,
      t.typname AS udt_name,
      t.typcategory AS typcategory,
      a.attnotnull AS not_null,
      pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
      a.attgenerated AS generated,
      a.attidentity AS identity
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  LOOP
    IF rec.generated <> '' THEN
      CONTINUE;
    END IF;
    IF rec.identity <> '' AND NOT (p_values ? rec.column_name) THEN
      CONTINUE;
    END IF;

    raw := NULL;
    IF p_values ? rec.column_name AND jsonb_typeof(p_values -> rec.column_name) <> 'null' THEN
      raw := p_values ->> rec.column_name;
    ELSIF NOT rec.not_null OR rec.column_default IS NOT NULL THEN
      CONTINUE;
    ELSIF rec.udt_name = 'uuid' THEN
      SELECT quote_ident(fn.nspname) || '.' || quote_ident(fc.relname)
        INTO fk_target
      FROM pg_constraint k
      JOIN pg_attribute ka
        ON ka.attrelid = k.conrelid
       AND ka.attnum = k.conkey[1]
      JOIN pg_class fc ON fc.oid = k.confrelid
      JOIN pg_namespace fn ON fn.oid = fc.relnamespace
      WHERE k.conrelid = format('public.%I', p_table)::regclass
        AND k.contype = 'f'
        AND ka.attname = rec.column_name
        AND cardinality(k.conkey) = 1
      LIMIT 1;
      RAISE EXCEPTION
        'HOMOLOG_FAIL coluna uuid obrigatoria %.% referencia %',
        p_table, rec.column_name, COALESCE(fk_target, 'sem chave estrangeira');
    ELSIF rec.typcategory = 'S' THEN
      raw := 'HOMOLOG SINAL FICTICIO';
    ELSIF rec.typcategory = 'N' THEN
      raw := '0';
    ELSIF rec.typcategory = 'B' THEN
      raw := 'false';
    ELSIF rec.udt_name = 'date' THEN
      raw := '2026-11-17';
    ELSIF rec.udt_name IN ('timestamp', 'timestamptz') THEN
      raw := '2026-10-24 14:12:49+00';
    ELSIF rec.udt_name IN ('json', 'jsonb') THEN
      raw := '{}';
    ELSIF rec.typcategory = 'E' THEN
      SELECT e.enumlabel
        INTO enum_label
      FROM pg_type et
      JOIN pg_enum e ON e.enumtypid = et.oid
      WHERE et.typname = rec.udt_name
      ORDER BY e.enumsortorder
      LIMIT 1;
      IF enum_label IS NULL THEN
        RAISE EXCEPTION 'HOMOLOG_FAIL enumeracao sem valor %.%', p_table, rec.column_name;
      END IF;
      raw := enum_label;
    ELSE
      RAISE EXCEPTION 'HOMOLOG_FAIL coluna obrigatoria %.% tipo %', p_table, rec.column_name, rec.udt_name;
    END IF;

    IF raw IS NULL THEN
      literal := 'NULL';
    ELSIF rec.udt_name = 'uuid' THEN
      literal := format('%L::uuid', raw);
    ELSIF rec.typcategory = 'N' THEN
      IF raw !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'HOMOLOG_FAIL numero invalido %.%', p_table, rec.column_name;
      END IF;
      literal := raw;
    ELSIF rec.typcategory = 'B' THEN
      literal := CASE WHEN lower(raw) IN ('true', 't', '1') THEN 'true' ELSE 'false' END;
    ELSIF rec.udt_name = 'date' THEN
      literal := format('%L::date', raw);
    ELSIF rec.udt_name IN ('timestamp', 'timestamptz') THEN
      literal := format('%L::timestamptz', raw);
    ELSIF rec.udt_name IN ('json', 'jsonb') THEN
      literal := format('%L::jsonb', raw);
    ELSIF rec.typcategory = 'E' THEN
      literal := format('%L::%I', raw, rec.udt_name);
    ELSE
      literal := format('%L', raw);
    END IF;

    parts_cols := parts_cols || format('%I', rec.column_name);
    parts_vals := parts_vals || literal;
  END LOOP;

  EXECUTE format(
    'INSERT INTO public.%I (%s) VALUES (%s)',
    p_table,
    array_to_string(parts_cols, ', '),
    array_to_string(parts_vals, ', ')
  );
END;
$fn$;

DO $homolog$
DECLARE
  v_company uuid := 'c1711717-1717-4717-8717-171717171701';
  v_project uuid := 'c1711717-1717-4717-8717-171717171702';
  v_block uuid := 'c1711717-1717-4717-8717-171717171703';
  v_customer uuid := 'c1711717-1717-4717-8717-171717171704';
  v_user uuid := 'c1711717-1717-4717-8717-171717171705';
  v_sale uuid := 'c1711717-1717-4717-8717-171717171706';
  v_receipt uuid := 'c1711717-1717-4717-8717-171717171707';
  v_contract uuid := 'c1711717-1717-4717-8717-171717171708';
  v_contract_v2 uuid := 'c1711717-1717-4717-8717-171717171709';
  v_real_sale uuid := '924b7332-1828-4309-881c-5a44cdc169c5';
  v_paid_at timestamptz := '2026-10-24 14:12:49+00';
  v_reason text := 'Homologacao ficticia do sinal antigo no Develop.';
  v_installments jsonb := '[
    {"dueDate":"2026-12-20","amountCents":66667},
    {"dueDate":"2027-01-20","amountCents":66667},
    {"dueDate":"2027-02-20","amountCents":66666}
  ]'::jsonb;
  v_user_fk text;
  v_html_column text;
  v_i integer;
  v_due date;
  v_amount numeric;
  v_result jsonb;
  v_replay jsonb;
  v_second jsonb;
  v_lot_cents integer;
  v_lot_count integer;
  v_signal_count integer;
  v_cash integer;
  v_bank integer;
  v_asaas integer;
  v_audit integer;
  v_paid_type text;
  v_paid_formatted text;
  v_triggers text;
  v_paid_before text;
  v_paid_after text;
  v_kept_amount integer;
  v_kept_status text;
  v_kept_group text;
  v_sale_total integer;
  v_html_v1 text;
  v_status_v1 text;
  v_status_v2 text;
  v_current_v2 boolean;
  v_report jsonb;
BEGIN
  IF 'hoynysmynxncdlptuzub' IN ('aezktedncttwpqeunjej', 'zumwvcxgrpxggyxomzic') THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL projeto recusado';
  END IF;
  IF v_sale = v_real_sale OR v_company::text LIKE '06c7bd77%' THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL identificador real bloqueado';
  END IF;

  SELECT t.typname, format_type(a.atttypid, a.atttypmod)
    INTO v_paid_type, v_paid_formatted
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'finance_receipts'
    AND a.attname = 'paid_at'
    AND NOT a.attisdropped;

  SELECT COALESCE(string_agg(tgname, ', ' ORDER BY tgname), '')
    INTO v_triggers
  FROM pg_trigger
  WHERE tgrelid = 'public.finance_receipts'::regclass
    AND NOT tgisinternal;

  IF v_paid_type IS NULL THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL coluna finance_receipts.paid_at ausente';
  END IF;
  IF v_paid_type = 'date' OR v_paid_formatted = 'date' THEN
    RAISE EXCEPTION
      'HOMOLOG_FAIL paid_at esta como % e descarta a hora na gravacao. A funcao nao atribui paid_at. Nenhuma venda foi inserida e nenhuma migration foi aplicada. triggers=%',
      v_paid_formatted, v_triggers;
  END IF;
  IF v_paid_type NOT IN ('timestamp', 'timestamptz') THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL paid_at tipo inesperado % (%). Nenhuma venda foi inserida.', v_paid_type, v_paid_formatted;
  END IF;
  IF to_regprocedure('public.execute_legacy_signal_regularization(uuid,uuid,uuid,integer,jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL funcao ausente neste banco';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT v_company AS id
      UNION ALL SELECT v_project
      UNION ALL SELECT v_block
      UNION ALL SELECT v_customer
      UNION ALL SELECT v_user
      UNION ALL SELECT v_sale
      UNION ALL SELECT v_receipt
      UNION ALL SELECT v_contract
      UNION ALL SELECT v_contract_v2
    ) ids
    WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.id = ids.id)
       OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = ids.id)
       OR EXISTS (SELECT 1 FROM public.finance_receipts r WHERE r.id = ids.id)
       OR EXISTS (SELECT 1 FROM public.contracts k WHERE k.id = ids.id)
  ) THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL identificador ficticio ja existe; nenhuma linha nova foi gravada';
  END IF;

  PERFORM pg_temp.homolog_insert('companies', jsonb_build_object(
    'id', v_company,
    'name', 'HOMOLOG SINAL FICTICIO 20261117',
    'slug', 'homolog-sinal-ficticio-20261117',
    'cnpj', '00000000000991',
    'plan', 'PROFESSIONAL',
    'active', true
  ));

  SELECT format('%I.%I', fn.nspname, fc.relname)
    INTO v_user_fk
  FROM pg_constraint k
  JOIN pg_attribute ka ON ka.attrelid = k.conrelid AND ka.attnum = k.conkey[1]
  JOIN pg_class fc ON fc.oid = k.confrelid
  JOIN pg_namespace fn ON fn.oid = fc.relnamespace
  WHERE k.conrelid = 'public.users'::regclass
    AND k.contype = 'f'
    AND ka.attname = 'id'
    AND cardinality(k.conkey) = 1;

  IF v_user_fk = 'auth.users' THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      v_user,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'homolog.sinal.ficticio.20261117@svlotes.test',
      '$2a$06$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid',
      v_paid_at,
      '{"provider":"email","providers":["email"],"homolog":true}'::jsonb,
      '{"homolog":true}'::jsonb,
      v_paid_at,
      v_paid_at,
      '',
      '',
      '',
      ''
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    UPDATE public.users
    SET tenant_id = v_company,
        role = 'ADMIN',
        status = 'ACTIVE',
        email = 'homolog.sinal.ficticio.20261117@svlotes.test'
    WHERE id = v_user;
  ELSE
    PERFORM pg_temp.homolog_insert('users', jsonb_build_object(
      'id', v_user,
      'tenant_id', v_company,
      'full_name', 'HOMOLOG SINAL FICTICIO',
      'email', 'homolog.sinal.ficticio.20261117@svlotes.test',
      'role', 'ADMIN',
      'status', 'ACTIVE'
    ));
  END IF;

  PERFORM pg_temp.homolog_insert('projects', jsonb_build_object(
    'id', v_project,
    'tenant_id', v_company,
    'company_id', v_company,
    'name', 'LOTEAMENTO HOMOLOG SINAL FICTICIO',
    'status', 'ACTIVE',
    'location', 'Homologacao ficticia'
  ));
  PERFORM pg_temp.homolog_insert('blocks', jsonb_build_object(
    'id', v_block,
    'tenant_id', v_company,
    'company_id', v_company,
    'project_id', v_project,
    'name', 'HQ',
    'number', 'HOMOLOG'
  ));
  PERFORM pg_temp.homolog_insert('customers', jsonb_build_object(
    'id', v_customer,
    'tenant_id', v_company,
    'company_id', v_company,
    'name', 'CLIENTE HOMOLOG SINAL FICTICIO',
    'cpf_cnpj', '00000000000991',
    'email', 'cliente.homolog.sinal.20261117@svlotes.test',
    'phone', '94000000000',
    'city', 'Parauapebas',
    'state', 'PA'
  ));

  PERFORM pg_temp.homolog_insert('sales', jsonb_build_object(
    'id', v_sale,
    'tenant_id', v_company,
    'company_id', v_company,
    'project_id', v_project,
    'block_id', v_block,
    'customer_id', v_customer,
    'user_id', v_user,
    'total_value', 70768.54,
    'agreed_price', 70768.54,
    'lot_price', 70768.54,
    'down_payment', 3500,
    'signal_contract_value', 3500,
    'signal_paid_at_sale', 1500,
    'signal_remaining_value', 2000,
    'installments_count', 120,
    'status', 'ACTIVE',
    'block_number', 'HQ',
    'lot_number', 'HOMOLOG',
    'payment_type', 'FINANCIADO'
  ));

  SELECT column_name
    INTO v_html_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name IN ('generated_html', 'html_content', 'contract_html', 'content', 'html')
  ORDER BY CASE column_name
    WHEN 'generated_html' THEN 1
    WHEN 'html_content' THEN 2
    WHEN 'contract_html' THEN 3
    ELSE 4
  END
  LIMIT 1;

  PERFORM pg_temp.homolog_insert('contracts', jsonb_strip_nulls(jsonb_build_object(
    'id', v_contract,
    'tenant_id', v_company,
    'company_id', v_company,
    'sale_id', v_sale,
    'customer_id', v_customer,
    'project_id', v_project,
    'block_id', v_block,
    'contract_number', 'HOMOLOG-SINAL-20261117',
    'status', 'ativo',
    'version', 1,
    'is_current', true,
    'needs_regenerar', false,
    'sale_value', 70768.54,
    'down_payment', 3500,
    'installments', 120
  )) || CASE
    WHEN v_html_column IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(v_html_column, 'VERSAO-ANTERIOR-HOMOLOG')
  END);

  UPDATE public.sales
  SET contract_id = v_contract
  WHERE id = v_sale
    AND id <> v_real_sale
    AND tenant_id = v_company;

  PERFORM pg_temp.homolog_insert('finance_receipts', jsonb_build_object(
    'id', v_receipt,
    'tenant_id', v_company,
    'company_id', v_company,
    'sale_id', v_sale,
    'customer_id', v_customer,
    'project_id', v_project,
    'block_id', v_block,
    'contract_id', v_contract,
    'installment_number', 0,
    'due_date', '2026-10-21',
    'amount', 3500,
    'paid_amount', 3500,
    'base_amount', 3500,
    'signal_addon_amount', 0,
    'paid_at', '2026-10-24 14:12:49+00',
    'status', 'pago'
  ));

  EXECUTE
    'UPDATE public.finance_receipts SET paid_at = $1 WHERE id = $2 AND sale_id = $3 AND tenant_id = $4'
    USING v_paid_at, v_receipt, v_sale, v_company;
  SELECT to_char(paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')
    INTO v_paid_before
  FROM public.finance_receipts
  WHERE id = v_receipt;
  IF v_paid_before IS DISTINCT FROM '2026-10-24 14:12:49.000000' THEN
    RAISE EXCEPTION
      'HOMOLOG_FAIL a hora foi descartada antes da funcao tipo=% valor=% triggers=%',
      v_paid_formatted, v_paid_before, v_triggers;
  END IF;

  FOR v_i IN 1..120 LOOP
    v_amount := CASE WHEN v_i = 120 THEN 589.48 ELSE 589.74 END;
    v_due := (DATE '2027-03-20' + ((v_i - 1) * INTERVAL '1 month'))::date;
    PERFORM pg_temp.homolog_insert('finance_receipts', jsonb_build_object(
      'tenant_id', v_company,
      'company_id', v_company,
      'sale_id', v_sale,
      'customer_id', v_customer,
      'project_id', v_project,
      'block_id', v_block,
      'contract_id', v_contract,
      'installment_number', v_i,
      'due_date', to_char(v_due, 'YYYY-MM-DD'),
      'amount', v_amount,
      'base_amount', v_amount,
      'signal_addon_amount', 0,
      'status', 'pendente'
    ));
  END LOOP;

  v_result := public.execute_legacy_signal_regularization(
    v_sale, v_user, v_company, 150000, v_installments, v_reason, 'homolog-sinal-1711-a', true
  );
  IF COALESCE(v_result->>'ok', 'false') <> 'true' OR v_result->>'code' IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL apply %', v_result;
  END IF;

  SELECT
    ROUND(amount * 100)::integer,
    to_char(paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
    status,
    schedule_group
  INTO v_kept_amount, v_paid_after, v_kept_status, v_kept_group
  FROM public.finance_receipts
  WHERE id = v_receipt;

  SELECT COALESCE(SUM(ROUND(amount * 100))::integer, 0), COUNT(*)::integer
    INTO v_lot_cents, v_lot_count
  FROM public.finance_receipts
  WHERE sale_id = v_sale
    AND installment_number >= 1
    AND COALESCE(schedule_group, '') <> 'SIGNAL'
    AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelado', 'canceled', 'cancelled', 'cancelada');

  SELECT COUNT(*)::integer
    INTO v_signal_count
  FROM public.finance_receipts
  WHERE sale_id = v_sale
    AND schedule_group = 'SIGNAL'
    AND installment_number > 0
    AND status = 'pendente'
    AND paid_at IS NULL
    AND paid_amount IS NULL;

  SELECT COUNT(*)::integer INTO v_cash
  FROM public.cash_movements
  WHERE sale_id = v_sale;

  IF to_regclass('public.bank_charges') IS NULL THEN
    v_bank := 0;
  ELSE
    EXECUTE 'SELECT COUNT(*)::integer FROM public.bank_charges WHERE finance_receipt_id = $1'
      INTO v_bank USING v_receipt;
  END IF;
  IF to_regclass('public.company_asaas_charges') IS NULL THEN
    v_asaas := 0;
  ELSE
    EXECUTE 'SELECT COUNT(*)::integer FROM public.company_asaas_charges WHERE installment_id = $1'
      INTO v_asaas USING v_receipt;
  END IF;

  SELECT COUNT(*)::integer INTO v_audit
  FROM public.legacy_signal_regularizations
  WHERE sale_id = v_sale;

  SELECT ROUND(total_value * 100)::integer INTO v_sale_total
  FROM public.sales
  WHERE id = v_sale;

  IF v_kept_amount IS DISTINCT FROM 150000
     OR v_paid_after IS DISTINCT FROM v_paid_before
     OR v_paid_after IS DISTINCT FROM '2026-10-24 14:12:49.000000'
     OR lower(v_kept_status) IS DISTINCT FROM 'pago'
     OR v_kept_group IS DISTINCT FROM 'SIGNAL'
     OR v_lot_count IS DISTINCT FROM 120
     OR v_lot_cents IS DISTINCT FROM 7076854
     OR v_signal_count IS DISTINCT FROM 3
     OR v_cash IS DISTINCT FROM 0
     OR v_bank IS DISTINCT FROM 0
     OR v_asaas IS DISTINCT FROM 0
     OR v_audit IS DISTINCT FROM 1
     OR v_sale_total IS DISTINCT FROM 7076854 THEN
    RAISE EXCEPTION
      'HOMOLOG_FAIL valores amount=% paid_at_antes=% paid_at_depois=% tipo=% status=% group=% lot_count=% lot_cents=% signal=% cash=% bank=% asaas=% audit=% sale=% triggers=%',
      v_kept_amount, v_paid_before, v_paid_after, v_paid_formatted, v_kept_status, v_kept_group, v_lot_count, v_lot_cents,
      v_signal_count, v_cash, v_bank, v_asaas, v_audit, v_sale_total, v_triggers;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_receipts
    WHERE sale_id = v_sale
      AND schedule_group = 'SIGNAL'
      AND installment_number > 0
      AND ROUND(amount * 100)::integer NOT IN (66667, 66666)
  ) OR (
    SELECT COUNT(*) FROM public.finance_receipts
    WHERE sale_id = v_sale AND schedule_group = 'SIGNAL' AND ROUND(amount * 100)::integer = 66667
  ) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL parcelas do saldo divergentes';
  END IF;

  v_replay := public.execute_legacy_signal_regularization(
    v_sale, v_user, v_company, 150000, v_installments, v_reason, 'homolog-sinal-1711-a', true
  );
  v_second := public.execute_legacy_signal_regularization(
    v_sale, v_user, v_company, 150000, v_installments, v_reason, 'homolog-sinal-1711-b', true
  );
  SELECT COUNT(*)::integer INTO v_signal_count
  FROM public.finance_receipts
  WHERE sale_id = v_sale AND schedule_group = 'SIGNAL' AND installment_number > 0;
  IF COALESCE(v_replay->>'code', '') IS DISTINCT FROM 'replayed'
     OR COALESCE(v_second->>'code', '') IS DISTINCT FROM 'already_regularized'
     OR v_signal_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL duplicidade replay=% second=% signal=%', v_replay, v_second, v_signal_count;
  END IF;

  PERFORM pg_temp.homolog_insert('contracts', jsonb_strip_nulls(jsonb_build_object(
    'id', v_contract_v2,
    'tenant_id', v_company,
    'company_id', v_company,
    'sale_id', v_sale,
    'customer_id', v_customer,
    'project_id', v_project,
    'block_id', v_block,
    'contract_number', 'HOMOLOG-SINAL-20261117',
    'status', 'ativo',
    'version', 2,
    'is_current', true,
    'needs_regenerar', false,
    'regenerated_from', v_contract,
    'sale_value', 70768.54,
    'down_payment', 3500,
    'installments', 120
  )) || CASE
    WHEN v_html_column IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(v_html_column, 'VERSAO-NOVA-HOMOLOG')
  END);

  IF v_html_column IS NULL THEN
    UPDATE public.contracts
    SET status = 'superseded', is_current = false, superseded_by = v_contract_v2
    WHERE id = v_contract;
  ELSE
    EXECUTE format(
      'UPDATE public.contracts SET status = %L, is_current = false, superseded_by = %L::uuid WHERE id = %L::uuid AND %I = %L',
      'superseded', v_contract_v2, v_contract, v_html_column, 'VERSAO-ANTERIOR-HOMOLOG'
    );
  END IF;

  IF v_html_column IS NULL THEN
    SELECT status INTO v_status_v1 FROM public.contracts WHERE id = v_contract;
    SELECT status, is_current INTO v_status_v2, v_current_v2 FROM public.contracts WHERE id = v_contract_v2;
    v_html_v1 := NULL;
  ELSE
    EXECUTE format('SELECT %I, status FROM public.contracts WHERE id = $1', v_html_column)
      INTO v_html_v1, v_status_v1 USING v_contract;
    EXECUTE format('SELECT status, is_current FROM public.contracts WHERE id = $1')
      INTO v_status_v2, v_current_v2 USING v_contract_v2;
  END IF;

  IF v_status_v1 IS DISTINCT FROM 'superseded'
     OR v_status_v2 IS DISTINCT FROM 'ativo'
     OR v_current_v2 IS DISTINCT FROM true
     OR (v_html_column IS NOT NULL AND v_html_v1 IS DISTINCT FROM 'VERSAO-ANTERIOR-HOMOLOG') THEN
    RAISE EXCEPTION 'HOMOLOG_FAIL contrato v1=% html=% v2=% current=%', v_status_v1, v_html_v1, v_status_v2, v_current_v2;
  END IF;

  v_report := jsonb_build_object(
    'applied', v_result->>'code',
    'receivedCents', v_kept_amount,
    'paidAtPreserved', v_paid_after = '2026-10-24 14:12:49.000000',
    'lotCount', v_lot_count,
    'lotCents', v_lot_cents,
    'signalCount', v_signal_count,
    'cash', v_cash,
    'bank', v_bank,
    'asaas', v_asaas,
    'audit', v_audit,
    'replay', v_replay->>'code',
    'second', v_second->>'code',
    'previousContract', v_status_v1,
    'previousHtmlPreserved', v_html_column IS NULL OR v_html_v1 = 'VERSAO-ANTERIOR-HOMOLOG',
    'newContract', v_status_v2
  );
  RAISE EXCEPTION 'HOMOLOG_ROLLBACK_OK %', v_report;
END;
$homolog$;

-- =============================================================================
-- PASSO 2 — nova consulta, depois do PASSO 1
-- =============================================================================

SELECT
  (SELECT count(*) FROM public.companies WHERE id = 'c1711717-1717-4717-8717-171717171701') AS companies,
  (SELECT count(*) FROM public.sales WHERE id = 'c1711717-1717-4717-8717-171717171706') AS sales,
  (SELECT count(*) FROM public.finance_receipts WHERE sale_id = 'c1711717-1717-4717-8717-171717171706') AS receipts,
  (SELECT count(*) FROM public.contracts WHERE sale_id = 'c1711717-1717-4717-8717-171717171706') AS contracts,
  (SELECT count(*) FROM public.legacy_signal_regularizations WHERE sale_id = 'c1711717-1717-4717-8717-171717171706') AS audits,
  (SELECT count(*) FROM public.cash_movements WHERE sale_id = 'c1711717-1717-4717-8717-171717171706') AS cash;

-- =============================================================================
-- PASSO 3 — somente se o PASSO 2 mostrar alguma quantidade maior que zero
-- =============================================================================

DO $cleanup$
DECLARE
  v_company uuid := 'c1711717-1717-4717-8717-171717171701';
  v_sale uuid := 'c1711717-1717-4717-8717-171717171706';
  v_user uuid := 'c1711717-1717-4717-8717-171717171705';
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.companies WHERE id = v_company;
  IF v_name IS NULL THEN
    RAISE NOTICE 'HOMOLOG_CLEAN_NOTHING';
    RETURN;
  END IF;
  IF v_name IS DISTINCT FROM 'HOMOLOG SINAL FICTICIO 20261117' THEN
    RAISE EXCEPTION 'HOMOLOG_CLEAN_ABORT empresa diferente da ficticia';
  END IF;
  DELETE FROM public.legacy_signal_regularizations WHERE sale_id = v_sale AND tenant_id = v_company;
  DELETE FROM public.cash_movements WHERE sale_id = v_sale AND company_id = v_company;
  DELETE FROM public.finance_receipts WHERE sale_id = v_sale AND tenant_id = v_company;
  DELETE FROM public.contracts WHERE sale_id = v_sale AND tenant_id = v_company;
  DELETE FROM public.sales WHERE id = v_sale AND tenant_id = v_company;
  DELETE FROM public.customers WHERE id = 'c1711717-1717-4717-8717-171717171704' AND tenant_id = v_company;
  DELETE FROM public.blocks WHERE id = 'c1711717-1717-4717-8717-171717171703' AND project_id = 'c1711717-1717-4717-8717-171717171702';
  DELETE FROM public.projects WHERE id = 'c1711717-1717-4717-8717-171717171702' AND tenant_id = v_company;
  DELETE FROM public.users WHERE id = v_user AND email = 'homolog.sinal.ficticio.20261117@svlotes.test';
  IF to_regclass('auth.users') IS NOT NULL THEN
    DELETE FROM auth.users
    WHERE id = v_user
      AND email = 'homolog.sinal.ficticio.20261117@svlotes.test';
  END IF;
  DELETE FROM public.companies WHERE id = v_company AND name = 'HOMOLOG SINAL FICTICIO 20261117';
  RAISE NOTICE 'HOMOLOG_CLEAN_OK';
END;
$cleanup$;
