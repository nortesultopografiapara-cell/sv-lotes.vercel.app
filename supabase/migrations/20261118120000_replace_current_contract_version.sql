-- Troca atômica da versão vigente do contrato.
-- A versão anterior permanece. Nenhuma parcela, caixa ou assinatura é apagada.
-- Aplicar somente no Develop, com autorização. Não executar em Production.

CREATE OR REPLACE FUNCTION public.replace_current_contract_version(
  p_source_id uuid,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.contracts%ROWTYPE;
  v_new public.contracts%ROWTYPE;
  v_previous_html text;
  v_status text;
  v_signature text := '';
  v_signed_pdf text := '';
  v_version integer;
  v_html text;
  v_column text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'A regeneração do contrato só pode ser concluída pelo servidor.';
  END IF;
  IF p_source_id IS NULL OR p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'Dados da nova versão ausentes. Nenhuma versão foi alterada.';
  END IF;

  SELECT * INTO v_source
  FROM public.contracts
  WHERE id = p_source_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado. Nenhuma versão foi alterada.';
  END IF;
  IF v_source.sale_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem venda. Nenhuma versão foi alterada.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contract-version:' || v_source.sale_id::text));

  PERFORM 1
  FROM public.contracts
  WHERE sale_id = v_source.sale_id
    AND tenant_id IS NOT DISTINCT FROM v_source.tenant_id
    AND is_current IS TRUE
  FOR UPDATE;

  v_status := lower(trim(COALESCE(v_source.status, '')));
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'signature_status'
  ) THEN
    EXECUTE 'SELECT signature_status FROM public.contracts WHERE id = $1'
      INTO v_signature USING v_source.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'pdf_signed_url'
  ) THEN
    EXECUTE 'SELECT pdf_signed_url FROM public.contracts WHERE id = $1'
      INTO v_signed_pdf USING v_source.id;
  END IF;
  IF v_status IN ('assinado', 'signed')
     OR upper(trim(COALESCE(v_signature, ''))) = 'SIGNED'
     OR COALESCE(v_signed_pdf, '') <> ''
     OR (
       to_regclass('public.contract_signatures') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.contract_signatures
         WHERE contract_id = v_source.id
           AND upper(COALESCE(signature_status, '')) = 'SIGNED'
       )
     )
  THEN
    RAISE EXCEPTION 'Contrato assinado não pode ser substituído. A versão vigente permanece.';
  END IF;

  v_previous_html := v_source.generated_html;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.contracts
  WHERE sale_id = v_source.sale_id;

  v_new := v_source;
  v_new.id := gen_random_uuid();
  v_new.status := 'ativo';
  v_new.is_current := true;
  v_new.version := v_version;
  v_new.regenerated_from := v_source.id;
  v_new.regenerated_at := timezone('utc', now());
  v_new.superseded_by := NULL;
  v_new.pdf_url := NULL;
  v_new.created_at := timezone('utc', now());
  v_html := NULLIF(p_row->>'generated_html', '');
  IF v_html IS NULL THEN
    v_html := NULLIF(p_row->>'html_content', '');
  END IF;
  IF v_html IS NOT NULL THEN
    v_new.generated_html := v_html;
  END IF;
  IF NULLIF(p_row->>'contract_number', '') IS NOT NULL THEN
    v_new.contract_number := p_row->>'contract_number';
  END IF;
  IF NULLIF(p_row->>'regenerated_by', '') IS NOT NULL THEN
    v_new.regenerated_by := (p_row->>'regenerated_by')::uuid;
  END IF;

  UPDATE public.contracts
  SET is_current = false
  WHERE sale_id = v_source.sale_id
    AND tenant_id IS NOT DISTINCT FROM v_source.tenant_id
    AND is_current IS TRUE;

  INSERT INTO public.contracts
  SELECT (v_new).*;

  FOREACH v_column IN ARRAY ARRAY[
    'html_content', 'contract_html', 'content', 'html',
    'pdf_signed_url', 'signature_token', 'signature_status',
    'signature_sent_at', 'signature_viewed_at', 'signed_at',
    'signed_by_name', 'signed_by_cpf', 'signed_ip', 'signed_user_agent',
    'signature_expires_at'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = v_column
    ) THEN
      IF v_column IN ('html_content', 'contract_html', 'content', 'html') THEN
        EXECUTE format('UPDATE public.contracts SET %I = $1 WHERE id = $2', v_column)
          USING COALESCE(v_html, v_new.generated_html), v_new.id;
      ELSE
        EXECUTE format('UPDATE public.contracts SET %I = NULL WHERE id = $1', v_column)
          USING v_new.id;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'needs_regenerar'
  ) THEN
    EXECUTE 'UPDATE public.contracts SET needs_regenerar = false WHERE id = $1'
      USING v_new.id;
  END IF;

  UPDATE public.contracts
  SET status = 'superseded',
      is_current = false,
      superseded_by = v_new.id,
      regenerated_at = v_new.regenerated_at
  WHERE id = v_source.id;

  IF (SELECT generated_html FROM public.contracts WHERE id = v_source.id)
     IS DISTINCT FROM v_previous_html THEN
    RAISE EXCEPTION 'O HTML da versão anterior foi alterado. A regeneração foi desfeita.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_new.id,
    'version', v_version,
    'sourceId', v_source.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_current_contract_version(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_current_contract_version(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_current_contract_version(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_current_contract_version(uuid, jsonb) IS
  'Substitui o contrato vigente em uma transação. Recusa contrato assinado e preserva o HTML anterior.';

NOTIFY pgrst, 'reload schema';
