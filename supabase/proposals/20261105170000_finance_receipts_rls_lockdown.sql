-- SV LOTES — proposta SEG-2A. NÃO APLICADA.
-- Fora de supabase/migrations de propósito. Não executar nesta fase.
-- Alvo futuro, só com autorização expressa: Supabase Develop hoynysmynxncdlptuzub.
-- Production não foi auditado e não é alvo.
-- Não apaga parcelas, não faz backfill e não restaura policy aberta.
--
-- Leitura e escrita usam o mesmo predicado. Uma parcela com tenant_id de uma
-- empresa e company_id de outra não fica visível para nenhuma das duas.
-- SUPER_ADMIN da aplicação, pela função is_super_admin(), continua vendo todas.
-- OWNER permanece nas policies restritivas já existentes; este arquivo não as apaga.
--
-- Se qualquer verificação final falhar, a transação inteira desfaz o que ainda
-- não foi confirmado. Isso não é o procedimento de contingência de uma mudança
-- já confirmada.

BEGIN;

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow insert finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow update finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow delete finance_receipts for authenticated users" ON public.finance_receipts;

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
