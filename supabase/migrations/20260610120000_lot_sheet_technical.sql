-- Prancha de lote: campos do empreendimento + responsável técnico

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS comarca text,
  ADD COLUMN IF NOT EXISTS cri_cartorio text,
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS escala_padrao text,
  ADD COLUMN IF NOT EXISTS municipio text;

-- municipio/uf podem existir como city/uf em projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS uf text;

CREATE TABLE IF NOT EXISTS public.technical_responsibles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  registry_type text,
  registry_number text,
  phone text,
  email text,
  signature_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_technical_responsibles_company_active
  ON public.technical_responsibles(company_id)
  WHERE active = true;

ALTER TABLE public.technical_responsibles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "tenant_isolation_technical_responsibles" ON public.technical_responsibles;
  CREATE POLICY "tenant_isolation_technical_responsibles" ON public.technical_responsibles
    FOR ALL USING (
      public.is_super_admin()
      OR company_id = public.current_tenant_id()
    );
EXCEPTION WHEN OTHERS THEN
  DROP POLICY IF EXISTS "tenant_isolation_technical_responsibles" ON public.technical_responsibles;
  CREATE POLICY "tenant_isolation_technical_responsibles" ON public.technical_responsibles
    FOR ALL USING (true);
END $$;

NOTIFY pgrst, 'reload schema';
