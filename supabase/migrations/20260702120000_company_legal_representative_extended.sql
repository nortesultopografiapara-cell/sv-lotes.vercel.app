-- Campos aditivos nullable — representante legal e layout de configurações.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_representative_role TEXT,
  ADD COLUMN IF NOT EXISTS legal_representative_email TEXT,
  ADD COLUMN IF NOT EXISTS legal_representative_phone TEXT,
  ADD COLUMN IF NOT EXISTS use_technical_as_legal_rep BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settings_layout TEXT;

COMMENT ON COLUMN public.companies.settings_layout IS
  'legacy | v2 — controla layout da tela Configurações. Null = resolver automático por ID/data.';

COMMENT ON COLUMN public.companies.use_technical_as_legal_rep IS
  'Quando true, dados do responsável técnico preenchem representante legal (somente se usuário marcar).';
