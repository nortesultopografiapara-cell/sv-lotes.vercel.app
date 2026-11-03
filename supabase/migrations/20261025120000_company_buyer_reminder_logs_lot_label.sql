-- Quadra/lote denormalizado no histórico operacional dos lembretes.
-- Additive e compatível com logs já existentes. NÃO aplicar em Production nesta etapa.

ALTER TABLE public.company_buyer_reminder_logs
  ADD COLUMN IF NOT EXISTS lot_label text;

COMMENT ON COLUMN public.company_buyer_reminder_logs.lot_label IS
  'Quadra/lote no momento do lembrete, para a Central de Lembretes em /charges';

NOTIFY pgrst, 'reload schema';
