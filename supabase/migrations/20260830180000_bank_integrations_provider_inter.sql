-- Fase A Inter: permitir provider INTER em bank_integrations.
-- Não altera company_asaas_charges nem fluxos Asaas.

ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_provider_check CHECK (
    provider IN (
      'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER'
    )
  );

ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_bank_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_bank_provider_check CHECK (
    bank_provider IS NULL OR bank_provider IN (
      'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA', 'MOCK',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY', 'INTER'
    )
  );

COMMENT ON CONSTRAINT bank_integrations_provider_check ON public.bank_integrations IS
  'Providers bancários; INTER adicionado na Fase A (config/credenciais, sem emissão).';
