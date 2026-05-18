ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS fantasy_name text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip_code text,
ADD COLUMN IF NOT EXISTS legal_representative text,
ADD COLUMN IF NOT EXISTS representative_cpf text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS signature_url text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_companies_modtime ON public.companies;
CREATE TRIGGER update_companies_modtime
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

INSERT INTO storage.buckets (id, name, public) 
VALUES ('company-assets', 'company-assets', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_assets_select" ON storage.objects;
CREATE POLICY "company_assets_select" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'company-assets' AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id::text = (storage.foldername(name))[1])) );

DROP POLICY IF EXISTS "company_assets_insert" ON storage.objects;
CREATE POLICY "company_assets_insert" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'company-assets' AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id::text = (storage.foldername(name))[1])) );

DROP POLICY IF EXISTS "company_assets_update" ON storage.objects;
CREATE POLICY "company_assets_update" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'company-assets' AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id::text = (storage.foldername(name))[1])) );

DROP POLICY IF EXISTS "company_assets_delete" ON storage.objects;
CREATE POLICY "company_assets_delete" 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'company-assets' AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id::text = (storage.foldername(name))[1])) );

DROP POLICY IF EXISTS "company_assets_superadmin" ON storage.objects;
CREATE POLICY "company_assets_superadmin" 
ON storage.objects FOR ALL 
USING ( bucket_id = 'company-assets' AND auth.uid() IN (SELECT id FROM public.users WHERE role = 'SUPER_ADMIN') );

NOTIFY pgrst, 'reload schema';
