-- Persistência atômica da configuração C6 Bank.
-- Uma função plpgsql executa uma única transação: qualquer falha desfaz tudo.
-- Não executar sem autorização explícita.
-- Não aplicar no Develop nem em Production nesta etapa.
-- Nome e assinatura conferidos no repositório em 2026-11-21: não existe
-- save_company_c6_bank_config nem outra função public.save_*.

BEGIN;

CREATE FUNCTION public.save_company_c6_bank_config(
  p_company_id uuid,
  p_environment text,
  p_client_id text,
  p_certificate_name text,
  p_boleto boolean,
  p_bolepix boolean,
  p_oauth_payload text,
  p_certificate_payload text,
  p_financial_account_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_integration public.bank_integrations%ROWTYPE;
  v_account public.company_financial_accounts%ROWTYPE;
  v_provider text;
  v_metadata jsonb;
  v_boleto boolean;
  v_bolepix boolean;
  v_count integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada.';
  END IF;
  IF p_environment IS DISTINCT FROM 'SANDBOX' AND p_environment IS DISTINCT FROM 'PRODUCTION' THEN
    RAISE EXCEPTION 'Ambiente inválido.';
  END IF;
  IF p_oauth_payload IS NOT NULL AND p_oauth_payload !~ '^v1:' THEN
    RAISE EXCEPTION 'Credencial OAuth recusada.';
  END IF;
  IF p_certificate_payload IS NOT NULL AND p_certificate_payload !~ '^v1:' THEN
    RAISE EXCEPTION 'Credencial de certificado recusada.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('c6-config:' || p_company_id::text));

  SELECT * INTO v_integration
  FROM public.bank_integrations
  WHERE company_id = p_company_id
    AND provider = 'C6'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  -- Endurecimento: recusa estado inconsistente mesmo sem novos segredos no PUT.
  IF v_integration.id IS NOT NULL THEN
    SELECT count(*)::integer INTO v_count
    FROM public.bank_credentials
    WHERE integration_id = v_integration.id
      AND company_id = p_company_id
      AND credential_type = 'oauth';
    IF v_count > 1 THEN
      RAISE EXCEPTION 'Credencial OAuth duplicada nesta integração C6.';
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM public.bank_credentials
    WHERE integration_id = v_integration.id
      AND company_id = p_company_id
      AND credential_type = 'certificate';
    IF v_count > 1 THEN
      RAISE EXCEPTION 'Credencial de certificado duplicada nesta integração C6.';
    END IF;
  END IF;

  IF p_financial_account_id IS NOT NULL THEN
    SELECT * INTO v_account
    FROM public.company_financial_accounts
    WHERE id = p_financial_account_id
      AND company_id = p_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta financeira não encontrada nesta empresa.';
    END IF;
    IF v_account.bank_integration_id IS NOT NULL
       AND v_account.bank_integration_id IS DISTINCT FROM v_integration.id THEN
      SELECT provider INTO v_provider
      FROM public.bank_integrations
      WHERE id = v_account.bank_integration_id
        AND company_id = p_company_id;
      IF NOT FOUND OR v_provider IS NULL THEN
        RAISE EXCEPTION 'Conta financeira não encontrada nesta empresa.';
      ELSIF v_provider IN ('ASAAS_COMPANY', 'ASAAS') THEN
        RAISE EXCEPTION 'Esta conta já está vinculada ao Asaas.';
      ELSIF v_provider = 'INTER' THEN
        RAISE EXCEPTION 'Esta conta já está vinculada ao Banco Inter.';
      ELSIF v_provider <> 'C6' THEN
        RAISE EXCEPTION 'Esta conta já está vinculada a outro provedor.';
      ELSE
        RAISE EXCEPTION 'Esta conta já está vinculada a outra integração C6.';
      END IF;
    END IF;
  END IF;

  v_boleto := COALESCE(v_integration.metadata #> '{c6,boleto}', 'false'::jsonb) = 'true'::jsonb;
  v_bolepix := COALESCE(v_integration.metadata #> '{c6,bolepix}', 'false'::jsonb) = 'true'::jsonb;

  IF v_integration.id IS NOT NULL
     AND p_oauth_payload IS NULL
     AND p_certificate_payload IS NULL
     AND p_environment = v_integration.environment
     AND p_client_id IS NOT DISTINCT FROM v_integration.client_id
     AND p_certificate_name IS NOT DISTINCT FROM v_integration.certificate_name
     AND COALESCE(p_boleto, false) IS NOT DISTINCT FROM v_boleto
     AND COALESCE(p_bolepix, false) IS NOT DISTINCT FROM v_bolepix
     AND (
       p_financial_account_id IS NULL
       OR v_account.bank_integration_id IS NOT DISTINCT FROM v_integration.id
     ) THEN
    RETURN jsonb_build_object('unchanged', true, 'id', v_integration.id);
  END IF;

  v_metadata := COALESCE(v_integration.metadata, '{}'::jsonb);
  v_metadata := jsonb_set(
    v_metadata,
    '{c6}',
    COALESCE(v_metadata->'c6', '{}'::jsonb) || jsonb_build_object(
      'boleto', COALESCE(p_boleto, false),
      'bolepix', COALESCE(p_bolepix, false),
      'emission_enabled', false,
      'webhook_enabled', false,
      'settlement_enabled', false
    ),
    true
  );

  IF v_integration.id IS NULL THEN
    IF p_client_id IS NULL OR length(btrim(p_client_id)) = 0
       OR p_oauth_payload IS NULL OR p_certificate_payload IS NULL THEN
      RAISE EXCEPTION 'A primeira configuração C6 exige Client ID, segredo e certificado.';
    END IF;
    INSERT INTO public.bank_integrations (
      company_id, provider, bank_provider, environment, status, client_id,
      certificate_name, is_default, active, metadata, configured_at, updated_at
    ) VALUES (
      p_company_id, 'C6', 'C6', p_environment, 'DRAFT', p_client_id,
      p_certificate_name, false, false, v_metadata, now(), now()
    )
    RETURNING * INTO v_integration;
    IF v_integration.id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível criar a integração C6.';
    END IF;
  ELSE
    UPDATE public.bank_integrations
    SET environment = p_environment,
        client_id = COALESCE(NULLIF(btrim(p_client_id), ''), client_id),
        certificate_name = p_certificate_name,
        metadata = v_metadata,
        configured_at = COALESCE(configured_at, now()),
        updated_at = now()
    WHERE id = v_integration.id
      AND company_id = p_company_id
      AND provider = 'C6'
    RETURNING * INTO v_integration;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integração C6 não encontrada nesta empresa.';
    END IF;
  END IF;

  IF p_oauth_payload IS NOT NULL THEN
    UPDATE public.bank_credentials
    SET encrypted_payload = p_oauth_payload,
        updated_at = now()
    WHERE integration_id = v_integration.id
      AND company_id = p_company_id
      AND credential_type = 'oauth';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      INSERT INTO public.bank_credentials (
        integration_id, company_id, credential_type, encrypted_payload, updated_at
      ) VALUES (
        v_integration.id, p_company_id, 'oauth', p_oauth_payload, now()
      );
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Não foi possível gravar a credencial OAuth.';
    END IF;
  END IF;

  IF p_certificate_payload IS NOT NULL THEN
    UPDATE public.bank_credentials
    SET encrypted_payload = p_certificate_payload,
        updated_at = now()
    WHERE integration_id = v_integration.id
      AND company_id = p_company_id
      AND credential_type = 'certificate';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      INSERT INTO public.bank_credentials (
        integration_id, company_id, credential_type, encrypted_payload, updated_at
      ) VALUES (
        v_integration.id, p_company_id, 'certificate', p_certificate_payload, now()
      );
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Não foi possível gravar a credencial de certificado.';
    END IF;
  END IF;

  IF p_financial_account_id IS NOT NULL AND v_account.bank_integration_id IS NULL THEN
    UPDATE public.company_financial_accounts
    SET bank_integration_id = v_integration.id,
        updated_at = now()
    WHERE id = v_account.id
      AND company_id = p_company_id
      AND bank_integration_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Não foi possível vincular a conta financeira.';
    END IF;
  END IF;

  RETURN jsonb_build_object('unchanged', false, 'id', v_integration.id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_company_c6_bank_config(
  uuid, text, text, text, boolean, boolean, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_company_c6_bank_config(
  uuid, text, text, text, boolean, boolean, text, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_c6_bank_config(
  uuid, text, text, text, boolean, boolean, text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.save_company_c6_bank_config(
  uuid, text, text, text, boolean, boolean, text, text, uuid
) IS
  'Grava a configuração C6 numa transação. Somente service_role. Não registra senha nem ciphertext.';

NOTIFY pgrst, 'reload schema';

COMMIT;
