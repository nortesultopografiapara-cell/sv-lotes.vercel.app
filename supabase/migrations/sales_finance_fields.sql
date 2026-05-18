ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_value decimal default 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS final_value decimal default 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS down_payment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS first_installment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS installment_value decimal default 0;

-- Drop foreign key on lot_id from sales to point to blocks if it points to lots, just to be safe, because the app inserts blocks instead of lots. But wait, we can just allow it to point to blocks.
-- Wait, the `sales` table lot_id points to `lots(id)`. If `blocks` and `lots` are different tables, and `lot.id` in GISMap is a block id, inserting into `sales` will fail foreign key constraint!
-- Let's check `sales` constraints.
