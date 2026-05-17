ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS frente_oficial TEXT;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS fundo_oficial TEXT;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS dir_oficial TEXT;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS esq_oficial TEXT;

-- notify postgrest
NOTIFY pgrst, 'reload schema';
