-- Fase 4.1.1 — Resumo financeiro do projeto (Master Topografia)
-- Isolado: apenas coluna na tabela corporativa Master. Sem tabelas financeiras.

ALTER TABLE public.master_topography_projects
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (valor_recebido >= 0);

COMMENT ON COLUMN public.master_topography_projects.valor_recebido IS
  'Entrada/adiantamento já recebido do projeto corporativo (não é caixa consolidado).';

-- Garante consistência: recebido não pode exceder contratado quando ambos informados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'master_topo_projects_received_lte_contract'
  ) THEN
    ALTER TABLE public.master_topography_projects
      ADD CONSTRAINT master_topo_projects_received_lte_contract
      CHECK (
        contract_value IS NULL
        OR valor_recebido <= contract_value
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
