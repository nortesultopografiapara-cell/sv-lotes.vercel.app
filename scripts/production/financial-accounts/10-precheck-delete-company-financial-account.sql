-- Pré-check somente leitura. Não altera dados.
-- schema_ok exige cada coluna listada. Não usa uma contagem fixa.

WITH required(table_name, column_name) AS (
  VALUES
    ('company_financial_accounts'::text, 'id'::text),
    ('company_financial_accounts', 'company_id'),
    ('company_financial_accounts', 'bank_integration_id'),
    ('company_financial_accounts', 'updated_at'),
    ('finance_receipts', 'financial_account_id'),
    ('finance_receipts', 'company_id'),
    ('finance_receipts', 'tenant_id'),
    ('cash_movements', 'company_id'),
    ('cash_movements', 'tenant_id'),
    ('cash_movements', 'metadata'),
    ('company_asaas_charges', 'financial_account_id'),
    ('company_asaas_charges', 'company_id'),
    ('bank_charges', 'financial_account_id'),
    ('bank_charges', 'company_id'),
    ('sales', 'financial_account_id'),
    ('sales', 'tenant_id'),
    ('projects', 'financial_account_id'),
    ('projects', 'tenant_id'),
    ('project_revenue_split_participants', 'financial_account_id'),
    ('project_revenue_split_participants', 'company_id'),
    ('sale_revenue_split_snapshot_participants', 'financial_account_id'),
    ('sale_revenue_split_snapshot_participants', 'company_id'),
    ('sale_revenue_split_snapshot_participants', 'snapshot_id'),
    ('sale_revenue_split_snapshots', 'company_id'),
    ('financial_account_provider_destinations', 'financial_account_id'),
    ('financial_account_provider_destinations', 'company_id'),
    ('bank_integrations', 'company_id'),
    ('bank_integrations', 'active'),
    ('bank_integrations', 'status'),
    ('bank_integrations', 'metadata'),
    ('bank_credentials', 'integration_id'),
    ('c6_boleto_reservations', 'integration_id'),
    ('c6_boleto_reservations', 'company_id')
),
missing AS (
  SELECT required.table_name, required.column_name
  FROM required
  LEFT JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
   AND columns.table_name = required.table_name
   AND columns.column_name = required.column_name
  WHERE columns.column_name IS NULL
)
SELECT
  (SELECT count(*) FROM public.company_financial_accounts) AS contas,
  (SELECT count(*) FROM required) AS colunas_exigidas,
  (SELECT count(*) FROM missing) AS colunas_ausentes,
  (SELECT count(*) = 0 FROM missing) AS schema_ok,
  coalesce((
    SELECT string_agg(table_name || '.' || column_name, ', ' ORDER BY table_name, column_name)
    FROM missing
  ), '') AS colunas_faltantes,
  (
    SELECT count(*)
    FROM public.cash_movements
    WHERE nullif(btrim(metadata->>'financial_account_id'), '') IS NOT NULL
      AND btrim(metadata->>'financial_account_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) AS metadata_invalida,
  to_regprocedure('public.delete_company_financial_account(uuid,uuid,timestamptz)') IS NULL AS funcao_ausente;
