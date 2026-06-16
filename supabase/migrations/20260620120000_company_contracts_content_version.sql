-- Versão do modelo jurídico do contrato SaaS (v1 legado, v2 assinatura eletrônica)

ALTER TABLE public.company_contracts
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.company_contracts.content_version IS
  'Versão do modelo jurídico usado na geração do PDF (1=legado, 2=assinatura eletrônica integrada).';

NOTIFY pgrst, 'reload schema';
