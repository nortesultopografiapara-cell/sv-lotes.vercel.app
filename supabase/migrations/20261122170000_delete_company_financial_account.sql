-- Exclusão transacional de company_financial_accounts.
-- Não executada nesta etapa. Não publica, não apaga conta real.
-- A função confere e exclui na mesma transação.
-- Referência sem chave estrangeira trava a conta antes de gravar.
-- DELETE direto, fora da função, é recusado.

CREATE OR REPLACE FUNCTION public.lock_referenced_company_financial_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found uuid;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;
  SELECT id INTO v_found
  FROM public.company_financial_accounts
  WHERE id = p_account_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta financeira referenciada não existe mais. A operação foi cancelada.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cash_movement_financial_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := NULLIF(btrim(COALESCE(NEW.metadata->>'financial_account_id', '')), '');
  IF v_raw IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'A referência da conta financeira no caixa é inválida.';
  END IF;
  PERFORM public.lock_referenced_company_financial_account(v_raw::uuid);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_split_snapshot_financial_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.financial_account_id IS NOT NULL THEN
    PERFORM public.lock_referenced_company_financial_account(NEW.financial_account_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_direct_company_financial_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_owner name;
BEGIN
  SELECT r.rolname INTO v_owner
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_roles AS r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname = 'delete_company_financial_account'
    AND pg_get_function_identity_arguments(p.oid) = 'p_company_id uuid, p_account_id uuid, p_expected_updated_at timestamp with time zone';

  IF current_user IS DISTINCT FROM v_owner
     OR coalesce(current_setting('svlotes.financial_account_delete', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'A exclusão direta de conta financeira não é permitida.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_c6_reservation_financial_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.company_financial_accounts
  WHERE bank_integration_id = NEW.integration_id
    AND company_id = NEW.company_id
  FOR KEY SHARE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_movements_financial_account_lock ON public.cash_movements;
CREATE TRIGGER trg_cash_movements_financial_account_lock
  BEFORE INSERT OR UPDATE ON public.cash_movements
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_cash_movement_financial_account();

DROP TRIGGER IF EXISTS trg_split_snapshot_financial_account_lock ON public.sale_revenue_split_snapshot_participants;
CREATE TRIGGER trg_split_snapshot_financial_account_lock
  BEFORE INSERT ON public.sale_revenue_split_snapshot_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_split_snapshot_financial_account();

DROP TRIGGER IF EXISTS trg_c6_boleto_reservations_financial_account_lock ON public.c6_boleto_reservations;
CREATE TRIGGER trg_c6_boleto_reservations_financial_account_lock
  BEFORE INSERT OR UPDATE ON public.c6_boleto_reservations
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_c6_reservation_financial_account();

DROP TRIGGER IF EXISTS trg_company_financial_accounts_reject_direct_delete ON public.company_financial_accounts;
CREATE TRIGGER trg_company_financial_accounts_reject_direct_delete
  BEFORE DELETE ON public.company_financial_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.reject_direct_company_financial_account_delete();

CREATE OR REPLACE FUNCTION public.delete_company_financial_account(
  p_company_id uuid,
  p_account_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.company_financial_accounts%ROWTYPE;
  v_integration public.bank_integrations%ROWTYPE;
  v_total integer;
  v_owned integer;
  v_credentials integer := 0;
  v_reservations integer := 0;
  v_messages text[] := ARRAY[]::text[];
  v_deleted integer := 0;
BEGIN
  IF p_company_id IS NULL OR p_account_id IS NULL OR p_expected_updated_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid',
      'message', 'Atualize a tela antes de alterar a conta.'
    );
  END IF;

  SELECT * INTO v_account
  FROM public.company_financial_accounts
  WHERE id = p_account_id
    AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'Conta financeira não encontrada.'
    );
  END IF;
  IF v_account.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'message', 'A conta foi alterada por outra operação. Atualize a tela e tente de novo.'
    );
  END IF;

  IF v_account.bank_integration_id IS NOT NULL THEN
    SELECT * INTO v_integration
    FROM public.bank_integrations
    WHERE id = v_account.bank_integration_id
    FOR UPDATE;
    IF NOT FOUND THEN
      v_messages := array_append(v_messages, 'Não foi possível confirmar a integração vinculada. A exclusão foi recusada.');
    ELSIF v_integration.company_id IS DISTINCT FROM p_company_id THEN
      v_messages := array_append(v_messages, 'A integração vinculada não pertence a esta empresa. A exclusão foi recusada.');
    ELSE
      SELECT count(*) INTO v_credentials
      FROM public.bank_credentials
      WHERE integration_id = v_integration.id;
      SELECT count(*) INTO v_reservations
      FROM public.c6_boleto_reservations
      WHERE integration_id = v_integration.id
        AND company_id = p_company_id;
      IF COALESCE(v_integration.active, true)
         OR COALESCE(v_integration.metadata #>> '{c6,emission_enabled}', '') = 'true'
         OR NULLIF(v_integration.metadata #>> '{c6,webhook_bank_confirmed_at}', '') IS NOT NULL
         OR upper(COALESCE(v_integration.status, '')) IN ('CONNECTED', 'ACTIVE')
         OR v_credentials > 0
         OR v_reservations > 0 THEN
        v_messages := array_append(
          v_messages,
          'A conta está vinculada à integração bancária ativa. Credenciais, webhook e registros bancários não são removidos por esta ação.'
        );
      END IF;
      IF v_reservations > 0 THEN
        v_messages := array_append(v_messages, 'Existem reservas de boleto C6 vinculadas à integração desta conta.');
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_total FROM public.finance_receipts WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.finance_receipts
  WHERE financial_account_id = p_account_id
    AND (
      (company_id = p_company_id AND (tenant_id IS NULL OR tenant_id::text = p_company_id::text))
      OR (company_id IS NULL AND tenant_id::text = p_company_id::text)
    );
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há recebimento de outra empresa apontando para esta conta. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem recebimentos vinculados, inclusive pagos ou cancelados.');
  END IF;

  SELECT count(*) INTO v_total FROM public.cash_movements
  WHERE metadata->>'financial_account_id' = p_account_id::text;
  SELECT count(*) INTO v_owned FROM public.cash_movements
  WHERE metadata->>'financial_account_id' = p_account_id::text
    AND company_id = p_company_id
    AND tenant_id::text = p_company_id::text;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há movimentação de caixa de outra empresa apontando para esta conta. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem movimentações de caixa vinculadas.');
  END IF;

  SELECT count(*) INTO v_total FROM public.company_asaas_charges WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.company_asaas_charges
  WHERE financial_account_id = p_account_id AND company_id = p_company_id;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem cobranças Asaas vinculadas, inclusive canceladas.');
  END IF;

  SELECT count(*) INTO v_total FROM public.bank_charges WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.bank_charges
  WHERE financial_account_id = p_account_id AND company_id = p_company_id;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem boletos ou cobranças bancárias vinculados, inclusive cancelados.');
  END IF;

  SELECT count(*) INTO v_total FROM public.sales WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.sales
  WHERE financial_account_id = p_account_id AND tenant_id::text = p_company_id::text;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem vendas vinculadas.');
  END IF;

  SELECT count(*) INTO v_total FROM public.projects WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.projects
  WHERE financial_account_id = p_account_id AND tenant_id::text = p_company_id::text;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem empreendimentos vinculados.');
  END IF;

  SELECT count(*) INTO v_total FROM public.project_revenue_split_participants WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.project_revenue_split_participants
  WHERE financial_account_id = p_account_id AND company_id = p_company_id;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem rateios de empreendimento vinculados.');
  END IF;

  SELECT count(*) INTO v_total
  FROM public.sale_revenue_split_snapshot_participants
  WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned
  FROM public.sale_revenue_split_snapshot_participants AS participant
  JOIN public.sale_revenue_split_snapshots AS snapshot
    ON snapshot.id = participant.snapshot_id
  WHERE participant.financial_account_id = p_account_id
    AND participant.company_id = p_company_id
    AND snapshot.company_id = p_company_id;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há rateio congelado de outra empresa apontando para esta conta. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existem rateios congelados de vendas vinculados.');
  END IF;

  SELECT count(*) INTO v_total FROM public.financial_account_provider_destinations WHERE financial_account_id = p_account_id;
  SELECT count(*) INTO v_owned FROM public.financial_account_provider_destinations
  WHERE financial_account_id = p_account_id AND company_id = p_company_id;
  IF v_total > v_owned THEN
    v_messages := array_append(v_messages, 'Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  END IF;
  IF v_owned > 0 THEN
    v_messages := array_append(v_messages, 'Existe destino de rateio ou carteira vinculado.');
  END IF;

  IF cardinality(v_messages) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'blocked',
      'message', array_to_string(v_messages, ' ')
    );
  END IF;

  PERFORM set_config('svlotes.financial_account_delete', 'on', true);
  DELETE FROM public.company_financial_accounts
  WHERE id = p_account_id
    AND company_id = p_company_id
    AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'A exclusão da conta financeira não foi concluída.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'deleted');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.lock_referenced_company_financial_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cash_movement_financial_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_split_snapshot_financial_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_direct_company_financial_account_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_c6_reservation_financial_account() FROM PUBLIC, anon, authenticated;

REVOKE DELETE ON TABLE public.company_financial_accounts FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) IS
  'Exclui uma conta financeira da empresa na mesma transação da conferência. service_role. Não apaga integração, credencial, boleto, caixa nem rateio.';
