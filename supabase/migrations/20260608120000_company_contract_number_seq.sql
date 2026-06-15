-- Garante colunas de versionamento/regeneração em company_contracts (idempotente)
ALTER TABLE public.company_contracts
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_from uuid REFERENCES public.company_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_at timestamptz,
  ADD COLUMN IF NOT EXISTS regenerated_by uuid;

-- Sequência transacional de numeração NNNNN/AAAA (reinicia a cada ano)
CREATE TABLE IF NOT EXISTS public.company_contract_number_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.company_contract_number_counters IS
  'Contador sequencial anual de contratos SaaS (formato 00001/AAAA)';

-- Sincroniza contador com números já existentes no novo formato
INSERT INTO public.company_contract_number_counters (year, last_number)
SELECT year_val, max_seq
FROM (
  SELECT
    (regexp_match(contract_number, '/([0-9]{4})$'))[1]::integer AS year_val,
    MAX((regexp_match(contract_number, '^([0-9]{5})/'))[1]::integer) AS max_seq
  FROM (
    SELECT contract_number FROM public.company_contracts
    UNION ALL
    SELECT contract_number FROM public.company_subscriptions
    WHERE contract_number IS NOT NULL
  ) AS all_numbers
  WHERE contract_number ~ '^[0-9]{5}/[0-9]{4}$'
  GROUP BY year_val
) AS seeded
ON CONFLICT (year) DO UPDATE
SET last_number = GREATEST(
  public.company_contract_number_counters.last_number,
  EXCLUDED.last_number
);

CREATE OR REPLACE FUNCTION public.generate_next_company_contract_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year integer := EXTRACT(YEAR FROM timezone('utc', now()))::integer;
  next_num integer;
BEGIN
  INSERT INTO public.company_contract_number_counters (year, last_number)
  VALUES (current_year, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.company_contract_number_counters
  SET last_number = last_number + 1
  WHERE year = current_year
  RETURNING last_number INTO next_num;

  RETURN lpad(next_num::text, 5, '0') || '/' || current_year::text;
END;
$$;

COMMENT ON FUNCTION public.generate_next_company_contract_number() IS
  'Gera próximo número de contrato SaaS no formato NNNNN/AAAA (sequencial por ano)';

NOTIFY pgrst, 'reload schema';
