-- Múltiplos administradores por empresa (tenant)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS admin_users_limit integer NOT NULL DEFAULT 1;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN public.companies.admin_users_limit IS 'Quantidade máxima de administradores ativos por empresa';
COMMENT ON COLUMN public.users.job_title IS 'Cargo/função do administrador da empresa';
COMMENT ON COLUMN public.users.created_by IS 'Usuário que cadastrou este administrador';

-- Meneses: até 5 administradores
UPDATE public.companies
SET admin_users_limit = 5
WHERE id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

-- RLS: permitir ADMIN, ADMIN_EMPRESA e COMPANY_ADMIN gerenciarem usuários do tenant
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
