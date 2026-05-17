ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS frente NUMERIC;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS fundo NUMERIC;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS lado_direito NUMERIC;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS lado_esquerdo NUMERIC;

NOTIFY pgrst, 'reload schema';
