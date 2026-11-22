-- Baixa C6 atômica. Não executada nesta etapa.
-- Não cadastra webhook e não altera Asaas, Inter ou Recanto.
-- Antes de aplicar, rodar o preflight somente leitura.

CREATE OR REPLACE FUNCTION public.settle_company_c6_bank_slip(
  p_company_id uuid,
  p_charge_id uuid,
  p_receipt_id uuid,
  p_integration_id uuid,
  p_financial_account_id uuid,
  p_bank_slip_id text,
  p_paid_amount numeric,
  p_paid_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt public.finance_receipts%ROWTYPE;
  v_charge public.bank_charges%ROWTYPE;
  v_account public.company_financial_accounts%ROWTYPE;
  v_integration public.bank_integrations%ROWTYPE;
  v_owner uuid;
  v_account_id uuid;
  v_cash uuid;
  v_reversed uuid;
  v_status text;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL OR p_receipt_id IS NULL
     OR p_integration_id IS NULL OR p_bank_slip_id IS NULL OR p_paid_on IS NULL THEN
    RETURN jsonb_build_object('code', 'mismatch');
  END IF;

  SELECT * INTO v_receipt
  FROM public.finance_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  v_owner := COALESCE(v_receipt.company_id, v_receipt.tenant_id);
  IF v_owner IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('code', 'foreign_company');
  END IF;

  SELECT * INTO v_charge
  FROM public.bank_charges
  WHERE id = p_charge_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_charge.company_id IS DISTINCT FROM p_company_id
     OR v_charge.provider IS DISTINCT FROM 'C6'
     OR v_charge.finance_receipt_id IS DISTINCT FROM p_receipt_id
     OR v_charge.integration_id IS DISTINCT FROM p_integration_id
     OR v_charge.external_id IS DISTINCT FROM p_bank_slip_id THEN
    RETURN jsonb_build_object('code', 'mismatch');
  END IF;

  v_account_id := COALESCE(p_financial_account_id, v_receipt.financial_account_id);
  SELECT * INTO v_account
  FROM public.company_financial_accounts
  WHERE id = v_account_id
    AND company_id = p_company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'mismatch');
  END IF;
  SELECT * INTO v_integration
  FROM public.bank_integrations
  WHERE id = p_integration_id
    AND company_id = p_company_id;
  IF NOT FOUND
     OR v_account.bank_integration_id IS DISTINCT FROM p_integration_id
     OR (v_receipt.financial_account_id IS NOT NULL AND v_receipt.financial_account_id IS DISTINCT FROM v_account.id)
     OR v_integration.provider IS DISTINCT FROM 'C6' THEN
    RETURN jsonb_build_object('code', 'mismatch');
  END IF;

  SELECT id INTO v_reversed
  FROM public.cash_movements
  WHERE company_id = p_company_id
    AND COALESCE(status, 'ativo') = 'estornado'
    AND (
      metadata->>'installment_id' = p_receipt_id::text
      OR metadata->>'bank_charge_id' = p_charge_id::text
    )
  LIMIT 1;
  IF v_reversed IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'reversed');
  END IF;

  SELECT id INTO v_cash
  FROM public.cash_movements
  WHERE company_id = p_company_id
    AND type = 'entrada'
    AND COALESCE(status, 'ativo') = 'ativo'
    AND metadata->>'provider' = 'C6'
    AND metadata->>'bank_charge_id' = p_charge_id::text
  LIMIT 1;

  v_status := lower(trim(COALESCE(v_receipt.status, '')));
  IF v_status IN ('cancelado', 'canceled', 'cancelled', 'cancelada') THEN
    RETURN jsonb_build_object('code', 'cancelled');
  END IF;
  IF v_status IN ('pago', 'paid') THEN
    IF v_cash IS NOT NULL THEN
      RETURN jsonb_build_object('code', 'duplicate', 'cashMovementId', v_cash, 'receiptUpdated', false);
    END IF;
    RETURN jsonb_build_object('code', 'already_paid');
  END IF;
  IF v_status NOT IN ('pendente', 'atrasado', 'overdue', 'vencido') THEN
    RETURN jsonb_build_object('code', 'ineligible');
  END IF;
  IF round(COALESCE(v_receipt.amount, 0), 2) IS DISTINCT FROM round(COALESCE(p_paid_amount, 0), 2) THEN
    RETURN jsonb_build_object('code', 'divergent');
  END IF;

  UPDATE public.finance_receipts
  SET status = 'pago',
      paid_amount = round(p_paid_amount, 2),
      paid_at = p_paid_on::timestamptz
  WHERE id = v_receipt.id
    AND lower(trim(COALESCE(status, ''))) IN ('pendente', 'atrasado', 'overdue', 'vencido');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'already_paid');
  END IF;

  INSERT INTO public.cash_movements (
    tenant_id, company_id, project_id, type, category, description, amount,
    customer_id, sale_id, movement_date, status, metadata
  ) VALUES (
    COALESCE(v_receipt.tenant_id, v_receipt.company_id),
    p_company_id,
    v_receipt.project_id,
    'entrada',
    'recebimento_parcela',
    trim(format('Recebimento C6 Bank — parcela %s', COALESCE(v_receipt.installment_number::text, ''))),
    round(p_paid_amount, 2),
    v_receipt.customer_id,
    v_receipt.sale_id,
    p_paid_on,
    'ativo',
    jsonb_build_object(
      'provider', 'C6',
      'bank_charge_id', p_charge_id,
      'installment_id', p_receipt_id,
      'bank_slip_id', p_bank_slip_id
    )
  )
  RETURNING id INTO v_cash;

  UPDATE public.bank_charges
  SET status = 'PAID',
      paid_at = p_paid_on::timestamptz,
      paid_amount = round(p_paid_amount, 2),
      updated_at = timezone('utc', now())
  WHERE id = v_charge.id
    AND company_id = p_company_id
    AND provider = 'C6';

  INSERT INTO public.audit_logs (
    tenant_id, company_id, action, module, reference_id, description
  ) VALUES (
    p_company_id,
    p_company_id,
    'c6_boleto_settlement',
    'FINANCE',
    p_receipt_id,
    left(format('Baixa C6 %s valor %s', p_bank_slip_id, round(p_paid_amount, 2)), 500)
  );

  RETURN jsonb_build_object(
    'code', 'settled',
    'cashMovementId', v_cash,
    'receiptUpdated', true
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_cash
    FROM public.cash_movements
    WHERE company_id = p_company_id
      AND type = 'entrada'
      AND COALESCE(status, 'ativo') = 'ativo'
      AND metadata->>'provider' = 'C6'
      AND metadata->>'bank_charge_id' = p_charge_id::text
    LIMIT 1;
    RETURN jsonb_build_object('code', 'duplicate', 'cashMovementId', v_cash, 'receiptUpdated', false);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_company_c6_bank_slip(uuid, uuid, uuid, uuid, uuid, text, numeric, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_company_c6_bank_slip(uuid, uuid, uuid, uuid, uuid, text, numeric, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_company_c6_bank_slip(uuid, uuid, uuid, uuid, uuid, text, numeric, date) TO service_role;

COMMENT ON FUNCTION public.settle_company_c6_bank_slip(uuid, uuid, uuid, uuid, uuid, text, numeric, date) IS
  'Baixa C6 atômica da parcela e do caixa. service_role. Não reativa estorno.';

DO $$
DECLARE
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_conflicts
  FROM (
    SELECT company_id, metadata->>'bank_charge_id' AS charge_id
    FROM public.cash_movements
    WHERE type = 'entrada'
      AND COALESCE(status, 'ativo') = 'ativo'
      AND metadata->>'provider' = 'C6'
      AND COALESCE(metadata->>'bank_charge_id', '') <> ''
    GROUP BY company_id, metadata->>'bank_charge_id'
    HAVING count(*) > 1
  ) conflicts;
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'Há baixas C6 ativas duplicadas. O índice não foi criado e esta migration foi desfeita.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_c6_charge_unique
  ON public.cash_movements (company_id, (metadata->>'bank_charge_id'))
  WHERE type = 'entrada'
    AND COALESCE(status, 'ativo') = 'ativo'
    AND metadata->>'provider' = 'C6'
    AND COALESCE(metadata->>'bank_charge_id', '') <> '';

COMMENT ON INDEX public.idx_cash_movements_c6_charge_unique IS
  'Uma entrada ativa por cobrança C6. Estornos ficam fora do índice.';
