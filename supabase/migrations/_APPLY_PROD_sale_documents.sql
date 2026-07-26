-- APPLY Preview/Prod: Documentos da Venda (idempotente).

CREATE TABLE IF NOT EXISTS public.sale_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  category text NOT NULL,
  document_type text NOT NULL,
  description text,
  original_file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_category_check'
  ) THEN
    ALTER TABLE public.sale_documents
      ADD CONSTRAINT sale_documents_category_check
      CHECK (
        category IN (
          'SIGNAL_ENTRY',
          'BUYER',
          'SPOUSE',
          'OTHER',
          'SYSTEM_GENERATED'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sale_documents_company_sale_idx
  ON public.sale_documents (company_id, sale_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sale_documents_sale_category_idx
  ON public.sale_documents (sale_id, category)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sale_documents_storage_path_uidx
  ON public.sale_documents (storage_path);

ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sale_documents'
      AND policyname = 'sale_documents_tenant_all'
  ) THEN
    CREATE POLICY sale_documents_tenant_all
      ON public.sale_documents
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sale-documents', 'sale-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sale_documents_select" ON storage.objects;
CREATE POLICY "sale_documents_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'sale-documents'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "sale_documents_insert" ON storage.objects;
CREATE POLICY "sale_documents_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'sale-documents'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "sale_documents_update" ON storage.objects;
CREATE POLICY "sale_documents_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'sale-documents'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

DROP POLICY IF EXISTS "sale_documents_delete" ON storage.objects;
CREATE POLICY "sale_documents_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'sale-documents'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
);

NOTIFY pgrst, 'reload schema';
