-- Soft delete de cobranças SaaS canceladas (oculta Master + Minha Assinatura)
ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS asaas_delete_status text;

CREATE INDEX IF NOT EXISTS idx_saas_charges_not_deleted
  ON public.saas_charges(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.saas_charges.deleted_at IS 'Soft delete — cobrança cancelada removida dos painéis';
COMMENT ON COLUMN public.saas_charges.deleted_by IS 'Usuário master que excluiu a cobrança';
COMMENT ON COLUMN public.saas_charges.delete_reason IS 'Motivo da exclusão (ex.: master_delete_cancelled)';
COMMENT ON COLUMN public.saas_charges.asaas_delete_status IS 'Resultado DELETE Asaas: deleted | not_found | skipped | error';
