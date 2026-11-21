-- C6 Bank: permitir o provider e proteger unicidade.
-- Não apaga registros. Se já houver duplicidade, o índice correspondente não é criado.
-- Não altera RLS, Asaas, Inter, parcelas, caixa, contratos ou vendas.
-- Não executar sem autorização explícita.

DO $$
DECLARE
  provider_def text;
  bank_provider_def text;
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

  IF provider_def IS NOT NULL AND provider_def LIKE '%''C6''%' THEN
    RAISE NOTICE 'bank_integrations_provider_check já aceita C6.';
  ELSE
    ALTER TABLE public.bank_integrations
      DROP CONSTRAINT IF EXISTS bank_integrations_provider_check;

    ALTER TABLE public.bank_integrations
      ADD CONSTRAINT bank_integrations_provider_check CHECK (
        provider IN (
          'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
          'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER', 'C6'
        )
      );
  END IF;

  IF bank_provider_def IS NOT NULL AND bank_provider_def LIKE '%''C6''%' THEN
    RAISE NOTICE 'bank_integrations_bank_provider_check já aceita C6.';
  ELSE
    ALTER TABLE public.bank_integrations
      DROP CONSTRAINT IF EXISTS bank_integrations_bank_provider_check;

    ALTER TABLE public.bank_integrations
      ADD CONSTRAINT bank_integrations_bank_provider_check CHECK (
        bank_provider IS NULL OR bank_provider IN (
          'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
          'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER', 'C6'
        )
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
    RAISE NOTICE 'Há mais de uma integração C6 na mesma empresa. Nenhum registro foi apagado e o índice único não foi criado.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_bank_integrations_company_c6'
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

  IF credential_duplicate_pairs > 0 THEN
    RAISE NOTICE 'Há credencial duplicada por tipo. Nenhum registro foi apagado e o índice único não foi criado.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_bank_credentials_integration_type'
  ) THEN
    CREATE UNIQUE INDEX uq_bank_credentials_integration_type
      ON public.bank_credentials (integration_id, credential_type);
  END IF;
END $$;

COMMENT ON CONSTRAINT bank_integrations_provider_check ON public.bank_integrations IS
  'Providers bancários; C6 entra só no cadastro. Emissão, webhook e liquidação permanecem desligados.';
