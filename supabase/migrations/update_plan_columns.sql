-- ==========================================
-- SAAS MULTI-TENANT: CORREÇÃO ESTRUTURAL
-- ==========================================
-- IMPORTANTE: Execute este código no SQL Editor do Supabase 
-- para criar as colunas de limites do plano e informações 
-- requeridas pelo frontend. Após executar, você RECARREGARÁ 
-- o schema cache do PostgREST.

-- 1. ADICIONA AS COLUNAS DE LIMITES DE MÓDULOS E PLANOS
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS broker_limit INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS admin_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS project_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS module_plan TEXT DEFAULT 'Básico',
ADD COLUMN IF NOT EXISTS module_type TEXT DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS company_slug TEXT,
ADD COLUMN IF NOT EXISTS company_status TEXT DEFAULT 'active';

-- ==========================================
-- 2. RECARREGA O SCHEMA CACHE
-- Isso resolverá o erro:
-- "Could not find the 'admin_limit' column of 'companies' in the schema cache PGRST204"
-- ==========================================
NOTIFY pgrst, 'reload schema';
