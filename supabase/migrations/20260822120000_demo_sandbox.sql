-- Sandbox de demonstração pública (landing /demo)
-- Após aplicar: criar usuário demo@svlotes.com.br no Supabase Auth e vincular em public.users
-- (ver comentário ao final deste arquivo).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_demo_sandbox boolean NOT NULL DEFAULT false;

INSERT INTO public.companies (id, name, slug, cnpj, plan, active, is_demo_sandbox)
VALUES (
  'a0c1d2e3-f4a5-6789-abcd-ef0123456789',
  'Empresa Demonstração SV LOTES',
  'demo-sv-lotes',
  '00000000000000',
  'BUSINESS',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  is_demo_sandbox = true,
  active = true;

COMMENT ON COLUMN public.users.is_demo IS
  'Usuário de demonstração pública — isolado ao tenant sandbox; sem Master/SaaS.';

COMMENT ON COLUMN public.companies.is_demo_sandbox IS
  'Empresa sandbox para visitantes da landing; dados fictícios e resetáveis.';

-- Setup manual do usuário demo (executar após criar auth.users no painel Supabase):
--
-- 1. Authentication → Users → Add user
--    Email: demo@svlotes.com.br
--    Password: valor de DEMO_USER_PASSWORD (Vercel/env)
--    Auto Confirm: sim
--
-- 2. Vincular perfil (substituir :auth_user_id pelo UUID do Auth):
--
-- INSERT INTO public.users (id, email, full_name, role, status, tenant_id, company_id, is_demo, onboarding_completed)
-- VALUES (
--   ':auth_user_id',
--   'demo@svlotes.com.br',
--   'Usuário Demonstração',
--   'ADMIN',
--   'ACTIVE',
--   'a0c1d2e3-f4a5-6789-abcd-ef0123456789',
--   'a0c1d2e3-f4a5-6789-abcd-ef0123456789',
--   true,
--   true
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   is_demo = true,
--   tenant_id = EXCLUDED.tenant_id,
--   company_id = EXCLUDED.company_id,
--   role = 'ADMIN',
--   status = 'ACTIVE';
--
-- 3. Criar empreendimento fictício "Loteamento Demonstração SV LOTES" via painel ou importação GIS.
