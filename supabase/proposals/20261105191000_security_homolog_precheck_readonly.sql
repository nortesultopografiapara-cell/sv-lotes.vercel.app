-- Inventário SEG-2C. Somente leitura.
-- Alvo futuro: Supabase Develop hoynysmynxncdlptuzub.
-- Production não é alvo.
-- Não imprime nome, documento, e-mail nem telefone.
-- A transação somente leitura recusa mudança de dado, estrutura e privilégio.
-- Confirmar na barra do SQL Editor que o projeto é hoynysmynxncdlptuzub
-- antes de ler o resultado. current_database() não traz a referência do projeto.

BEGIN READ ONLY;

SELECT current_database() AS database_name,
       current_user AS session_user,
       current_setting('server_version') AS server_version;

SELECT c.relname AS table_name,
       c.reltuples::bigint AS planner_estimate,
       c.relrowsecurity AS rls_enabled,
       c.relacl::text AS granted_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('users', 'finance_receipts');

SELECT relname,
       n_live_tup,
       n_dead_tup,
       n_tup_ins,
       n_tup_upd,
       n_tup_del,
       last_vacuum,
       last_autovacuum,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN (
    'users',
    'finance_receipts',
    'payments',
    'cash_movements',
    'sales',
    'sale_balloon_installments'
  )
ORDER BY relname;

SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup >= 10000
ORDER BY n_live_tup DESC;

SELECT cls.relname AS table_name,
       pol.polname AS policy_name,
       pol.polpermissive AS permissive,
       pol.polcmd AS command,
       pol.polroles::regrole[] AS roles,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname IN ('users', 'finance_receipts')
ORDER BY cls.relname, pol.polname;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'finance_receipts' AND column_name IN (
      'tenant_id', 'company_id', 'sale_id', 'installment_group', 'deleted_at', 'status'
    ))
    OR (table_name = 'users' AND column_name IN ('tenant_id', 'company_id', 'role', 'status'))
  )
ORDER BY table_name, column_name;

SELECT count(*) AS users_total,
       count(*) FILTER (
         WHERE upper(coalesce(role, '')) IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER')
       ) AS platform_admins,
       count(*) FILTER (WHERE upper(coalesce(role, '')) = 'OWNER') AS owners,
       count(*) FILTER (WHERE tenant_id IS NULL) AS without_tenant,
       count(*) FILTER (
         WHERE tenant_id IS NULL
           AND upper(coalesce(role, '')) IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER')
       ) AS platform_without_tenant,
       count(*) FILTER (
         WHERE tenant_id IS NULL
           AND upper(coalesce(role, '')) NOT IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER')
       ) AS other_without_tenant
FROM public.users;

SELECT count(*) AS receipts_exact
FROM public.finance_receipts;

DO $$
DECLARE
  legacy_null bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'finance_receipts'
      AND column_name = 'installment_group'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.finance_receipts WHERE installment_group IS NULL'
      INTO legacy_null;
    RAISE NOTICE 'installment_group_null=%', legacy_null;
  ELSE
    RAISE NOTICE 'installment_group_absent';
  END IF;
END $$;

ROLLBACK;
