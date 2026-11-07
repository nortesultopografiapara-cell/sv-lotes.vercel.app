-- Leitura de Production. NÃO EXECUTAR ALTERAÇÃO.
-- Projeto esperado: aezktedncttwpqeunjej.
-- Os UUIDs de Production da Ivanilde e do Recanto ainda não foram confirmados.
-- Por isso este arquivo não cria o gatilho. Não copiar os UUIDs do Develop.

SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'sales' AND column_name IN (
      'signal_schedule_mode', 'signal_installment_count', 'signal_first_due_date',
      'lot_schedule_start_mode', 'lot_schedule_first_due_date',
      'hold_lot_charges_until_signal_settled', 'separate_signal_request_key',
      'sale_create_request_key', 'sale_create_request_fingerprint',
      'tenant_id', 'company_id', 'project_id'
    ))
    OR (table_name = 'finance_receipts' AND column_name = 'schedule_group')
  )
ORDER BY table_name, column_name;

SELECT conname
FROM pg_constraint
WHERE conrelid IN ('public.sales'::regclass, 'public.finance_receipts'::regclass)
  AND conname IN (
    'sales_signal_schedule_mode_check',
    'sales_lot_schedule_start_mode_check',
    'sales_separate_signal_without_embedded_mode_check',
    'finance_receipts_schedule_group_check',
    'finance_receipts_separate_lot_without_signal_addon_check',
    'finance_receipts_separate_signal_without_addon_check'
  )
ORDER BY conname;

SELECT ic.relname, ix.indisvalid
FROM pg_index ix
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_namespace ns ON ns.oid = tc.relnamespace
WHERE ns.nspname = 'public'
  AND ic.relname IN (
    'finance_receipts_sale_group_installment_uidx',
    'sales_separate_signal_request_key_uidx',
    'sales_create_request_key_uidx',
    'cash_movements_sale_create_receipt_uidx',
    'contracts_one_current_per_sale_uidx'
  )
ORDER BY ic.relname;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated,
       has_function_privilege('anon', p.oid, 'execute') AS anon
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_sale_financial_core',
    'sale_financial_core_fingerprint',
    'reject_unlisted_separate_signal'
  );

SELECT
  (SELECT count(*) FROM (
    SELECT 1 FROM public.contracts
    WHERE is_current IS TRUE AND sale_id IS NOT NULL
    GROUP BY tenant_id, sale_id
    HAVING count(*) > 1
  ) d) AS duplicate_current_contracts,
  (SELECT count(*) FROM (
    SELECT 1 FROM public.cash_movements
    WHERE status = 'ativo'
      AND coalesce(metadata->>'provider', '') = 'SALE_CREATE'
      AND coalesce(metadata->>'installment_id', '') <> ''
    GROUP BY tenant_id, company_id, metadata->>'installment_id'
    HAVING count(*) > 1
  ) d) AS duplicate_sale_create_cash;

SELECT id, name, tenant_id, company_id
FROM public.companies
WHERE name ILIKE '%Ivanilde%';

SELECT id, name, tenant_id, company_id
FROM public.projects
WHERE name ILIKE '%RECANTO PRIMAVERA%';
