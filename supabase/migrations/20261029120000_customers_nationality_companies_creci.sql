-- DEVELOP: fontes cadastrais para o modelo CUSTOM LF ESTRELA.
-- Additive. Não altera contratos emitidos nem o motor ESTRELA_DO_SUL.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS nationality text;

COMMENT ON COLUMN public.customers.nationality IS
  'Nacionalidade do comprador (contratos CUSTOM / LF ESTRELA). Sem default jurídico.';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS creci text;

COMMENT ON COLUMN public.companies.creci IS
  'CRECI da empresa. Opcional no LF ESTRELA — o trecho só aparece se preenchido.';
