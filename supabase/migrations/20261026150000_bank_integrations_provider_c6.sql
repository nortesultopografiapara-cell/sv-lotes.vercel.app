-- C6 Bank (port para develop): permitir provider C6 em bank_integrations.
-- Timestamp novo: o original 20261013120000 colide com split e troca de lote.
-- Fundação apenas. Sem emissão, sem webhook, sem alteração Asaas/Inter.
--
-- NÃO APLICAR sem autorização. O CHECK do Supabase Develop pode já conter C6
-- (aplicação manual em 2026-09-03). Este SQL é idempotente: se C6 já existir
-- na constraint, não recria.

DO $$
DECLARE
  provider_def text;
  bank_provider_def text;
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

  IF provider_def IS NOT NULL AND provider_def LIKE '%C6%' THEN
    RAISE NOTICE 'bank_integrations_provider_check already allows C6; skipping recreate';
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

  IF bank_provider_def IS NOT NULL AND bank_provider_def LIKE '%C6%' THEN
    RAISE NOTICE 'bank_integrations_bank_provider_check already allows C6; skipping recreate';
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
END $$;

COMMENT ON CONSTRAINT bank_integrations_provider_check ON public.bank_integrations IS
  'Providers bancários; C6 adicionado na Fase 1 (fundação, sem emissão).';
