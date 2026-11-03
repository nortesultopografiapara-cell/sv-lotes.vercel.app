-- =============================================================================
-- PRODUCTION — ROLLBACK SEGURO
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
-- ROLLBACK SEGURO — só se AINDA NÃO existirem vendas/contratos usando o CUSTOM
-- Remove somente o vínculo LF ESTRELA ↔ CHACREAMENTO ESTRELA DO SUL.
-- Arquiva o modelo user se não houver mais links nem FKs.
-- NUNCA apaga ESTRELA_DO_SUL system_seed.
-- NUNCA altera sales/contracts/projects.contract_model.
-- NÃO desabilita trigger.
-- =============================================================================

BEGIN;

DO $rollback_lf_estrela_prod$
DECLARE
  v_candidate_count int;
  v_project_id uuid;
  v_company_id uuid;
  v_model_id uuid;
  v_sale_count int;
  v_contract_count int;
  v_sale_version_count int;
  v_contract_version_count int;
  v_other_links int;
BEGIN
  SELECT count(*)::int
    INTO v_candidate_count
  FROM public.projects p
  WHERE upper(btrim(regexp_replace(coalesce(p.name, ''), '\s+', ' ', 'g'))) = 'CHACREAMENTO ESTRELA DO SUL';

  IF COALESCE(v_candidate_count, 0) <> 1 THEN
    RAISE EXCEPTION 'ABORT rollback: esperava 1 empreendimento % (count=%)',
      'CHACREAMENTO ESTRELA DO SUL', COALESCE(v_candidate_count, 0);
  END IF;

  SELECT p.id, public.project_company_uuid(p.*)
    INTO v_project_id, v_company_id
  FROM public.projects p
  WHERE upper(btrim(regexp_replace(coalesce(p.name, ''), '\s+', ' ', 'g'))) = 'CHACREAMENTO ESTRELA DO SUL';

  IF v_project_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'ABORT rollback: project_company_uuid NULL';
  END IF;

  SELECT m.id
    INTO v_model_id
  FROM public.company_contract_models m
  WHERE m.company_id = v_company_id
    AND m.source = 'user'
    AND m.catalog_code = 'CUSTOM'
    AND upper(btrim(regexp_replace(m.name, '\s+', ' ', 'g'))) = 'LF ESTRELA'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_model_id IS NULL THEN
    RAISE NOTICE 'Rollback: modelo LF ESTRELA user não encontrado — nada a fazer';
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_sale_count
  FROM public.sales
  WHERE company_contract_model_id = v_model_id;

  SELECT count(*)::int INTO v_contract_count
  FROM public.contracts
  WHERE company_contract_model_id = v_model_id;

  SELECT count(*)::int INTO v_sale_version_count
  FROM public.sales
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = v_model_id
  );

  SELECT count(*)::int INTO v_contract_version_count
  FROM public.contracts
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = v_model_id
  );

  IF v_sale_count > 0
     OR v_contract_count > 0
     OR v_sale_version_count > 0
     OR v_contract_version_count > 0 THEN
    RAISE EXCEPTION
      'ABORT rollback: já existem vendas/contratos usando LF ESTRELA (sales=% contracts=% sale_versions=% contract_versions=%). Não remover.',
      v_sale_count, v_contract_count, v_sale_version_count, v_contract_version_count;
  END IF;

  DELETE FROM public.project_contract_model_links
  WHERE project_id = v_project_id
    AND company_contract_model_id = v_model_id
    AND company_id = v_company_id;

  SELECT count(*)::int INTO v_other_links
  FROM public.project_contract_model_links
  WHERE company_contract_model_id = v_model_id;

  IF v_other_links = 0 THEN
    UPDATE public.company_contract_models
       SET status = 'archived',
           is_company_default = false,
           updated_at = timezone('utc'::text, now())
     WHERE id = v_model_id
       AND company_id = v_company_id
       AND source = 'user'
       AND catalog_code = 'CUSTOM';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_contract_models m
    WHERE m.source = 'system_seed'
      AND m.catalog_code = 'ESTRELA_DO_SUL'
      AND m.company_id = v_company_id
      AND m.status IS DISTINCT FROM 'active'
  ) THEN
    RAISE EXCEPTION 'ABORT rollback: system_seed ESTRELA_DO_SUL não pode ter sido alterado';
  END IF;

  RAISE NOTICE 'Rollback LF ESTRELA: link removido project=% model=% archived_if_unused=%',
    v_project_id, v_model_id, (v_other_links = 0);
END
$rollback_lf_estrela_prod$;

COMMIT;
