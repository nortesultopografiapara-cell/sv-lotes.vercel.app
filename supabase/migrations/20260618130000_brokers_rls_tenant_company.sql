-- Alinha RLS de brokers com sales/broker_commissions (tenant_id OU company_id).

DROP POLICY IF EXISTS "tenant_isolation_brokers" ON public.brokers;
DROP POLICY IF EXISTS "company_manage_brokers" ON public.brokers;
DROP POLICY IF EXISTS "super_admin_manage_brokers" ON public.brokers;

CREATE POLICY "tenant_isolation_brokers" ON public.brokers
  FOR ALL
  USING (
    public.is_super_admin()
    OR tenant_id = public.current_tenant_id()
    OR company_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR tenant_id = public.current_tenant_id()
    OR company_id = public.current_tenant_id()
  );

NOTIFY pgrst, 'reload schema';
