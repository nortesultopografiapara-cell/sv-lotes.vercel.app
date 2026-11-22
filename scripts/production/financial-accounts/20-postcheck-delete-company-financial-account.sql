-- Conferência somente leitura depois da migration. Não chama a função e não apaga contas.

SELECT
  (SELECT count(*) FROM public.company_financial_accounts) AS contas,
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig,
  r.rolname AS owner,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_executa,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_roles AS r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'delete_company_financial_account';

SELECT tgname, c.relname AS tabela, t.tgtype
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_cash_movements_financial_account_lock',
    'trg_split_snapshot_financial_account_lock',
    'trg_c6_boleto_reservations_financial_account_lock',
    'trg_company_financial_accounts_reject_direct_delete'
  )
ORDER BY t.tgname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'company_financial_accounts'
  AND privilege_type = 'DELETE'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
