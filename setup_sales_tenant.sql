DO $$ 
BEGIN
  -- blocks
  ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS customer_id UUID;
  ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS sale_id UUID;
  ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS contract_id UUID;

  -- sales
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS company_id UUID;
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tenant_id UUID;

  -- contracts
  ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS company_id UUID;
  ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS tenant_id UUID;

  -- finance_receipts
  ALTER TABLE public.finance_receipts ADD COLUMN IF NOT EXISTS company_id UUID;
  ALTER TABLE public.finance_receipts ADD COLUMN IF NOT EXISTS tenant_id UUID;

  -- customers
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id UUID;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id UUID;
END $$;
