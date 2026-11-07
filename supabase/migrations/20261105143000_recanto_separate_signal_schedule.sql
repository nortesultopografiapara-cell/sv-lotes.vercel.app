-- Recanto Primavera: sinal parcelado em cronograma próprio.
-- Idempotente. Aplicar em Production somente após a leitura do catálogo e a autorização.
-- Linhas antigas permanecem com signal_schedule_mode e schedule_group nulos.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS signal_schedule_mode text,
  ADD COLUMN IF NOT EXISTS signal_installment_count integer,
  ADD COLUMN IF NOT EXISTS signal_first_due_date date,
  ADD COLUMN IF NOT EXISTS lot_schedule_start_mode text,
  ADD COLUMN IF NOT EXISTS lot_schedule_first_due_date date,
  ADD COLUMN IF NOT EXISTS hold_lot_charges_until_signal_settled boolean,
  ADD COLUMN IF NOT EXISTS separate_signal_request_key text;

COMMENT ON COLUMN public.sales.signal_schedule_mode IS
  'NULL ou EMBEDDED: saldo do sinal continua nas parcelas do lote. SEPARATE: sinal e lote em cronogramas distintos.';
COMMENT ON COLUMN public.sales.signal_installment_count IS
  'Quantidade de parcelas futuras do sinal na modalidade SEPARATE.';
COMMENT ON COLUMN public.sales.signal_first_due_date IS
  'Primeiro vencimento das parcelas futuras do sinal.';
COMMENT ON COLUMN public.sales.lot_schedule_start_mode IS
  'AFTER_SIGNAL, SIMULTANEOUS ou SPECIFIC_DATE. Só vale na modalidade SEPARATE.';
COMMENT ON COLUMN public.sales.lot_schedule_first_due_date IS
  'Primeiro vencimento das parcelas do lote na modalidade SEPARATE.';
COMMENT ON COLUMN public.sales.hold_lot_charges_until_signal_settled IS
  'Pedido visual de reter boletos do lote até quitar o sinal. Nesta fase não emite nem bloqueia cobrança.';
COMMENT ON COLUMN public.sales.separate_signal_request_key IS
  'Chave da confirmação. A mesma chave não gera outro cronograma.';

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS schedule_group text;

COMMENT ON COLUMN public.finance_receipts.schedule_group IS
  'NULL: recebível antigo. SIGNAL: cronograma do sinal. LOT: parcelas somente do preço do lote, sem acréscimo de sinal.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_signal_schedule_mode_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_signal_schedule_mode_check
      CHECK (
        signal_schedule_mode IS NULL
        OR signal_schedule_mode IN ('EMBEDDED', 'SEPARATE')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_lot_schedule_start_mode_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_lot_schedule_start_mode_check
      CHECK (
        lot_schedule_start_mode IS NULL
        OR lot_schedule_start_mode IN ('AFTER_SIGNAL', 'SIMULTANEOUS', 'SPECIFIC_DATE')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_separate_signal_without_embedded_mode_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_separate_signal_without_embedded_mode_check
      CHECK (
        signal_schedule_mode IS DISTINCT FROM 'SEPARATE'
        OR (
          signal_remaining_payment_mode IS NULL
          AND signal_remaining_installments IS NULL
          AND signal_remaining_installment_value IS NULL
          AND tenant_id IS NOT NULL
          AND company_id IS NOT DISTINCT FROM tenant_id
          AND separate_signal_request_key IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_receipts_schedule_group_check'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts
      ADD CONSTRAINT finance_receipts_schedule_group_check
      CHECK (
        schedule_group IS NULL
        OR schedule_group IN ('SIGNAL', 'LOT')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_receipts_separate_lot_without_signal_addon_check'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts
      ADD CONSTRAINT finance_receipts_separate_lot_without_signal_addon_check
      CHECK (
        schedule_group IS DISTINCT FROM 'LOT'
        OR signal_addon_amount IS NULL
        OR signal_addon_amount = 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_receipts_separate_signal_without_addon_check'
      AND conrelid = 'public.finance_receipts'::regclass
  ) THEN
    ALTER TABLE public.finance_receipts
      ADD CONSTRAINT finance_receipts_separate_signal_without_addon_check
      CHECK (
        schedule_group IS DISTINCT FROM 'SIGNAL'
        OR signal_addon_amount IS NULL
        OR signal_addon_amount = 0
      );
  END IF;
END $$;

-- Não existe índice único (sale_id, installment_number) em finance_receipts.
-- O único (sale_id, installment_number) conhecido está em sale_balloon_installments.
-- O índice abaixo é parcial: recebíveis antigos, com schedule_group nulo, ficam de fora.
-- SIGNAL 1 e LOT 1 da mesma venda não conflitam. Dentro do grupo, o número não se repete.
CREATE UNIQUE INDEX IF NOT EXISTS finance_receipts_sale_group_installment_uidx
  ON public.finance_receipts (sale_id, schedule_group, installment_number)
  WHERE schedule_group IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_separate_signal_request_key_uidx
  ON public.sales (tenant_id, separate_signal_request_key)
  WHERE separate_signal_request_key IS NOT NULL;

-- RLS existente, não recriada nesta migration:
-- sales: tenant_isolation_sales (tenant_id ou company_id = current_tenant_id()).
-- finance_receipts: tenant_isolation_finance_receipts (tenant_id = current_tenant_id()).
-- A gravação SEPARATE precisa preencher tenant_id e company_id com a empresa autenticada.
-- Nenhuma policy é recriada, nenhum recebível antigo é reescrito e não há backfill.

NOTIFY pgrst, 'reload schema';
