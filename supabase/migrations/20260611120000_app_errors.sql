-- Erros do cliente (iOS Safari / crash investigation)
CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  source text NOT NULL,
  message text,
  error_name text,
  stack text,
  component_stack text,
  route text,
  user_agent text,
  browser text,
  tenant_id uuid,
  user_id uuid,
  diagnostics jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON public.app_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_tenant_id ON public.app_errors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_browser ON public.app_errors(browser);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_errors_insert_authenticated" ON public.app_errors;
CREATE POLICY "app_errors_insert_authenticated" ON public.app_errors
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_errors_insert_anon" ON public.app_errors;
CREATE POLICY "app_errors_insert_anon" ON public.app_errors
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_errors_select_super_admin" ON public.app_errors;
CREATE POLICY "app_errors_select_super_admin" ON public.app_errors
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

NOTIFY pgrst, 'reload schema';
