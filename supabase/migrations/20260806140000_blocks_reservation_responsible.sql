-- Responsável autenticado pela reserva do lote (GIS).
-- Snapshot de nome preserva histórico se o usuário for desativado.
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS reserved_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reserved_by_name text;

ALTER TABLE public.reservation_logs
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text;

CREATE INDEX IF NOT EXISTS idx_blocks_reserved_by_user_id
  ON public.blocks (reserved_by_user_id)
  WHERE reserved_by_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
