-- SV LOTES — proposta SEG-1. NÃO APLICADA.
-- Este arquivo está fora de supabase/migrations de propósito.
-- Não executar no Develop nem em Production nesta fase.
-- Alvo futuro, só depois de autorização expressa: Supabase Develop hoynysmynxncdlptuzub.
-- Production aezktedncttwpqeunjej não foi auditado e não é alvo desta proposta.
-- Não contém senha, token nem connection string.
-- Não apaga parcelas, não faz backfill e não reescreve o histórico de migrations.

BEGIN;

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;

-- Policies permissivas confirmadas por consulta manual no Develop.
-- Policies permissivas da mesma operação se combinam com OR, então uma
-- expressão sempre verdadeira anula o isolamento por empresa.
-- O DROP é idempotente se Production não as tiver.
DROP POLICY IF EXISTS "Allow select finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow insert finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow update finance_receipts" ON public.finance_receipts;
DROP POLICY IF EXISTS "Allow delete finance_receipts for authenticated users" ON public.finance_receipts;

-- Recria só a policy de isolamento. As policies restritivas owner_readonly_*
-- criadas em 20260716120000_owner_readonly_rls.sql permanecem.
DROP POLICY IF EXISTS "tenant_isolation_finance_receipts" ON public.finance_receipts;

CREATE POLICY "tenant_isolation_finance_receipts"
  ON public.finance_receipts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR tenant_id = public.current_tenant_id()
    OR company_id = public.current_tenant_id()
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

-- TRUNCATE não passa por RLS. anon e authenticated perdem qualquer privilégio
-- amplo herdado do schema public. authenticated recebe só DML, sem TRUNCATE.
-- service_role não é revogado: webhooks Asaas/Inter e a baixa manual usam esse papel,
-- que já ignora RLS por BYPASSRLS.
REVOKE ALL ON TABLE public.finance_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_receipts FROM anon;
REVOKE ALL ON TABLE public.finance_receipts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_receipts TO authenticated;

COMMENT ON POLICY "tenant_isolation_finance_receipts" ON public.finance_receipts IS
  'Isola parcelas pela empresa da sessão. SUPER_ADMIN da aplicação continua vendo todas.';

COMMIT;
