-- SV LOTES 2.0 — Módulo Bancário Fase 1.2 (cadastro completo da integração)
-- Idempotente · complementa bank_integrations · secrets em bank_credentials

-- ---------------------------------------------------------------------------
-- Novos campos em bank_integrations (dados não sensíveis)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bank_integrations
  ADD COLUMN IF NOT EXISTS bank_provider text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS api_base_url text,
  ADD COLUMN IF NOT EXISTS account_digit text,
  ADD COLUMN IF NOT EXISTS wallet_code text,
  ADD COLUMN IF NOT EXISTS beneficiary_code text,
  ADD COLUMN IF NOT EXISTS certificate_name text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS configured_at timestamptz;

-- Sincroniza bank_provider legado a partir de provider
UPDATE public.bank_integrations
SET bank_provider = provider
WHERE bank_provider IS NULL AND provider IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Estende providers suportados (Itaú, Santander)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_provider_check CHECK (
    provider IN (
      'MOCK', 'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY'
    )
  );

ALTER TABLE public.bank_integrations
  DROP CONSTRAINT IF EXISTS bank_integrations_bank_provider_check;

ALTER TABLE public.bank_integrations
  ADD CONSTRAINT bank_integrations_bank_provider_check CHECK (
    bank_provider IS NULL OR bank_provider IN (
      'MOCK', 'SICOOB', 'SICREDI', 'BRADESCO', 'BANCO_DO_BRASIL', 'CAIXA',
      'ITAU', 'SANTANDER', 'ASAAS_COMPANY'
    )
  );

CREATE INDEX IF NOT EXISTS idx_bank_integrations_active
  ON public.bank_integrations(company_id, active)
  WHERE active = true;

COMMENT ON COLUMN public.bank_integrations.bank_provider IS 'Provider bancário selecionado (espelho canônico de provider na Fase 1.2+)';
COMMENT ON COLUMN public.bank_integrations.client_id IS 'Client ID OAuth/API — não sensível';
COMMENT ON COLUMN public.bank_integrations.api_base_url IS 'URL base da API bancária';
COMMENT ON COLUMN public.bank_integrations.account_digit IS 'Dígito verificador da conta';
COMMENT ON COLUMN public.bank_integrations.wallet_code IS 'Carteira de cobrança';
COMMENT ON COLUMN public.bank_integrations.beneficiary_code IS 'Código do beneficiário';
COMMENT ON COLUMN public.bank_integrations.certificate_name IS 'Nome do certificado A1 (sem upload na Fase 1.2)';
COMMENT ON COLUMN public.bank_integrations.active IS 'Integração ativa para emissão futura';
COMMENT ON COLUMN public.bank_integrations.configured_at IS 'Timestamp da última configuração salva';

NOTIFY pgrst, 'reload schema';
