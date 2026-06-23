-- Correção das parcelas na venda padrão (FIXED | IPCA | IGPM | INCC).
-- Desconto já existe em sales.discount (20260519100000_post_sale_structure.sql).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS installment_correction_type text DEFAULT 'FIXED';

COMMENT ON COLUMN public.sales.installment_correction_type IS
  'Correção das parcelas: FIXED, IPCA, IGPM ou INCC. Vendas antigas assumem FIXED.';

ALTER TABLE public.sales
  ALTER COLUMN discount SET DEFAULT 0;

UPDATE public.sales
SET installment_correction_type = 'FIXED'
WHERE installment_correction_type IS NULL OR trim(installment_correction_type) = '';

UPDATE public.sales
SET discount = 0
WHERE discount IS NULL;

NOTIFY pgrst, 'reload schema';
