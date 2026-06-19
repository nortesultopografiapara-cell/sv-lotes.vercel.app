-- Boleto e metadados Asaas em saas_charges
ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'PIX'
    CHECK (billing_type IN ('PIX', 'BOLETO'));

ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS bank_slip_url text;

ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS invoice_url text;

ALTER TABLE public.saas_charges
  ADD COLUMN IF NOT EXISTS bank_slip_identification text;

COMMENT ON COLUMN public.saas_charges.billing_type IS 'Forma de cobrança Asaas: PIX ou BOLETO (mutuamente exclusivo por payment)';
COMMENT ON COLUMN public.saas_charges.bank_slip_url IS 'URL do boleto Asaas (bankSlipUrl)';
COMMENT ON COLUMN public.saas_charges.invoice_url IS 'URL pública da fatura Asaas (invoiceUrl)';
COMMENT ON COLUMN public.saas_charges.bank_slip_identification IS 'Linha digitável / nosso número retornado pelo Asaas';

NOTIFY pgrst, 'reload schema';
