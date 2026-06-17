-- Modelo de contrato de compra e venda por empresa (tenant)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_model text NOT NULL DEFAULT 'PADRAO';

COMMENT ON COLUMN public.companies.contract_model IS
  'Modelo de contrato de lote: PADRAO (SV LOTES/Meneses), RECANTO_PRIMAVERA, CUSTOM (futuro)';
