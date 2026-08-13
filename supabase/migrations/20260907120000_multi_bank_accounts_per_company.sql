-- Multi-conta recebedora (Asaas + Inter) por empresa.
-- Identidade operacional: financial_account_id.
-- Não apaga credenciais, cobranças, external_id nem idempotency_key.

ALTER TABLE public.bank_charges
  ADD COLUMN IF NOT EXISTS financial_account_id uuid
  REFERENCES public.company_financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_charges_financial_account_id
  ON public.bank_charges(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

UPDATE public.bank_charges bc
SET financial_account_id = fa.id
FROM public.company_financial_accounts fa
WHERE fa.bank_integration_id = bc.integration_id
  AND fa.company_id = bc.company_id
  AND bc.financial_account_id IS NULL;

UPDATE public.bank_charges bc
SET financial_account_id = fr.financial_account_id
FROM public.finance_receipts fr
WHERE fr.id = bc.finance_receipt_id
  AND bc.financial_account_id IS NULL
  AND fr.financial_account_id IS NOT NULL;

-- 1 FA ↔ 1 bank_integration (impede duas contas compartilharem o mesmo Client ID / API key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.company_financial_accounts
    WHERE bank_integration_id IS NOT NULL
    GROUP BY bank_integration_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_company_financial_accounts_bank_integration
      ON public.company_financial_accounts(bank_integration_id)
      WHERE bank_integration_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.bank_charges.financial_account_id IS
  'Conta recebedora (company_financial_accounts) que originou a cobrança.';

NOTIFY pgrst, 'reload schema';
