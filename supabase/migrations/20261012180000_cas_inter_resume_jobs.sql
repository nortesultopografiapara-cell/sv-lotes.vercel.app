-- CAS atômico dos jobs de retomada Inter em bank_integrations.metadata.
-- Não altera parcelas, bank_charges existentes nem o contrato Canaã.
-- Não aplicar em Production nesta etapa sem autorização.

CREATE OR REPLACE FUNCTION public.cas_inter_resume_jobs(
  p_integration_id uuid,
  p_company_id uuid,
  p_expected_rev integer,
  p_jobs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_current_rev integer;
BEGIN
  IF p_integration_id IS NULL OR p_company_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_jobs IS NULL OR jsonb_typeof(p_jobs) <> 'object' THEN
    RAISE EXCEPTION 'cas_inter_resume_jobs: p_jobs deve ser objeto JSON';
  END IF;

  SELECT metadata
    INTO v_meta
    FROM public.bank_integrations
   WHERE id = p_integration_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_current_rev := COALESCE((v_meta->'inter_sale_charge_jobs'->>'_rev')::integer, 0);
  IF v_current_rev IS DISTINCT FROM COALESCE(p_expected_rev, 0) THEN
    RETURN NULL;
  END IF;

  v_meta := jsonb_set(
    COALESCE(v_meta, '{}'::jsonb),
    '{inter_sale_charge_jobs}',
    p_jobs,
    true
  );

  UPDATE public.bank_integrations
     SET metadata = v_meta,
         updated_at = now()
   WHERE id = p_integration_id
     AND company_id = p_company_id;

  RETURN v_meta;
END;
$$;

COMMENT ON FUNCTION public.cas_inter_resume_jobs(uuid, uuid, integer, jsonb) IS
  'Compare-and-swap de inter_sale_charge_jobs (revisão _rev) sob row lock. Sem efeito em finance_receipts.';

REVOKE ALL ON FUNCTION public.cas_inter_resume_jobs(uuid, uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cas_inter_resume_jobs(uuid, uuid, integer, jsonb) TO service_role;
