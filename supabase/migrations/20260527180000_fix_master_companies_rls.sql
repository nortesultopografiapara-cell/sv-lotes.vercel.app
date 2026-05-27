-- Master: SUPER_ADMIN vê todas as companies; demais usuários só a própria tenant.

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND UPPER(COALESCE(role, '')) IN (
        'SUPER_ADMIN',
        'MASTER-ADMIN',
        'MASTER_ADMIN',
        'SUPER_MASTER'
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid AS $$
  SELECT COALESCE(tenant_id, company_id)
  FROM public.users
  WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todas as empresas para SUPER_ADMIN" ON public.companies;
DROP POLICY IF EXISTS "Empresa visível para seu ADMIN" ON public.companies;
DROP POLICY IF EXISTS "tenant_isolation_companies" ON public.companies;
DROP POLICY IF EXISTS "master_companies_access" ON public.companies;

CREATE POLICY "master_companies_access" ON public.companies
  FOR ALL
  USING (
    public.is_super_admin()
    OR id = public.current_tenant_id()
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR id = public.current_tenant_id()
    OR tenant_id = public.current_tenant_id()
  );

NOTIFY pgrst, 'reload schema';
