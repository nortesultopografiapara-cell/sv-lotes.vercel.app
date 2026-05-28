-- Versionamento e regeneração de contratos (venda + SaaS)

-- Contratos de venda de lote
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_from uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_at timestamptz,
  ADD COLUMN IF NOT EXISTS regenerated_by uuid,
  ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('rascunho', 'ativo', 'assinado', 'cancelado', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_contracts_sale_version
  ON public.contracts(sale_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_sale_status
  ON public.contracts(sale_id, status);

-- Contratos SaaS (company_contracts)
ALTER TABLE public.company_contracts
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_from uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_at timestamptz,
  ADD COLUMN IF NOT EXISTS regenerated_by uuid;

COMMENT ON COLUMN public.company_contracts.contract_url IS 'URL do PDF (contract_pdf_url legado)';

NOTIFY pgrst, 'reload schema';
