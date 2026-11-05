-- SV LOTES — inventário SEG-2A. Somente leitura.
-- Não aplicar a proposta de lockdown com este arquivo.
-- Executar no futuro apenas no Supabase Develop hoynysmynxncdlptuzub.
-- Production não é alvo. Não imprime nome, documento, e-mail nem telefone.
-- BEGIN READ ONLY faz o próprio PostgreSQL recusar escrita, mudança de estrutura e privilégio.

BEGIN READ ONLY;

SELECT current_setting('server_version') AS server_version;

SELECT c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'finance_receipts';

SELECT pol.polname AS policy_name,
       pol.polpermissive AS permissive,
       pol.polcmd AS command,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression,
       pol.polroles::regrole[] AS roles
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'finance_receipts'
ORDER BY pol.polname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'finance_receipts'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY grantee, privilege_type;

SELECT p.proname AS function_name,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_tenant_id',
    'is_super_admin',
    'is_owner_readonly_user',
    'execute_authorized_manual_receipt_payment',
    'execute_sale_lot_swap',
    'execute_sale_title_transfer'
  )
ORDER BY p.proname;

SELECT count(*) AS receipts_total,
       count(*) FILTER (WHERE tenant_id IS NOT NULL) AS with_tenant_id,
       count(*) FILTER (WHERE tenant_id IS NULL AND company_id IS NOT NULL) AS company_id_only,
       count(*) FILTER (WHERE tenant_id IS NULL AND company_id IS NULL) AS neither_company_key,
       count(*) FILTER (
         WHERE tenant_id IS NOT NULL
           AND company_id IS NOT NULL
           AND tenant_id IS DISTINCT FROM company_id
       ) AS tenant_differs_from_company
FROM public.finance_receipts;

SELECT count(*) AS receipt_sale_company_mismatch
FROM public.finance_receipts fr
JOIN public.sales s ON s.id = fr.sale_id
WHERE COALESCE(fr.tenant_id, fr.company_id) IS NOT NULL
  AND COALESCE(s.tenant_id, s.company_id) IS NOT NULL
  AND COALESCE(fr.tenant_id, fr.company_id) IS DISTINCT FROM COALESCE(s.tenant_id, s.company_id);

SELECT count(*) AS blocks_without_tenant
FROM public.blocks
WHERE tenant_id IS NULL;

ROLLBACK;
