-- Etapa 8.4 — Segundo Promitente Vendedor opcional (ARAGUAIA e-sign V2).
-- Coluna nullable; sem backfill; sem alterar registros existentes.
-- Schema compartilhado Preview = Production (somente ADD COLUMN).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_second_vendor_json jsonb NULL;

COMMENT ON COLUMN public.companies.contract_second_vendor_json IS
  'Segundo Promitente Vendedor opcional (JSON PF). NULL = ausente. Shape: name, cpf, rg, rgIssuer, rgUf, nationality, maritalStatus, profession, email, phone, address. Usado pelo ARAGUAIA e-sign V2 quando completo (nome + CPF válido).';

NOTIFY pgrst, 'reload schema';
