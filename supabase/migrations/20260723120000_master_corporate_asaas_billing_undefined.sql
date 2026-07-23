-- Fase 7.1c — billing_type UNDEFINED (PIX + Boleto na fatura Asaas)
ALTER TABLE public.master_corporate_asaas_charges
  DROP CONSTRAINT IF EXISTS master_corporate_asaas_charges_billing_type_check;

ALTER TABLE public.master_corporate_asaas_charges
  DROP CONSTRAINT IF EXISTS master_corp_asaas_charges_billing_type_check;

-- Nome gerado pelo Postgres a partir do CHECK inline da migration 7.1
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.master_corporate_asaas_charges'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%billing_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.master_corporate_asaas_charges DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.master_corporate_asaas_charges'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%billing_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.master_corporate_asaas_charges
  ADD CONSTRAINT master_corp_asaas_charges_billing_type_check
  CHECK (billing_type IN ('PIX', 'BOLETO', 'UNDEFINED'));

COMMENT ON COLUMN public.master_corporate_asaas_charges.billing_type IS
  'PIX | BOLETO | UNDEFINED (fatura Asaas com PIX + boleto)';
