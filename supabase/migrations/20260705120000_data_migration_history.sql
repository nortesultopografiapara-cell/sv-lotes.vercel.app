-- Histórico de migrações de dados (importação Excel/CSV).
-- Idempotente: seguro reaplicar.

CREATE TABLE IF NOT EXISTS public.data_migration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,
  arquivo text NOT NULL,
  usuario text,
  usuario_id uuid,
  quantidade_total integer NOT NULL DEFAULT 0,
  quantidade_importada integer NOT NULL DEFAULT 0,
  quantidade_erros integer NOT NULL DEFAULT 0,
  quantidade_duplicados integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'concluido',
  detalhes_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_migration_history_company_id_idx
  ON public.data_migration_history(company_id);

CREATE INDEX IF NOT EXISTS data_migration_history_migrated_at_idx
  ON public.data_migration_history(migrated_at DESC);

COMMENT ON TABLE public.data_migration_history IS
  'Histórico de importações via módulo Migração de Dados';

ALTER TABLE public.data_migration_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_migration_history'
      AND policyname = 'data_migration_history_tenant_all'
  ) THEN
    CREATE POLICY data_migration_history_tenant_all
      ON public.data_migration_history
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
