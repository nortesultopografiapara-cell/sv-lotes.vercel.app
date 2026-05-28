-- Contrato inicia como pending até geração explícita do PDF
ALTER TABLE public.company_subscriptions
  ALTER COLUMN contract_status SET DEFAULT 'pending';

UPDATE public.company_subscriptions
SET contract_status = 'pending'
WHERE contract_status = 'active'
  AND (contract_pdf_url IS NULL OR contract_number IS NULL);
