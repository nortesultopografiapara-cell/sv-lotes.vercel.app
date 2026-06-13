-- Acesso de proprietário/sócio por empreendimento (role OWNER)

CREATE TABLE IF NOT EXISTS public.owner_project_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  can_view_dashboard boolean NOT NULL DEFAULT true,
  can_view_map boolean NOT NULL DEFAULT true,
  can_view_finance boolean NOT NULL DEFAULT true,
  can_view_contracts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT owner_project_access_user_project_unique UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_project_access_tenant_id
  ON public.owner_project_access(tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_project_access_user_id
  ON public.owner_project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_owner_project_access_project_id
  ON public.owner_project_access(project_id);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role IN (
    'SUPER_ADMIN',
    'COMPANY_ADMIN',
    'ADMIN_EMPRESA',
    'MANAGER',
    'USER',
    'ADMIN',
    'CORRETOR',
    'BROKER',
    'OWNER'
  )
);

ALTER TABLE public.owner_project_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_project_access_select ON public.owner_project_access;
CREATE POLICY owner_project_access_select ON public.owner_project_access
  FOR SELECT
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR tenant_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS owner_project_access_write ON public.owner_project_access;
CREATE POLICY owner_project_access_write ON public.owner_project_access
  FOR ALL
  USING (
    public.is_super_admin()
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR tenant_id = public.current_tenant_id()
  );

NOTIFY pgrst, 'reload schema';
