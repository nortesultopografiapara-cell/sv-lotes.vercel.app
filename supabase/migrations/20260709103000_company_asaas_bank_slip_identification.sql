-- Linha digitável do boleto Asaas Company (parcelas de compradores)
ALTER TABLE public.company_asaas_charges
  ADD COLUMN IF NOT EXISTS bank_slip_identification text;

COMMENT ON COLUMN public.company_asaas_charges.bank_slip_identification IS
  'Linha digitável do boleto Asaas (identificationField)';

NOTIFY pgrst, 'reload schema';
