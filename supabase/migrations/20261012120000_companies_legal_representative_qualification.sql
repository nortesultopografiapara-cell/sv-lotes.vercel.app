-- Qualificação civil do Representante Legal (ARAGUAIA).
-- Aditivo: UF do RG + endereço residencial pessoal.
-- Não reutiliza contract_legal_address (sede/endereço jurídico da empresa).
-- Sem backfill; sem DROP; sem alterar contratos gravados.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_legal_rg_uf text,
  ADD COLUMN IF NOT EXISTS legal_representative_address text;

COMMENT ON COLUMN public.companies.contract_legal_rg_uf IS
  'UF do RG do Representante Legal (qualificação PF). NULL = omitir. Não confundir com sede da empresa.';

COMMENT ON COLUMN public.companies.legal_representative_address IS
  'Endereço residencial/pessoal do Representante Legal. NULL = omitir. Não usar como sede nem como contract_legal_address.';

NOTIFY pgrst, 'reload schema';
