-- Campos de contrato/reserva no cliente (estado civil, endereço, profissão).
-- Idempotente: seguro reaplicar se 20260519230000 não rodou no projeto remoto.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS rg_issuer text,
  ADD COLUMN IF NOT EXISTS rg_issuer_state text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS civil_state text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS state_uf text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid;

COMMENT ON COLUMN public.customers.civil_state IS 'Estado civil (formulário reserva/venda/contrato)';
COMMENT ON COLUMN public.customers.state IS 'UF — espelho legado; preferir state_uf quando ambos existirem';

NOTIFY pgrst, 'reload schema';
