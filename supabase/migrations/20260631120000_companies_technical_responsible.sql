-- Responsável técnico persistido na empresa (Configurações → Prancha PDF)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS technical_responsible_name text,
  ADD COLUMN IF NOT EXISTS technical_responsible_role text,
  ADD COLUMN IF NOT EXISTS technical_responsible_crea text,
  ADD COLUMN IF NOT EXISTS technical_responsible_cau text,
  ADD COLUMN IF NOT EXISTS technical_responsible_cft text,
  ADD COLUMN IF NOT EXISTS technical_responsible_cpf text,
  ADD COLUMN IF NOT EXISTS technical_responsible_phone text,
  ADD COLUMN IF NOT EXISTS technical_responsible_email text,
  ADD COLUMN IF NOT EXISTS technical_signature_url text,
  ADD COLUMN IF NOT EXISTS technical_stamp_url text;

COMMENT ON COLUMN public.companies.technical_responsible_name IS 'Nome do responsável técnico (prancha/documentos)';
COMMENT ON COLUMN public.companies.technical_responsible_role IS 'Cargo/função do responsável técnico';
COMMENT ON COLUMN public.companies.technical_responsible_crea IS 'Registro CREA';
COMMENT ON COLUMN public.companies.technical_responsible_cau IS 'Registro CAU';
COMMENT ON COLUMN public.companies.technical_responsible_cft IS 'Registro CFT';
COMMENT ON COLUMN public.companies.technical_responsible_cpf IS 'CPF do responsável técnico';
COMMENT ON COLUMN public.companies.technical_responsible_phone IS 'Telefone do responsável técnico';
COMMENT ON COLUMN public.companies.technical_responsible_email IS 'E-mail do responsável técnico';
COMMENT ON COLUMN public.companies.technical_signature_url IS 'Assinatura digital PNG do RT';
COMMENT ON COLUMN public.companies.technical_stamp_url IS 'Carimbo técnico PNG do RT';

-- Copia perfil ativo legado (technical_responsibles) para companies, se ainda vazio
UPDATE public.companies c
SET
  technical_responsible_name = COALESCE(c.technical_responsible_name, tr.name),
  technical_responsible_role = COALESCE(c.technical_responsible_role, tr.title),
  technical_responsible_crea = COALESCE(c.technical_responsible_crea, tr.crea),
  technical_responsible_cau = COALESCE(c.technical_responsible_cau, tr.cau),
  technical_responsible_cft = COALESCE(c.technical_responsible_cft, tr.cft),
  technical_responsible_cpf = COALESCE(c.technical_responsible_cpf, tr.cpf),
  technical_responsible_phone = COALESCE(c.technical_responsible_phone, tr.phone),
  technical_responsible_email = COALESCE(c.technical_responsible_email, tr.email),
  technical_signature_url = COALESCE(c.technical_signature_url, tr.signature_url),
  technical_stamp_url = COALESCE(c.technical_stamp_url, tr.stamp_url)
FROM public.technical_responsibles tr
WHERE tr.company_id = c.id
  AND tr.active IS TRUE;

NOTIFY pgrst, 'reload schema';
