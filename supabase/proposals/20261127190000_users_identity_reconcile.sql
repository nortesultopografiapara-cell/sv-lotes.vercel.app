-- Reconciliação da proteção já instalada. NÃO APLICAR nesta etapa.
-- Fora de supabase/migrations. Não faz parte do runner.
-- Não recria policy, não mexe em GRANT e não toca finance_receipts.
-- Objetos equivalentes e habilitados: NOTICE e retorno, sem substituir.
-- Função sem trigger, trigger divergente, trigger desabilitado ou função
-- divergente: EXCEPTION e retorno, sem CREATE OR REPLACE.
-- Banco sem os dois objetos: instala o corpo dos commits 52841536 e
-- 013e23a3, com search_path = public. O search_path public, auth já
-- instalado em Production é aceito como equivalente e não é alterado.

DO $reconcile$
DECLARE
  fn_count integer;
  fn_def text;
  trg_count integer;
  trg_enabled "char";
  trg_def text;
  missing text[] := ARRAY[]::text[];
BEGIN
  SELECT count(*), max(pg_get_functiondef(p.oid))
    INTO fn_count, fn_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'users_protect_identity_columns';

  SELECT count(*), max(t.tgenabled), max(pg_get_triggerdef(t.oid, true))
    INTO trg_count, trg_enabled, trg_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND t.tgname = 'users_protect_identity_columns'
    AND NOT t.tgisinternal;

  IF fn_count > 1 OR trg_count > 1 THEN
    RAISE EXCEPTION 'users_identity_reconcile_ambiguous'
      USING DETAIL = format('funcoes=%s triggers=%s', fn_count, trg_count);
  END IF;

  IF fn_count = 1 OR trg_count = 1 THEN
    IF fn_count = 0 THEN
      RAISE EXCEPTION 'users_identity_reconcile_trigger_without_function'
        USING DETAIL = trg_def;
    END IF;
    IF trg_count = 0 THEN
      RAISE EXCEPTION 'users_identity_reconcile_function_without_trigger'
        USING DETAIL = left(fn_def, 240);
    END IF;
    IF trg_enabled IS DISTINCT FROM 'O' THEN
      RAISE EXCEPTION 'users_identity_reconcile_trigger_disabled'
        USING DETAIL = format('tgenabled=%s', trg_enabled);
    END IF;
    IF fn_def !~* 'SECURITY DEFINER' THEN
      missing := missing || 'security_definer';
    END IF;
    IF fn_def !~* 'search_path[[:space:]]*(=|TO)[[:space:]]*''?public''?([[:space:]]*,[[:space:]]*''?auth''?)?[^,;]*' THEN
      missing := missing || 'search_path';
    END IF;
    IF fn_def ~* 'search_path[^;]*pg_catalog|search_path[^;]*extensions' THEN
      missing := missing || 'search_path_extra';
    END IF;
    IF fn_def !~ 'USERS_IDENTITY:ANON_DENIED' THEN missing := missing || 'ANON_DENIED'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:INSERT_DENIED' THEN missing := missing || 'INSERT_DENIED'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:ROLE_DENIED' THEN missing := missing || 'ROLE_DENIED'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:TENANT_DENIED' THEN missing := missing || 'TENANT_DENIED'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:ID_DENIED' THEN missing := missing || 'ID_DENIED'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:OTHER_USER' THEN missing := missing || 'OTHER_USER'; END IF;
    IF fn_def !~ 'USERS_IDENTITY:SELF_ROLE' THEN missing := missing || 'SELF_ROLE'; END IF;
    IF cardinality(missing) > 0 THEN
      RAISE EXCEPTION 'users_identity_reconcile_function_diverged'
        USING DETAIL = array_to_string(missing, ',');
    END IF;
    IF trg_def !~* 'BEFORE INSERT OR UPDATE ON public\.users'
       OR trg_def !~* 'FOR EACH ROW'
       OR trg_def !~* 'EXECUTE (PROCEDURE|FUNCTION) public\.users_protect_identity_columns\(\)' THEN
      RAISE EXCEPTION 'users_identity_reconcile_trigger_diverged'
        USING DETAIL = trg_def;
    END IF;
    RAISE NOTICE 'users_identity_reconcile_equivalent';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  ) THEN
    RAISE EXCEPTION 'users_identity_reconcile_missing_dependency' USING DETAIL = 'public.is_super_admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_tenant_admin'
  ) THEN
    RAISE EXCEPTION 'users_identity_reconcile_missing_dependency' USING DETAIL = 'public.is_tenant_admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id'
  ) THEN
    RAISE EXCEPTION 'users_identity_reconcile_missing_dependency' USING DETAIL = 'public.current_tenant_id';
  END IF;

  EXECUTE $fn$
CREATE FUNCTION public.users_protect_identity_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  jwt_role text;
  actor uuid;
  actor_tenant uuid;
  new_role text;
  old_role text;
  old_company text;
  new_company text;
  has_company boolean;
BEGIN
  jwt_role := COALESCE(auth.role(), '');
  IF jwt_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF jwt_role = 'anon' THEN
    RAISE EXCEPTION 'USERS_IDENTITY:ANON_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  actor := auth.uid();
  actor_tenant := public.current_tenant_id();
  new_role := UPPER(TRIM(COALESCE(NEW.role, '')));
  has_company := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'company_id'
  );

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_tenant_admin() THEN
      RAISE EXCEPTION 'USERS_IDENTITY:INSERT_DENIED' USING ERRCODE = '42501';
    END IF;
    IF new_role IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER', 'OWNER') THEN
      RAISE EXCEPTION 'USERS_IDENTITY:ROLE_DENIED' USING ERRCODE = '42501';
    END IF;
    IF actor_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM actor_tenant THEN
      RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
    END IF;
    IF has_company THEN
      new_company := to_jsonb(NEW)->>'company_id';
      IF new_company IS NOT NULL AND new_company <> '' AND new_company::uuid IS DISTINCT FROM actor_tenant THEN
        RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  old_role := UPPER(TRIM(COALESCE(OLD.role, '')));
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'USERS_IDENTITY:ID_DENIED' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM actor AND NOT public.is_tenant_admin() THEN
    RAISE EXCEPTION 'USERS_IDENTITY:OTHER_USER' USING ERRCODE = '42501';
  END IF;

  IF new_role IS DISTINCT FROM old_role THEN
    IF NEW.id = actor THEN
      RAISE EXCEPTION 'USERS_IDENTITY:SELF_ROLE' USING ERRCODE = '42501';
    END IF;
    IF new_role IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER', 'OWNER') THEN
      RAISE EXCEPTION 'USERS_IDENTITY:ROLE_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF NEW.id = actor OR NOT public.is_tenant_admin() THEN
      RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
    END IF;
    IF actor_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM actor_tenant THEN
      RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF has_company THEN
    old_company := to_jsonb(OLD)->>'company_id';
    new_company := to_jsonb(NEW)->>'company_id';
    IF new_company IS DISTINCT FROM old_company THEN
      IF NEW.id = actor OR NOT public.is_tenant_admin() THEN
        RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
      END IF;
      IF new_company IS NOT NULL AND new_company::uuid IS DISTINCT FROM actor_tenant THEN
        RAISE EXCEPTION 'USERS_IDENTITY:TENANT_DENIED' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$body$;
  $fn$;

  EXECUTE $tr$
CREATE TRIGGER users_protect_identity_columns
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.users_protect_identity_columns();
  $tr$;
END
$reconcile$;
