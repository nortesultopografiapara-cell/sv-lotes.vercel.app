-- Soft delete para corretores (preserva histórico de vendas/comissões)
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_brokers_active_not_deleted
  ON public.brokers (tenant_id)
  WHERE deleted_at IS NULL AND (active IS DISTINCT FROM false);
