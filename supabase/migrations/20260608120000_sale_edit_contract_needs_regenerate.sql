-- Edição de venda concluída: contrato desatualizado + observações na venda
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS needs_regenerar boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contracts_needs_regenerar
  ON public.contracts(sale_id)
  WHERE needs_regenerar = true;
