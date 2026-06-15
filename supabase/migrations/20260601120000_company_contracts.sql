-- Histórico de contratos SaaS por empresa
CREATE TABLE IF NOT EXISTS public.company_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.company_subscriptions(id) ON DELETE SET NULL,
  contract_url text NOT NULL,
  contract_number text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  status text NOT NULL DEFAULT 'active',
  superseded_by uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  regenerated_from uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  regenerated_at timestamptz,
  regenerated_by uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_company_contracts_company_id
  ON public.company_contracts(company_id);

CREATE INDEX IF NOT EXISTS idx_company_contracts_subscription_id
  ON public.company_contracts(subscription_id);

CREATE INDEX IF NOT EXISTS idx_company_contracts_generated_at
  ON public.company_contracts(generated_at DESC);

ALTER TABLE public.company_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_company_contracts_all" ON public.company_contracts;
CREATE POLICY "master_company_contracts_all" ON public.company_contracts
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "tenant_read_own_contracts" ON public.company_contracts;
CREATE POLICY "tenant_read_own_contracts" ON public.company_contracts
  FOR SELECT
  USING (company_id = public.current_tenant_id());

COMMENT ON TABLE public.company_contracts IS 'Contratos SaaS gerados (PDF) com histórico de versões';

NOTIFY pgrst, 'reload schema';

-- Bucket opcional para PDFs (fallback: company-assets/contracts/saas/...)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "master_contracts_storage_all" ON storage.objects;
CREATE POLICY "master_contracts_storage_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'contracts' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'contracts' AND public.is_super_admin());
