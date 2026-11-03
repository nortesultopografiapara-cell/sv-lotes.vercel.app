-- Snapshot contratual LF Imóveis por venda.
-- ADITIVA: coluna nullable, sem backfill, sem UPDATE em sales existentes.
-- NÃO alterar generated_html, contratos assinados nem Production.
-- Shape: { secondVendor, participation, project: { projectName, city, uf, neighborhood, address, contractForum } }.
-- Sem wallet, conta bancária, Split ou gateway.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS lf_contract_snapshot_json jsonb NULL;

COMMENT ON COLUMN public.sales.lf_contract_snapshot_json IS
  'Snapshot imutável da configuração contratual LF Imóveis (ESTRELA_DO_SUL) no momento da criação da venda. NULL = venda anterior à Fase 3; resolver usa projeto → empresa → 40/60. Sem backfill. Não sobrescrever após gravado.';

NOTIFY pgrst, 'reload schema';
