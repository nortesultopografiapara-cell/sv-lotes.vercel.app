ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS area_oficial NUMERIC;

NOTIFY pgrst, 'reload schema';
