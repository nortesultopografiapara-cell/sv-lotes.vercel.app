ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS project_name_snapshot text,
ADD COLUMN IF NOT EXISTS project_city_snapshot text,
ADD COLUMN IF NOT EXISTS project_uf_snapshot text,
ADD COLUMN IF NOT EXISTS forum_city_snapshot text;

NOTIFY pgrst, 'reload schema';
