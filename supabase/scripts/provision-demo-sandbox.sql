-- =============================================================================
-- SV LOTES — Provisionamento DEMO (idempotente, seguro para rodar várias vezes)
-- Cole no Supabase Dashboard → SQL Editor → Run
--
-- PRÉ-REQUISITO OBRIGATÓRIO (antes deste SQL):
--   Authentication → Users → Add user
--   Email: demo@svlotes.com.br
--   Password: mesma senha configurada em DEMO_USER_PASSWORD (Vercel)
--   Auto Confirm User: ON
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Coluna is_demo em public.users
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2) Coluna is_demo_sandbox em public.companies
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_demo_sandbox boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3) Empresa sandbox
-- ---------------------------------------------------------------------------
INSERT INTO public.companies (
  id,
  name,
  slug,
  cnpj,
  plan,
  active,
  is_demo_sandbox
)
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
  cnpj = EXCLUDED.cnpj,
  plan = EXCLUDED.plan,
  active = EXCLUDED.active,
  is_demo_sandbox = true;

-- ---------------------------------------------------------------------------
-- 4) Vincular public.users ao auth.users (somente se Auth existir)
--    NÃO usa company_id — public.users usa tenant_id
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_auth_id uuid;
  v_demo_email constant text := 'demo@svlotes.com.br';
  v_tenant_id constant uuid := 'a0c1d2e3-f4a5-6789-abcd-ef0123456789';
BEGIN
  SELECT id
    INTO v_auth_id
    FROM auth.users
   WHERE lower(email) = lower(v_demo_email)
   LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE NOTICE E'\n'
      '=============================================================================\n'
      ' AVISO — DEMO SETUP INCOMPLETO\n'
      '=============================================================================\n'
      ' O usuário demo@svlotes.com.br NÃO existe em auth.users.\n'
      '\n'
      ' Faça PRIMEIRO no Supabase Dashboard:\n'
      '   Authentication → Users → Add user → Create new user\n'
      '   • Email: demo@svlotes.com.br\n'
      '   • Password: mesma senha de DEMO_USER_PASSWORD (Vercel)\n'
      '   • Auto Confirm User: ON\n'
      '\n'
      ' Depois execute este script novamente.\n'
      '=============================================================================\n';
    RETURN;
  END IF;

  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    status,
    tenant_id,
    is_demo,
    onboarding_completed,
    force_password_change
  )
  VALUES (
    v_auth_id,
    v_demo_email,
    'Usuário Demonstração',
    'ADMIN',
    'ACTIVE',
    v_tenant_id,
    true,
    true,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    tenant_id = EXCLUDED.tenant_id,
    is_demo = true,
    onboarding_completed = true,
    force_password_change = false;

  RAISE NOTICE 'OK: public.users vinculado — auth id=% email=%', v_auth_id, v_demo_email;
END $$;

COMMIT;

-- =============================================================================
-- CONFERÊNCIA FINAL (resultados abaixo)
-- =============================================================================

-- A) UUID do usuário Auth demo
SELECT
  'auth.users' AS origem,
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE lower(email) = lower('demo@svlotes.com.br');

-- B) Perfil demo em public.users
SELECT
  'public.users' AS origem,
  id,
  email,
  full_name,
  role,
  status,
  tenant_id,
  is_demo,
  onboarding_completed,
  force_password_change
FROM public.users
WHERE lower(email) = lower('demo@svlotes.com.br');

-- C) Empresa sandbox
SELECT
  'public.companies' AS origem,
  id,
  name,
  slug,
  cnpj,
  plan,
  active,
  is_demo_sandbox
FROM public.companies
WHERE id = 'a0c1d2e3-f4a5-6789-abcd-ef0123456789';

-- D) Colunas is_demo / is_demo_sandbox
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'users' AND column_name = 'is_demo')
    OR (table_name = 'companies' AND column_name = 'is_demo_sandbox')
  )
ORDER BY table_name, column_name;

-- E) Resumo pass/fail
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower('demo@svlotes.com.br')
  ) THEN 'OK' ELSE 'FALTA' END AS auth_user_demo,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.users WHERE lower(email) = lower('demo@svlotes.com.br') AND is_demo = true
  ) THEN 'OK' ELSE 'FALTA' END AS public_user_demo,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = 'a0c1d2e3-f4a5-6789-abcd-ef0123456789' AND is_demo_sandbox = true
  ) THEN 'OK' ELSE 'FALTA' END AS company_sandbox,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_demo'
  ) THEN 'OK' ELSE 'FALTA' END AS coluna_users_is_demo,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'is_demo_sandbox'
  ) THEN 'OK' ELSE 'FALTA' END AS coluna_companies_is_demo_sandbox;
