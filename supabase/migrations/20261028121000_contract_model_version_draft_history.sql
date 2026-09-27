-- CUSTOM: rascunho (documento de trabalho, version=0) separado de versões published imutáveis.
-- Publicar = INSERT de nova linha published. NUNCA UPDATE draft → published.
-- Aditivo. Develop somente. Sem generated_html, GIS, Production.
-- Idempotente. Já aplicada no Develop hoynysmynxncdlptuzub.

DROP INDEX IF EXISTS public.uq_company_contract_model_versions_one_published;

DO $drop_version_chk$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.company_contract_model_versions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ~* 'version'
      AND pg_get_constraintdef(c.oid) ~* '>=\s*1'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.company_contract_model_versions DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END
$drop_version_chk$;

DO $add_status_version_chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.company_contract_model_versions'::regclass
      AND conname = 'company_contract_model_versions_status_version_chk'
  ) THEN
    ALTER TABLE public.company_contract_model_versions
      ADD CONSTRAINT company_contract_model_versions_status_version_chk
      CHECK (
        (status = 'draft' AND version = 0)
        OR (status = 'published' AND version >= 1)
      );
  END IF;
END
$add_status_version_chk$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contract_model_versions_one_draft
  ON public.company_contract_model_versions (model_id)
  WHERE status = 'draft';

ALTER TABLE public.company_contract_model_versions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;

ALTER TABLE public.company_contract_model_versions
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

COMMENT ON TABLE public.company_contract_model_versions IS
  'Draft (version=0) é o documento de trabalho. Published (v1+) nasce por INSERT e é imutável. content_html só para CUSTOM.';

UPDATE public.company_contract_model_versions
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

CREATE OR REPLACE FUNCTION public.protect_published_contract_model_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.content_html IS DISTINCT FROM OLD.content_html
       OR NEW.engine_params_json IS DISTINCT FROM OLD.engine_params_json
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.model_id IS DISTINCT FROM OLD.model_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Versão publicada de modelo é imutável';
    END IF;
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.version IS DISTINCT FROM OLD.version
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.model_id IS DISTINCT FROM OLD.model_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Rascunho não muda identidade/status; publique com INSERT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_published_contract_model_version
  ON public.company_contract_model_versions;
CREATE TRIGGER trg_protect_published_contract_model_version
  BEFORE UPDATE ON public.company_contract_model_versions
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_published_contract_model_version();

CREATE OR REPLACE FUNCTION public.ensure_company_contract_model_draft(p_model_id uuid)
RETURNS SETOF public.company_contract_model_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.company_contract_models%ROWTYPE;
  v_draft public.company_contract_model_versions%ROWTYPE;
  v_source public.company_contract_model_versions%ROWTYPE;
BEGIN
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

  IF v_model.catalog_code IS DISTINCT FROM 'CUSTOM' THEN
    RAISE EXCEPTION 'Rascunho HTML só é permitido para modelos CUSTOM';
  END IF;

  SELECT * INTO v_draft
  FROM public.company_contract_model_versions
  WHERE model_id = p_model_id
    AND status = 'draft'
  FOR UPDATE;

  IF FOUND THEN
    RETURN NEXT v_draft;
    RETURN;
  END IF;

  SELECT * INTO v_source
  FROM public.company_contract_model_versions
  WHERE model_id = p_model_id
    AND status = 'published'
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;

  INSERT INTO public.company_contract_model_versions (
    model_id,
    company_id,
    version,
    status,
    content_html,
    engine_params_json,
    created_by,
    updated_at,
    published_at
  ) VALUES (
    v_model.id,
    v_model.company_id,
    0,
    'draft',
    COALESCE(v_source.content_html, ''),
    v_source.engine_params_json,
    auth.uid(),
    timezone('utc'::text, now()),
    NULL
  )
  RETURNING * INTO v_draft;

  RETURN NEXT v_draft;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_company_contract_model_version(p_model_id uuid)
RETURNS SETOF public.company_contract_model_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.company_contract_models%ROWTYPE;
  v_draft public.company_contract_model_versions%ROWTYPE;
  v_next integer;
  v_published public.company_contract_model_versions%ROWTYPE;
  v_now timestamptz := timezone('utc'::text, now());
BEGIN
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

  IF v_model.catalog_code IS DISTINCT FROM 'CUSTOM' THEN
    RAISE EXCEPTION 'Publicação HTML só é permitida para modelos CUSTOM';
  END IF;

  SELECT * INTO v_draft
  FROM public.company_contract_model_versions
  WHERE model_id = p_model_id
    AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não há rascunho para publicar';
  END IF;

  PERFORM 1
  FROM public.company_contract_model_versions
  WHERE model_id = p_model_id
    AND status = 'published'
  FOR UPDATE;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next
  FROM public.company_contract_model_versions
  WHERE model_id = p_model_id
    AND status = 'published';

  INSERT INTO public.company_contract_model_versions (
    model_id,
    company_id,
    version,
    status,
    content_html,
    engine_params_json,
    created_by,
    updated_at,
    published_at
  ) VALUES (
    v_draft.model_id,
    v_draft.company_id,
    v_next,
    'published',
    v_draft.content_html,
    v_draft.engine_params_json,
    COALESCE(auth.uid(), v_draft.created_by),
    NULL,
    v_now
  )
  RETURNING * INTO v_published;

  RETURN NEXT v_published;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_company_contract_model_draft(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_company_contract_model_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_company_contract_model_draft(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_company_contract_model_version(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
