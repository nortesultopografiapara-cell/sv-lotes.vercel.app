-- Campos de perfil para usuários OWNER (sócios / proprietários)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS owner_profile_type text,
  ADD COLUMN IF NOT EXISTS owner_document text;

COMMENT ON COLUMN public.users.owner_profile_type IS 'SOCIO | PROPRIETARIO | INVESTIDOR | DONO_AREA';
COMMENT ON COLUMN public.users.owner_document IS 'CPF ou CNPJ opcional do sócio/proprietário';

NOTIFY pgrst, 'reload schema';
