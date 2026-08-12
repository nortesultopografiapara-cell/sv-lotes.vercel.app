-- Modelo de contrato padrão por empreendimento (override opcional do companies.contract_model).
-- NULL = herdar o modelo padrão da empresa.
-- Snapshot em sales/contracts preserva o modelo efetivo usado na geração (histórico).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_model text NULL;

COMMENT ON COLUMN public.projects.contract_model IS
  'Modelo de contrato padrão do empreendimento (PADRAO|MENESES|RECANTO_PRIMAVERA|SV_LOTES_2|CUSTOM). NULL = usar companies.contract_model.';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS contract_model text NULL;

COMMENT ON COLUMN public.sales.contract_model IS
  'Snapshot do modelo de contrato efetivo no momento da venda. Não deve ser sobrescrito por mudanças futuras no projeto/empresa.';

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_model text NULL;

COMMENT ON COLUMN public.contracts.contract_model IS
  'Snapshot do modelo efetivamente usado na geração deste contrato/versão.';
