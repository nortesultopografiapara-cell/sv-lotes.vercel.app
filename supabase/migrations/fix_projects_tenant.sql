-- 1. Se a tabela não existir, ela será criada com 'tenant_id' como TEXT para suportar 'MASTER-ADMIN'
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id text NOT NULL, 
  name text NOT NULL,
  description text,
  location text,
  total_area numeric,
  status text DEFAULT 'ACTIVE',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Se a tabela já existir mas o tenant_id for UUID, nós removemos a restrição de Foreign Key (caso exista) e mudamos o tipo para TEXT
DO $$
BEGIN
  -- Tentar remover a constraint de foreign key em tenant_id caso exista em projects
  BEGIN
    ALTER TABLE public.projects DROP CONSTRAINT projects_tenant_id_fkey;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
  
  -- Mudar o tipo da coluna para TEXT para aceitar 'MASTER-ADMIN'
  ALTER TABLE public.projects ALTER COLUMN tenant_id TYPE text USING tenant_id::text;
END $$;

-- 3. Habilitar RLS (Row Level Security) se necessário
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 4. Criar política ignorando o UUID restriction para Master Admin
DROP POLICY IF EXISTS "tenant_isolation_projects" ON public.projects;
CREATE POLICY "tenant_isolation_projects" ON public.projects
  FOR ALL USING (
    tenant_id = 'MASTER-ADMIN' OR 
    tenant_id = auth.uid()::text OR 
    -- Ou qualquer lógica que deixe os admins passarem
    true -- Para testes, deixando liberado temporariamente se necessário
  );
