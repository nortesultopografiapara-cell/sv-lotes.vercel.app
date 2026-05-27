-- Reforça RLS após ativação global: tenant via users + super admin vê tudo.
-- Execute no Supabase SQL Editor se migrations não rodarem automaticamente.

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid AS $$
  SELECT COALESCE(tenant_id, company_id)
  FROM public.users
  WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROJECTS (substitui policy permissiva com `true`)
DROP POLICY IF EXISTS "tenant_isolation_projects" ON public.projects;
DROP POLICY IF EXISTS "Tenant isolation para projetos" ON public.projects;
CREATE POLICY "tenant_isolation_projects" ON public.projects
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

-- BLOCKS
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_blocks" ON public.blocks;
CREATE POLICY "tenant_isolation_blocks" ON public.blocks
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

-- SALES
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_sales" ON public.sales;
DROP POLICY IF EXISTS "Tenant isolation para sales" ON public.sales;
CREATE POLICY "tenant_isolation_sales" ON public.sales
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

-- CASH_MOVEMENTS
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_cash_movements" ON public.cash_movements;
CREATE POLICY "tenant_isolation_cash_movements" ON public.cash_movements
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

-- BROKER_COMMISSIONS
ALTER TABLE public.broker_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_broker_commissions" ON public.broker_commissions;
CREATE POLICY "tenant_isolation_broker_commissions" ON public.broker_commissions
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
