-- Proteção complementar de DELETE. NÃO EXECUTAR nesta etapa.
-- Fora de supabase/migrations. Não altera a função users_protect_identity_columns
-- já instalada. Não cobre finance_receipts e não muda policies ou grants.
-- authenticated não apaga SUPER_ADMIN. service_role e postgres seguem o mesmo
-- desvio da função já instalada, porque as APIs administrativas usam esse papel
-- depois da autorização. Ausência de linha continua inconclusiva.

DO $delete_guard$
DECLARE
  trg_count integer;
  trg_enabled "char";
  trg_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_tenant_admin'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id'
  ) THEN
    RAISE EXCEPTION 'users_identity_delete_missing_dependency';
  END IF;

  SELECT count(*), max(t.tgenabled), max(pg_get_triggerdef(t.oid, true))
    INTO trg_count, trg_enabled, trg_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND t.tgname = 'users_protect_identity_delete'
    AND NOT t.tgisinternal;

  IF trg_count > 1 THEN
    RAISE EXCEPTION 'users_identity_delete_ambiguous';
  END IF;
  IF trg_count = 1 THEN
    IF trg_enabled IS DISTINCT FROM 'O'
       OR trg_def !~* 'BEFORE DELETE ON public\.users'
       OR trg_def !~* 'EXECUTE (PROCEDURE|FUNCTION) public\.users_protect_identity_delete\(\)' THEN
      RAISE EXCEPTION 'users_identity_delete_diverged' USING DETAIL = trg_def;
    END IF;
    RAISE NOTICE 'users_identity_delete_equivalent';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE FUNCTION public.users_protect_identity_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  IF jwt_role IS NULL THEN
    jwt_role := auth.role();
  END IF;
  IF jwt_role IS DISTINCT FROM 'authenticated' AND jwt_role IS DISTINCT FROM 'anon' THEN
    RETURN OLD;
  END IF;
  IF UPPER(COALESCE(OLD.role, '')) = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'USERS_IDENTITY:DELETE_PROTECTED' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin() THEN
    RETURN OLD;
  END IF;
  IF public.is_tenant_admin() AND OLD.tenant_id IS NOT DISTINCT FROM public.current_tenant_id() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'USERS_IDENTITY:DELETE_DENIED' USING ERRCODE = '42501';
END;
$body$;
  $fn$;

  EXECUTE $tr$
CREATE TRIGGER users_protect_identity_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.users_protect_identity_delete();
  $tr$;
END
$delete_guard$;
