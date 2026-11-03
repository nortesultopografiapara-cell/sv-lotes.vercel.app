-- Configuração contratual LF Imóveis por empreendimento.
-- ADITIVA: coluna nullable, sem backfill, sem UPDATE em projects existentes.
-- NÃO altera companies.contract_second_vendor_json nem projects.seller_parties_json.
-- NÃO gravar o segundo vendedor da empresa no Estrela do Sul.
-- Production: não aplicar sem autorização explícita.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS lf_contract_config_json jsonb NULL;

COMMENT ON COLUMN public.projects.lf_contract_config_json IS
  'Configuração contratual exclusiva do modelo LF Imóveis (ESTRELA_DO_SUL) por empreendimento. NULL = herdar segundo vendedor da empresa e percentuais 40/60. Shape: { secondVendor: { name, cpf, rg, rgIssuer, rgUf, nationality, maritalStatus, profession, email, phone, address }, participation: { firstVendorPercent, secondVendorPercent } }. Sem wallet, conta bancária ou gateway.';

NOTIFY pgrst, 'reload schema';
