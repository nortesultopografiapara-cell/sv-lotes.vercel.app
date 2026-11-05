-- Inventário SEG-2B de public.users. Somente leitura.
-- Alvo futuro: Supabase Develop hoynysmynxncdlptuzub.
-- Production não é alvo. Não imprime nome, e-mail nem telefone.

BEGIN READ ONLY;

SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'users';

SELECT pol.polname AS policy_name,
       pol.polpermissive AS permissive,
       pol.polcmd AS command,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'users'
ORDER BY pol.polname;

SELECT event_object_table AS table_name,
       trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'users'
ORDER BY trigger_name;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY grantee, privilege_type;

SELECT count(*) AS users_total,
       count(*) FILTER (WHERE upper(coalesce(role, '')) IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER')) AS platform_admins,
       count(*) FILTER (WHERE upper(coalesce(role, '')) = 'OWNER') AS owners,
       count(*) FILTER (WHERE tenant_id IS NULL) AS without_tenant
FROM public.users;

ROLLBACK;
