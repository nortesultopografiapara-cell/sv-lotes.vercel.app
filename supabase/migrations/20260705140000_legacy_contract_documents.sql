-- Contratos antigos — anexos PDF vinculados a vendas existentes (migração de dados).
-- Idempotente: seguro reaplicar.

CREATE TABLE IF NOT EXISTS public.legacy_contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  original_file_name text NOT NULL,
  storage_path text NOT NULL,
  contract_number text,
  contract_date date,
  status text NOT NULL DEFAULT 'ANTIGO',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS legacy_contract_documents_sale_unique_idx
  ON public.legacy_contract_documents(sale_id);

CREATE INDEX IF NOT EXISTS legacy_contract_documents_company_id_idx
  ON public.legacy_contract_documents(company_id);

COMMENT ON TABLE public.legacy_contract_documents IS
  'PDFs de contratos históricos anexados via Migração de Dados — não substituem contrato ativo do sistema';

ALTER TABLE public.legacy_contract_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'legacy_contract_documents'
      AND policyname = 'legacy_contract_documents_tenant_all'
  ) THEN
    CREATE POLICY legacy_contract_documents_tenant_all
      ON public.legacy_contract_documents
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('legacy-contracts', 'legacy-contracts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "legacy_contracts_select" ON storage.objects;
CREATE POLICY "legacy_contracts_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'legacy-contracts'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "legacy_contracts_insert" ON storage.objects;
CREATE POLICY "legacy_contracts_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'legacy-contracts'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "legacy_contracts_update" ON storage.objects;
CREATE POLICY "legacy_contracts_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'legacy-contracts'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "legacy_contracts_delete" ON storage.objects;
CREATE POLICY "legacy_contracts_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'legacy-contracts'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

NOTIFY pgrst, 'reload schema';
