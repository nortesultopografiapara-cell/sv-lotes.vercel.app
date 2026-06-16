-- Arquivamento soft de versões de contrato SaaS (ocultar testes sem apagar)

ALTER TABLE public.company_contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_kind text;

COMMENT ON COLUMN public.company_contracts.archived_at IS
  'Quando preenchido, contrato oculto da lista principal do Master (soft archive).';
COMMENT ON COLUMN public.company_contracts.archived_by IS
  'Super admin que arquivou a versão.';
COMMENT ON COLUMN public.company_contracts.archive_kind IS
  'Motivo do arquivamento: test, manual, etc.';

CREATE INDEX IF NOT EXISTS idx_company_contracts_company_archived
  ON public.company_contracts(company_id, archived_at);

NOTIFY pgrst, 'reload schema';
