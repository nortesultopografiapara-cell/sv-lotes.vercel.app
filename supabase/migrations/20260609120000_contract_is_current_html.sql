-- Versão atual do contrato + espelho de HTML para integrações

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS html_content text;

UPDATE public.contracts
SET html_content = generated_html
WHERE html_content IS NULL AND generated_html IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_sale_is_current
  ON public.contracts(sale_id)
  WHERE is_current = true;

NOTIFY pgrst, 'reload schema';
