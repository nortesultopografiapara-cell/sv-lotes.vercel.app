-- Endurecimento complementar das parcelas balão (migration já aplicada: 20260709220000).
-- Idempotente · não altera dados existentes · não quebra vendas sem balão.

-- Garante updated_at em updates futuros (opcional / best-effort).
CREATE OR REPLACE FUNCTION public.set_sale_balloon_installments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_balloon_installments_updated_at
  ON public.sale_balloon_installments;

CREATE TRIGGER trg_sale_balloon_installments_updated_at
  BEFORE UPDATE ON public.sale_balloon_installments
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_sale_balloon_installments_updated_at();

-- Reforça índice (já existe na migration base; IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_sale_balloon_installments_sale_id
  ON public.sale_balloon_installments(sale_id);

COMMENT ON FUNCTION public.set_sale_balloon_installments_updated_at() IS
  'Atualiza updated_at em sale_balloon_installments.';

NOTIFY pgrst, 'reload schema';
