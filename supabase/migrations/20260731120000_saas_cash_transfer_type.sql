-- Etapa 1 — Caixa SaaS: type 'transfer' (saques/transferências fora do P&L).
-- Idempotente. Não apaga nem altera linhas existentes.

ALTER TABLE public.saas_cash_movements
  DROP CONSTRAINT IF EXISTS saas_cash_movements_type_check;

ALTER TABLE public.saas_cash_movements
  ADD CONSTRAINT saas_cash_movements_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

COMMENT ON COLUMN public.saas_cash_movements.type IS
  'income=receita; expense=despesa/tarifa; transfer=saque/transferência entre contas (fora do resultado)';

NOTIFY pgrst, 'reload schema';
