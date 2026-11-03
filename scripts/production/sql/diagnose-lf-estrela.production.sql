-- =============================================================================
-- PRODUCTION — DIAGNÓSTICO SOMENTE LEITURA
-- Destino: aezktedncttwpqeunjej
-- NÃO executar no DEVELOP hoynysmynxncdlptuzub
-- NÃO reutiliza UUID de empreendimento/empresa de outro ambiente
-- Resolve CHACREAMENTO ESTRELA DO SUL pelo nome normalizado no banco onde rodar
-- NÃO altera projects.company_id / tenant_id / contract_model
-- NÃO desabilita trigger (incluindo trg_project_contract_model_link_tenant)
-- NÃO desabilita RLS
-- NÃO apaga ESTRELA_DO_SUL system_seed
-- Pressupõe migrations:
--   20261028120000_contract_model_central_foundation.sql
--   20261028121000_contract_model_version_draft_history.sql
--   20261028122000_delete_company_contract_model.sql
--   20261029120000_customers_nationality_companies_creci.sql
-- =============================================================================

-- =============================================================================
-- PASSO 1 — SOMENTE LEITURA
-- Rode este SELECT sozinho em Production ANTES de qualquer publicação.
-- Não INSERT / UPDATE / DELETE. Não desabilita trigger. Não muda o motor TS.
-- Nome resolvido (normalizado): CHACREAMENTO ESTRELA DO SUL
-- Pressupõe as 4 migrations da Central já aplicadas.
-- =============================================================================

WITH normalized AS (
  SELECT
    p.id,
    p.name,
    nullif(btrim(to_jsonb(p)->>'company_id'), '') AS project_company_col,
    nullif(btrim(to_jsonb(p)->>'tenant_id'), '') AS project_tenant_col,
    public.project_company_uuid(p.*) AS project_company_uuid,
    p.contract_model::text AS project_engine
  FROM public.projects p
  WHERE upper(btrim(regexp_replace(coalesce(p.name, ''), '\s+', ' ', 'g'))) = 'CHACREAMENTO ESTRELA DO SUL'
),
counted AS (
  SELECT count(*)::int AS candidate_count FROM normalized
),
one AS (
  SELECT n.*
  FROM normalized n
  WHERE (SELECT candidate_count FROM counted) = 1
)
SELECT
  c.candidate_count,
  o.id AS project_id,
  o.name AS project_name,
  o.project_company_col AS company_id,
  o.project_tenant_col AS tenant_id,
  o.project_company_uuid,
  o.project_engine AS contract_model,
  co.id AS company_found_id,
  co.name AS company_found_name,
  (
    SELECT string_agg(n.id::text || ' | ' || n.name, ' ; ' ORDER BY n.name, n.id)
    FROM normalized n
  ) AS candidates_dump,
  CASE
    WHEN to_regclass('public.company_contract_models') IS NULL
      THEN 'ABORT: migration 20261028120000 não aplicada (company_contract_models)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'project_company_uuid'
    )
      THEN 'ABORT: migration 20261028120000 não aplicada (project_company_uuid)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'publish_company_contract_model_version'
    )
      THEN 'ABORT: migration 20261028121000 não aplicada'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'delete_company_contract_model'
    )
      THEN 'ABORT: migration 20261028122000 não aplicada'
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'nationality'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'creci'
    )
      THEN 'ABORT: migration 20261029120000 não aplicada'
    WHEN c.candidate_count = 0
      THEN 'ABORT: 0 empreendimentos com nome CHACREAMENTO ESTRELA DO SUL'
    WHEN c.candidate_count > 1
      THEN 'ABORT: mais de 1 empreendimento com nome CHACREAMENTO ESTRELA DO SUL'
    WHEN o.project_company_uuid IS NULL
      THEN 'ABORT: project_company_uuid IS NULL (company_id e tenant_id sem UUID)'
    WHEN co.id IS NULL
      THEN 'ABORT: empresa não existe para project_company_uuid'
    WHEN o.project_company_col ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND o.project_tenant_col ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND o.project_company_col IS DISTINCT FROM o.project_tenant_col
      THEN 'ABORT: divergência tenant/company (company_id UUID ≠ tenant_id UUID)'
    ELSE 'OK — somente leitura; ainda não publica. Conferir 1 linha e project_engine.'
  END AS diagnostic_status
FROM counted c
LEFT JOIN one o ON TRUE
LEFT JOIN public.companies co ON co.id = o.project_company_uuid;
