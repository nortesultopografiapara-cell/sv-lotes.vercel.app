-- SV LOTES — Identificação bancária cadastral em company_financial_accounts
-- Dados de conciliação (titular já existe em beneficiary_name). Não são credenciais.
-- Idempotente · colunas nullable · contas existentes continuam válidas.
-- Não altera bank_integrations, bank_credentials, split, webhook nem relatórios.

ALTER TABLE public.company_financial_accounts
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS account_digit text,
  ADD COLUMN IF NOT EXISTS bank_account_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_financial_accounts_bank_account_kind_chk'
      AND conrelid = 'public.company_financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.company_financial_accounts
      ADD CONSTRAINT company_financial_accounts_bank_account_kind_chk
      CHECK (
        bank_account_kind IS NULL
        OR bank_account_kind IN ('CORRENTE', 'POUPANCA', 'PAGAMENTO')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.company_financial_accounts.bank_name IS
  'Nome do banco para identificação/conciliação. Não é credencial.';
COMMENT ON COLUMN public.company_financial_accounts.bank_code IS
  'Código COMPE do banco. Não é credencial.';
COMMENT ON COLUMN public.company_financial_accounts.agency IS
  'Agência bancária cadastral. Não é credencial.';
COMMENT ON COLUMN public.company_financial_accounts.account_number IS
  'Número da conta bancária cadastral. Não é credencial nem Wallet Asaas.';
COMMENT ON COLUMN public.company_financial_accounts.account_digit IS
  'Dígito da conta bancária cadastral.';
COMMENT ON COLUMN public.company_financial_accounts.bank_account_kind IS
  'Tipo da conta bancária: CORRENTE, POUPANCA ou PAGAMENTO.';

NOTIFY pgrst, 'reload schema';
