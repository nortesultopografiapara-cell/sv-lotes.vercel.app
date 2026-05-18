CREATE TABLE IF NOT EXISTS public.contract_templates (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger for updated_at
CREATE TRIGGER update_contract_templates_modtime
BEFORE UPDATE ON public.contract_templates
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- RLS
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_templates_select" 
ON public.contract_templates FOR SELECT 
USING (tenant_id IN (SELECT id FROM public.companies WHERE id = public.contract_templates.tenant_id AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id = public.contract_templates.tenant_id))));

CREATE POLICY "contract_templates_insert" 
ON public.contract_templates FOR INSERT 
WITH CHECK (tenant_id IN (SELECT id FROM public.companies WHERE id = public.contract_templates.tenant_id AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id = public.contract_templates.tenant_id))));

CREATE POLICY "contract_templates_update" 
ON public.contract_templates FOR UPDATE 
USING (tenant_id IN (SELECT id FROM public.companies WHERE id = public.contract_templates.tenant_id AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id = public.contract_templates.tenant_id))));

CREATE POLICY "contract_templates_delete" 
ON public.contract_templates FOR DELETE 
USING (tenant_id IN (SELECT id FROM public.companies WHERE id = public.contract_templates.tenant_id AND (auth.uid() IN (SELECT id FROM public.users WHERE tenant_id = public.contract_templates.tenant_id))));

CREATE POLICY "contract_templates_superadmin" 
ON public.contract_templates FOR ALL 
USING ( auth.uid() IN (SELECT id FROM public.users WHERE role = 'SUPER_ADMIN') );

NOTIFY pgrst, 'reload schema';
