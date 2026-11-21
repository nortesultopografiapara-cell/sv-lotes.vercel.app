-- C6 Bank: acrescenta C6 aos checks já existentes, sem substituir a lista.
-- Não apaga registros. Não cria índice único global em bank_credentials.
-- Esse índice atingiria Asaas e Inter. A tabela não tem provider próprio,
-- então um índice parcial não consegue limitar a restrição ao C6.
-- Não altera RLS, parcelas, caixa, contratos ou vendas.
-- Não executar sem autorização explícita.

DO $$
DECLARE
  provider_def text;
  bank_provider_def text;
  provider_expr text;
  bank_provider_expr text;
  c6_duplicate_companies integer;
  credential_duplicate_pairs integer;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO provider_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.bank_integrations'::regclass
    AND c.conname = 'bank_integrations_provider_check';

  SELECT pg_get_constraintdef(c.oid)
    INTO bank_provider_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.bank_integrations'::regclass
    AND c.conname = 'bank_integrations_bank_provider_check';

  IF provider_def IS NULL OR bank_provider_def IS NULL THEN
    RAISE EXCEPTION 'Check de provider ausente. Nenhum constraint foi alterado.';
  END IF;

  IF provider_def ~ '''C6''' THEN
    RAISE NOTICE 'bank_integrations_provider_check já aceita C6.';
  ELSE
    provider_expr := regexp_replace(provider_def, '^\s*CHECK\s*', '');
    IF provider_expr ~ 'ARRAY\[' THEN
      provider_expr := regexp_replace(provider_expr, 'ARRAY\[', 'ARRAY[''C6''::text, ', 1, 1);
    ELSIF provider_expr ~ 'IN\s*\(' THEN
      provider_expr := regexp_replace(provider_expr, 'IN\s*\(', 'IN (''C6'', ', 1, 1);
    ELSE
      RAISE EXCEPTION 'Formato de bank_integrations_provider_check não reconhecido. Nenhum constraint foi alterado.';
    END IF;

    ALTER TABLE public.bank_integrations
      DROP CONSTRAINT bank_integrations_provider_check;
    EXECUTE format(
      'ALTER TABLE public.bank_integrations ADD CONSTRAINT bank_integrations_provider_check CHECK %s',
      provider_expr
    );
  END IF;

  IF bank_provider_def ~ '''C6''' THEN
    RAISE NOTICE 'bank_integrations_bank_provider_check já aceita C6.';
  ELSE
    bank_provider_expr := regexp_replace(bank_provider_def, '^\s*CHECK\s*', '');
    IF bank_provider_expr ~ 'ARRAY\[' THEN
      bank_provider_expr := regexp_replace(bank_provider_expr, 'ARRAY\[', 'ARRAY[''C6''::text, ', 1, 1);
    ELSIF bank_provider_expr ~ 'IN\s*\(' THEN
      bank_provider_expr := regexp_replace(bank_provider_expr, 'IN\s*\(', 'IN (''C6'', ', 1, 1);
    ELSE
      RAISE EXCEPTION 'Formato de bank_integrations_bank_provider_check não reconhecido. Nenhum constraint foi alterado.';
    END IF;

    ALTER TABLE public.bank_integrations
      DROP CONSTRAINT bank_integrations_bank_provider_check;
    EXECUTE format(
      'ALTER TABLE public.bank_integrations ADD CONSTRAINT bank_integrations_bank_provider_check CHECK %s',
      bank_provider_expr
    );
  END IF;

  SELECT count(*)
    INTO c6_duplicate_companies
  FROM (
    SELECT company_id
    FROM public.bank_integrations
    WHERE provider = 'C6'
    GROUP BY company_id
    HAVING count(*) > 1
  ) duplicated;

  IF c6_duplicate_companies > 0 THEN
    RAISE NOTICE 'Há % empresa(s) com mais de uma integração C6. Nenhum registro foi apagado e o índice único não foi criado.', c6_duplicate_companies;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_bank_integrations_company_c6'
  ) THEN
    CREATE UNIQUE INDEX uq_bank_integrations_company_c6
      ON public.bank_integrations (company_id)
      WHERE provider = 'C6';
  END IF;

  SELECT count(*)
    INTO credential_duplicate_pairs
  FROM (
    SELECT integration_id, credential_type
    FROM public.bank_credentials
    GROUP BY integration_id, credential_type
    HAVING count(*) > 1
  ) duplicated;

  RAISE NOTICE 'Pares duplicados de credencial por tipo: %. Nenhum registro foi apagado e nenhum índice global foi criado.', credential_duplicate_pairs;
END $$;

COMMENT ON CONSTRAINT bank_integrations_provider_check ON public.bank_integrations IS
  'Providers bancários já existentes, com C6 acrescentado. Emissão, webhook e liquidação permanecem desligados.';
