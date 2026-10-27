-- =============================================================================
-- C6 homolog — DIAGNÓSTICO de GRANT EXECUTE (somente leitura)
-- Executar PRIMEIRO no SQL Editor do Supabase Develop: hoynysmynxncdlptuzub
-- NÃO executar em Production (aezktedncttwpqeunjej).
-- Sem INSERT/UPDATE/DELETE. Sem emissão. Sem outras funções.
-- =============================================================================

SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.prosecdef AS security_definer,
  (p.proacl IS NULL) AS default_acl_public_execute,
  EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a
    WHERE a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) AS public_execute,
  has_function_privilege('anon'::regrole, p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE') AS service_role_execute,
  CASE
    WHEN has_function_privilege('anon'::regrole, p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a
        WHERE a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
      )
      THEN 'INDEVIDO'
    WHEN NOT has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE')
      THEN 'FALTA_SERVICE_ROLE'
    ELSE 'OK'
  END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reserve_c6_homolog_idempotency',
    'mark_c6_homolog_idempotency_processing',
    'complete_c6_homolog_idempotency',
    'reconcile_c6_homolog_idempotency'
  )
ORDER BY p.proname, identity_args;

-- ACL detalhada (grantee 0 = PUBLIC)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a ON true
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reserve_c6_homolog_idempotency',
    'mark_c6_homolog_idempotency_processing',
    'complete_c6_homolog_idempotency',
    'reconcile_c6_homolog_idempotency'
  )
ORDER BY p.proname, identity_args, grantee;
