-- Exclusão segura de modelos CUSTOM/user descartáveis.
-- Aditivo. Develop somente. Sem generated_html, GIS, Production.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.delete_company_contract_model(p_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model public.company_contract_models%ROWTYPE;
  v_link_count integer;
  v_sale_count integer;
  v_contract_count integer;
  v_sale_version_count integer;
  v_contract_version_count integer;
BEGIN
  IF p_model_id IS NULL THEN
    RAISE EXCEPTION 'Modelo não encontrado';
  END IF;

  SELECT * INTO v_model
  FROM public.company_contract_models
  WHERE id = p_model_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo não encontrado';
  END IF;

  IF NOT public.is_super_admin()
     AND v_model.company_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Modelo não pertence à empresa atual';
  END IF;

  IF v_model.source = 'system_seed' THEN
    RAISE EXCEPTION 'Modelos de origem do sistema não podem ser excluídos.';
  END IF;

  IF v_model.source IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'Somente modelos criados pela empresa podem ser excluídos.';
  END IF;

  IF v_model.is_company_default THEN
    RAISE EXCEPTION 'Este modelo não pode ser excluído porque é o padrão da empresa.';
  END IF;

  SELECT count(*)::integer INTO v_link_count
  FROM public.project_contract_model_links
  WHERE company_contract_model_id = p_model_id;

  IF v_link_count > 0 THEN
    RAISE EXCEPTION 'Este modelo está associado a um empreendimento.';
  END IF;

  SELECT count(*)::integer INTO v_sale_count
  FROM public.sales
  WHERE company_contract_model_id = p_model_id;

  SELECT count(*)::integer INTO v_contract_count
  FROM public.contracts
  WHERE company_contract_model_id = p_model_id;

  SELECT count(*)::integer INTO v_sale_version_count
  FROM public.sales
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = p_model_id
  );

  SELECT count(*)::integer INTO v_contract_version_count
  FROM public.contracts
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = p_model_id
  );

  IF v_sale_count > 0
     OR v_contract_count > 0
     OR v_sale_version_count > 0
     OR v_contract_version_count > 0 THEN
    RAISE EXCEPTION 'Este modelo já foi utilizado em uma venda ou contrato e deve permanecer no histórico.';
  END IF;

  DELETE FROM public.company_contract_models
  WHERE id = p_model_id
    AND company_id = v_model.company_id
    AND source = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A exclusão do modelo não foi concluída.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_model_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_contract_model(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_company_contract_model(uuid) TO authenticated, service_role;

REVOKE DELETE ON TABLE public.company_contract_models FROM authenticated;
REVOKE DELETE ON TABLE public.company_contract_model_versions FROM authenticated;

NOTIFY pgrst, 'reload schema';
