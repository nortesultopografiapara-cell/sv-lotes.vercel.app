-- SV LOTES — proposta SEG-2B. NÃO APLICADA.
-- Fora de supabase/migrations. Não executar nesta fase.
-- Alvo futuro: Supabase Develop hoynysmynxncdlptuzub.
-- Production não é alvo.
-- Não apaga usuários e não recria policy aberta.
-- service_role continua livre neste trigger: as APIs autenticam a sessão antes.
-- SUPER_ADMIN da aplicação continua podendo limpar o próprio tenant_id
-- ao sair do modo empresa.

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;

DROP POLICY IF EXISTS "Usuário vê a si próprio" ON public.users;
CREATE POLICY "Usuário vê a si próprio"
  ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Todos os usuários para SUPER_ADMIN" ON public.users;
CREATE POLICY "Todos os usuários para SUPER_ADMIN"
  ON public.users
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.users_protect_identity_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS users_protect_identity_columns ON public.users;
CREATE TRIGGER users_protect_identity_columns
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.users_protect_identity_columns();

REVOKE ALL ON TABLE public.users FROM PUBLIC;
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;

DO $$
DECLARE
  rls_on boolean;
  unexpected text;
BEGIN
  SELECT c.relrowsecurity INTO rls_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users';

  IF rls_on IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SEG2B_RLS_DISABLED';
  END IF;

  SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO unexpected
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'users'
    AND pol.polname NOT IN (
      'Usuário atualiza próprio perfil',
      'Tenant admin gerencia usuários locais',
      'Usuário vê a si próprio',
      'Todos os usuários para SUPER_ADMIN',
      'tenant_isolation_users'
    );

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'SEG2B_UNEXPECTED_POLICY: %', unexpected;
  END IF;

  IF has_table_privilege('anon', 'public.users', 'SELECT')
     OR has_table_privilege('anon', 'public.users', 'INSERT')
     OR has_table_privilege('anon', 'public.users', 'UPDATE')
     OR has_table_privilege('anon', 'public.users', 'DELETE')
     OR has_table_privilege('anon', 'public.users', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SEG2B_ANON_PRIVILEGE';
  END IF;

  IF has_table_privilege('authenticated', 'public.users', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SEG2B_AUTHENTICATED_TRUNCATE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.users', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.users', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.users', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.users', 'DELETE') THEN
    RAISE EXCEPTION 'SEG2B_AUTHENTICATED_DML_MISSING';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.users', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.users', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'SEG2B_SERVICE_ROLE_DML_MISSING';
  END IF;
END $$;

COMMIT;
