-- CORREÇÃO DA ESTRUTURA SAAS MULTI-TENANT (TABELA COMPANIES)
-- Execute este script no SQL Editor do seu painel Supabase

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS module_plan text default 'basic',
ADD COLUMN IF NOT EXISTS broker_limit int default 5,
ADD COLUMN IF NOT EXISTS admin_limit int default 1,
ADD COLUMN IF NOT EXISTS project_limit int default 1;

-- Atualizar dados já existentes para o plano básico (caso existam empresas antigas)
UPDATE public.companies 
SET module_plan = 'basic', 
    broker_limit = 5, 
    admin_limit = 1, 
    project_limit = 1 
WHERE module_plan IS NULL;
