-- SV LOTES — proposta SEG-2A. NÃO APLICADA.
-- Fora de supabase/migrations de propósito. Não executar nesta fase.
-- Alvo futuro, só com autorização expressa: Supabase Develop hoynysmynxncdlptuzub.
-- Production não foi auditado e não é alvo.
-- Não apaga parcelas, não faz backfill e não restaura policy aberta.
--
-- Leitura e escrita usam o mesmo predicado. Uma parcela com tenant_id de uma
-- empresa e company_id de outra não fica visível para nenhuma das duas.
-- SUPER_ADMIN da aplicação, pela função is_super_admin(), continua vendo todas.
-- No Develop, finance_receipts não tem as policies restritivas do OWNER.
-- Esta transação as cria só nesta tabela. Não apaga as de outras tabelas.
-- users.company_id não existe. current_tenant_id() passa a ler só tenant_id.
--
-- Se qualquer verificação final falhar, a transação inteira desfaz o que ainda
-- não foi confirmado. Isso não é o procedimento de contingência de uma mudança
-- já confirmada.

BEGIN;

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  current_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO current_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'current_tenant_id'
    AND p.pronargs = 0;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'SEG2A_CURRENT_TENANT_MISSING';
  END IF;

  IF position('company_id' in current_def) > 0 THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT tenant_id
        FROM public.users
        WHERE id = auth.uid();
      $body$
    $fn$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_owner_readonly_user() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND upper(trim(coalesce(role, ''))) = 'OWNER'
  );
$$;

DROP POLICY IF EXISTS "Allow select finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow insert finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow update finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow delete finance_receipts for authenticated users" ON public.finance_receipts;
DROP POLICY IF EXISTS finance_receipts_select_by_tenant ON public.finance_receipts;
DROP POLICY IF EXISTS finance_receipts_insert_by_tenant ON public.finance_receipts;
DROP POLICY IF EXISTS finance_receipts_update_by_tenant ON public.finance_receipts;

DROP POLICY IF EXISTS "tenant_isolation_finance_receipts" ON public.finance_receipts;

CREATE POLICY "tenant_isolation_finance_receipts"
  ON public.finance_receipts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.current_tenant_id() IS NOT NULL
      AND (tenant_id IS NULL OR tenant_id = public.current_tenant_id())
      AND (company_id IS NULL OR company_id = public.current_tenant_id())
      AND (
        tenant_id = public.current_tenant_id()
        OR company_id = public.current_tenant_id()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.current_tenant_id() IS NOT NULL
      AND (tenant_id IS NULL OR tenant_id = public.current_tenant_id())
      AND (company_id IS NULL OR company_id = public.current_tenant_id())
      AND (
        tenant_id = public.current_tenant_id()
        OR company_id = public.current_tenant_id()
      )
    )
  );

REVOKE ALL ON TABLE public.finance_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_receipts FROM anon;
REVOKE ALL ON TABLE public.finance_receipts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_receipts TO authenticated;

COMMENT ON POLICY "tenant_isolation_finance_receipts" ON public.finance_receipts IS
  'Isola parcelas pela empresa da sessão. SUPER_ADMIN da aplicação continua vendo todas.';

DROP POLICY IF EXISTS owner_readonly_no_insert ON public.finance_receipts;
CREATE POLICY owner_readonly_no_insert
  ON public.finance_receipts
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.is_owner_readonly_user());

DROP POLICY IF EXISTS owner_readonly_no_update ON public.finance_receipts;
CREATE POLICY owner_readonly_no_update
  ON public.finance_receipts
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.is_owner_readonly_user())
  WITH CHECK (NOT public.is_owner_readonly_user());

DROP POLICY IF EXISTS owner_readonly_no_delete ON public.finance_receipts;
CREATE POLICY owner_readonly_no_delete
  ON public.finance_receipts
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.is_owner_readonly_user());

DO $$
DECLARE
  rls_on boolean;
  unexpected text;
BEGIN
  SELECT c.relrowsecurity
    INTO rls_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'finance_receipts';

  IF rls_on IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SEG2A_RLS_DISABLED';
  END IF;

  SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname)
    INTO unexpected
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'finance_receipts'
    AND pol.polname NOT IN (
      'tenant_isolation_finance_receipts',
      'owner_readonly_no_insert',
      'owner_readonly_no_update',
      'owner_readonly_no_delete'
    );

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'SEG2A_UNEXPECTED_POLICY: %', unexpected;
  END IF;

  IF has_table_privilege('anon', 'public.finance_receipts', 'SELECT')
     OR has_table_privilege('anon', 'public.finance_receipts', 'INSERT')
     OR has_table_privilege('anon', 'public.finance_receipts', 'UPDATE')
     OR has_table_privilege('anon', 'public.finance_receipts', 'DELETE')
     OR has_table_privilege('anon', 'public.finance_receipts', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SEG2A_ANON_PRIVILEGE';
  END IF;

  IF has_table_privilege('authenticated', 'public.finance_receipts', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SEG2A_AUTHENTICATED_TRUNCATE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.finance_receipts', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.finance_receipts', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.finance_receipts', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.finance_receipts', 'DELETE') THEN
    RAISE EXCEPTION 'SEG2A_AUTHENTICATED_DML_MISSING';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.finance_receipts', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.finance_receipts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.finance_receipts', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.finance_receipts', 'DELETE') THEN
    RAISE EXCEPTION 'SEG2A_SERVICE_ROLE_DML_MISSING';
  END IF;
END $$;

COMMIT;
