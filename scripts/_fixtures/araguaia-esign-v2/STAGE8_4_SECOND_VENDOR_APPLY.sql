BEGIN;

-- Pré-check esperado: 0 linhas (coluna ausente).
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='companies'
--   AND column_name='contract_second_vendor_json';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contract_second_vendor_json jsonb NULL;

COMMENT ON COLUMN public.companies.contract_second_vendor_json IS
  'Segundo Promitente Vendedor opcional (JSON PF). NULL = ausente. Shape: name, cpf, rg, rgIssuer, rgUf, nationality, maritalStatus, profession, email, phone, address. Usado pelo ARAGUAIA e-sign V2 quando completo (nome + CPF válido).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Pós-check:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='companies'
--   AND column_name='contract_second_vendor_json';
