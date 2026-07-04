-- Recanto Primavera: sinal contratual parcial (pago no ato + restante nas parcelas).
-- Campos nullable — não alteram vendas antigas nem o modelo Meneses/PADRAO.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS signal_contract_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_paid_at_sale numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_remaining_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_remaining_payment_mode text,
  ADD COLUMN IF NOT EXISTS signal_remaining_installments integer,
  ADD COLUMN IF NOT EXISTS signal_remaining_installment_value numeric(15,2);

COMMENT ON COLUMN public.sales.signal_contract_value IS
  'Recanto: valor do sinal contratado (não abate o lote).';
COMMENT ON COLUMN public.sales.signal_paid_at_sale IS
  'Recanto: valor do sinal pago no ato da venda.';
COMMENT ON COLUMN public.sales.signal_remaining_value IS
  'Recanto: saldo do sinal (contratado - pago no ato).';
COMMENT ON COLUMN public.sales.signal_remaining_payment_mode IS
  'Recanto: FIRST_INSTALLMENTS | ALL_INSTALLMENTS.';
COMMENT ON COLUMN public.sales.signal_remaining_installments IS
  'Recanto: qtd de parcelas que recebem o acréscimo do restante do sinal.';
COMMENT ON COLUMN public.sales.signal_remaining_installment_value IS
  'Recanto: valor do acréscimo por parcela referente ao restante do sinal.';

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS base_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS signal_addon_amount numeric(15,2);

COMMENT ON COLUMN public.finance_receipts.base_amount IS
  'Valor base da parcela do lote (sem acréscimo do restante do sinal Recanto).';
COMMENT ON COLUMN public.finance_receipts.signal_addon_amount IS
  'Acréscimo do restante do sinal Recanto nesta parcela.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_signal_remaining_payment_mode_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_signal_remaining_payment_mode_check
      CHECK (
        signal_remaining_payment_mode IS NULL
        OR signal_remaining_payment_mode IN ('FIRST_INSTALLMENTS', 'ALL_INSTALLMENTS')
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
