-- SV LOTES — Freeze cadastral da identificação bancária no snapshot imutável.
-- Colunas nullable. Sem backfill. Snapshots antigos permanecem NULL.
-- Não altera pernas de cobrança, webhook, emissão, cadastro vivo nem relatórios.

ALTER TABLE public.sale_revenue_split_snapshot_participants
  ADD COLUMN IF NOT EXISTS dest_beneficiary_name text,
  ADD COLUMN IF NOT EXISTS dest_institution text,
  ADD COLUMN IF NOT EXISTS dest_bank_name text,
  ADD COLUMN IF NOT EXISTS dest_bank_code text,
  ADD COLUMN IF NOT EXISTS dest_agency text,
  ADD COLUMN IF NOT EXISTS dest_account_masked text,
  ADD COLUMN IF NOT EXISTS dest_bank_account_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_revenue_split_snapshot_parts_dest_kind_chk'
      AND conrelid = 'public.sale_revenue_split_snapshot_participants'::regclass
  ) THEN
    ALTER TABLE public.sale_revenue_split_snapshot_participants
      ADD CONSTRAINT sale_revenue_split_snapshot_parts_dest_kind_chk
      CHECK (
        dest_bank_account_kind IS NULL
        OR dest_bank_account_kind IN ('CORRENTE', 'POUPANCA', 'PAGAMENTO')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_beneficiary_name IS
  'Titular congelado no freeze (cópia de company_financial_accounts.beneficiary_name).';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_institution IS
  'Instituição/gateway congelada (ex.: Asaas). Não é o banco cadastral.';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_bank_name IS
  'Banco cadastral congelado. Independente do provider/wallet.';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_bank_code IS
  'Código COMPE congelado no freeze.';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_agency IS
  'Agência cadastral congelada no freeze.';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_account_masked IS
  'Conta mascarada no freeze (ex.: ••••8370-3). Nunca senha, token ou API key.';
COMMENT ON COLUMN public.sale_revenue_split_snapshot_participants.dest_bank_account_kind IS
  'Tipo da conta congelado: CORRENTE, POUPANCA ou PAGAMENTO.';

NOTIFY pgrst, 'reload schema';
