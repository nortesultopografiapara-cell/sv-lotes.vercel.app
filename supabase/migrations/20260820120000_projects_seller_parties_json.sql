-- Migration ADITIVA (NÃO aplicar remotamente sem autorização explícita).
-- Objetivo: permitir promitentes vendedores por empreendimento (Araguaia / futuro Mundo Novo).
-- Retrocompatível: coluna nullable, sem backfill, sem alteração de defaults.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS seller_parties_json jsonb NULL;

COMMENT ON COLUMN public.projects.seller_parties_json IS
  'Promitentes vendedores do empreendimento (JSON array). Usado por modelos como ARAGUAIA; NULL = herdar defaults do modelo quando aplicável.';
