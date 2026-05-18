ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_value decimal default 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS final_value decimal default 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS down_payment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS first_installment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS installment_value decimal default 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS block_id uuid references public.blocks(id);
ALTER TABLE public.sales ALTER COLUMN lot_id DROP NOT NULL;
