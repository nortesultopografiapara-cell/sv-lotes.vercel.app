-- Snapshot imutável da política de encerramento vigente na data da venda.
-- Aditivo: apenas ADD COLUMN IF NOT EXISTS + CHECKs leves.
-- Sem remover coluna, sem apagar linhas, sem esvaziar tabelas, sem rewrite de dados comerciais.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS termination_policy_snapshot jsonb NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS termination_policy_version text NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS termination_policy_source text NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS termination_policy_snapshot jsonb NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS termination_policy_version text NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS termination_policy_source text NULL;

COMMENT ON COLUMN public.sales.termination_policy_snapshot IS
  'Snapshot JSON da política de encerramento vigente na data da venda. Imutável em regeneração documental.';

COMMENT ON COLUMN public.sales.termination_policy_version IS
  'Versão da política congelada na venda (ex.: araguaia.clause3.item8.v1).';

COMMENT ON COLUMN public.sales.termination_policy_source IS
  'Origem do snapshot: catalog (captura na criação) ou backfill_inferred (legado).';

COMMENT ON COLUMN public.contracts.termination_policy_snapshot IS
  'Cópia documental do snapshot de encerramento da venda nesta versão do contrato.';

COMMENT ON COLUMN public.contracts.termination_policy_version IS
  'Versão da política copiada da venda nesta versão documental.';

COMMENT ON COLUMN public.contracts.termination_policy_source IS
  'Origem do snapshot copiado para esta versão do contrato.';

DO $$
BEGIN
  ALTER TABLE public.sales
    ADD CONSTRAINT sales_termination_policy_source_check
    CHECK (
      termination_policy_source IS NULL
      OR termination_policy_source IN ('catalog', 'backfill_inferred')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_termination_policy_source_check
    CHECK (
      termination_policy_source IS NULL
      OR termination_policy_source IN ('catalog', 'backfill_inferred')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
