-- Perfil completo do responsável técnico (empresa) — sem ART/TRT permanentes na empresa

ALTER TABLE public.technical_responsibles
  ADD COLUMN IF NOT EXISTS crea text,
  ADD COLUMN IF NOT EXISTS cau text,
  ADD COLUMN IF NOT EXISTS cft text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS stamp_url text;

COMMENT ON COLUMN public.technical_responsibles.crea IS 'Registro CREA do responsável técnico';
COMMENT ON COLUMN public.technical_responsibles.cau IS 'Registro CAU do responsável técnico';
COMMENT ON COLUMN public.technical_responsibles.cft IS 'Registro CFT do responsável técnico';
COMMENT ON COLUMN public.technical_responsibles.cpf IS 'CPF do responsável técnico';
COMMENT ON COLUMN public.technical_responsibles.stamp_url IS 'Carimbo técnico (PNG)';

NOTIFY pgrst, 'reload schema';
