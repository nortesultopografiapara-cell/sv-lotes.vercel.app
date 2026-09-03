-- Fase 1 C6 Bank: permitir provider C6 em bank_integrations.
-- Fundação apenas. Sem emissão, sem webhook, sem alteração Asaas/Inter.

ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_provider_check CHECK (
    provider IN (
      'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER', 'C6'
    )
  );

ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_bank_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_bank_provider_check CHECK (
    bank_provider IS NULL OR bank_provider IN (
      'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER', 'C6'
    )
  );

COMMENT ON CONSTRAINT bank_integrations_provider_check ON public.bank_integrations IS
  'Providers bancários; C6 adicionado na Fase 1 (fundação, sem emissão).';
