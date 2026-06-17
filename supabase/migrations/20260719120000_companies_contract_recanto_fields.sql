-- Campos do contrato personalizado Recanto Primavera (Configurações → Empresa)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_legal_nationality text,
  ADD COLUMN IF NOT EXISTS contract_legal_marital_status text,
  ADD COLUMN IF NOT EXISTS contract_legal_profession text,
  ADD COLUMN IF NOT EXISTS contract_legal_rg text,
  ADD COLUMN IF NOT EXISTS contract_legal_rg_issuer text,
  ADD COLUMN IF NOT EXISTS contract_legal_phone text,
  ADD COLUMN IF NOT EXISTS contract_legal_email text,
  ADD COLUMN IF NOT EXISTS contract_legal_address text,
  ADD COLUMN IF NOT EXISTS contract_enterprise_name text,
  ADD COLUMN IF NOT EXISTS contract_enterprise_location text,
  ADD COLUMN IF NOT EXISTS contract_enterprise_municipality text,
  ADD COLUMN IF NOT EXISTS contract_enterprise_uf text,
  ADD COLUMN IF NOT EXISTS contract_forum_city text,
  ADD COLUMN IF NOT EXISTS contract_bank_name text,
  ADD COLUMN IF NOT EXISTS contract_bank_branch text,
  ADD COLUMN IF NOT EXISTS contract_bank_account text,
  ADD COLUMN IF NOT EXISTS contract_bank_pix text,
  ADD COLUMN IF NOT EXISTS contract_bank_beneficiary text;

COMMENT ON COLUMN public.companies.contract_enterprise_location IS
  'Localização do empreendimento exibida no contrato (não usar endereço comercial da empresa)';
