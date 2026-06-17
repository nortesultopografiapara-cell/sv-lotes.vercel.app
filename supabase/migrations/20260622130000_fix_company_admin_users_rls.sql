-- Hotfix RLS: admins da empresa sem subquery recursiva + self-update seguro

CREATE OR REPLACE FUNCTION public.is_tenant_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND UPPER(COALESCE(role, '')) IN ('ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Tenant admin gerencia usuários locais" ON public.users;

CREATE POLICY "Tenant admin gerencia usuários locais"
  ON public.users
  FOR ALL
  USING (
    public.is_tenant_admin()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_tenant_admin()
    AND tenant_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.users;

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

NOTIFY pgrst, 'reload schema';
