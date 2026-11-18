-- Somente leitura. Não executar UPDATE, INSERT, DELETE nem função que grave.
-- Rodar no SQL Editor do ambiente indicado. Não usar o projeto desativado.

-- 1. Esquema. Serve para Develop e Production.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contracts'
  AND column_name IN (
    'superseded_by', 'version', 'is_current', 'regenerated_from',
    'regenerated_at', 'regenerated_by', 'pdf_url', 'generated_html',
    'contract_number', 'created_at', 'tenant_id', 'sale_id', 'status'
  )
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'finance_receipts'
  AND column_name IN (
    'schedule_group', 'installment_number', 'amount', 'status',
    'paid_amount', 'paid_at', 'due_date', 'sale_id', 'customer_id'
  )
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cash_movements'
  AND column_name IN ('status', 'type', 'amount', 'sale_id', 'metadata', 'tenant_id')
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'audit_logs'
  AND column_name IN ('tenant_id', 'company_id', 'user_id', 'action', 'module', 'reference_id', 'description')
ORDER BY 1;

SELECT indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'contracts_one_current_per_sale_uidx';

SELECT tenant_id, sale_id, count(*) AS vigentes
FROM public.contracts
WHERE is_current IS TRUE AND sale_id IS NOT NULL
GROUP BY tenant_id, sale_id
HAVING count(*) > 1;

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'replace_current_contract_version',
    'apply_sale_edit_finance',
    'execute_receipt_payment_reversal',
    'execute_authorized_manual_receipt_payment',
    'finance_receipts_block_client_paid_update'
  )
ORDER BY 1;

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'replace_current_contract_version',
    'apply_sale_edit_finance',
    'execute_authorized_manual_receipt_payment'
  )
ORDER BY 1, 2;

SELECT pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgname = 'finance_receipts_block_client_paid_update'
  AND NOT tgisinternal;

SELECT position('A edição da venda não quita parcela' IN pg_get_functiondef(p.oid)) > 0 AS edicao_recusa_quitacao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'apply_sale_edit_finance';

SELECT position('v_new.superseded_by' IN pg_get_functiondef(p.oid)) > 0 AS regeneracao_usa_coluna_fixa_ausente
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'replace_current_contract_version';

-- 2. Contrato de teste. Executar somente no Develop hoynysmynxncdlptuzub.
-- Não executar esta seção em Production.
WITH sale AS (
  SELECT DISTINCT sale_id
  FROM public.contracts
  WHERE contract_number = '000000048/2026'
)
SELECT c.version, c.status, c.is_current,
       c.regenerated_from IS NOT NULL AS tem_origem,
       length(c.generated_html) AS tamanho_html,
       position('1.500,00' IN coalesce(c.generated_html, '')) > 0 AS tem_1500,
       position('3.500,00' IN coalesce(c.generated_html, '')) > 0 AS tem_3500,
       position('70.913,11' IN coalesce(c.generated_html, '')) > 0 AS tem_lote,
       position('20/03/2027' IN coalesce(c.generated_html, '')) > 0 AS tem_primeiro_lote,
       position('foi recebido no ato' IN coalesce(c.generated_html, '')) > 0 AS recebido_no_ato
FROM public.contracts c
JOIN sale s ON s.sale_id = c.sale_id
ORDER BY c.version;

WITH sale AS (
  SELECT DISTINCT sale_id
  FROM public.contracts
  WHERE contract_number = '000000048/2026'
)
SELECT count(*) FILTER (WHERE c.is_current IS TRUE) AS versoes_vigentes,
       count(*) FILTER (WHERE c.version = 1) AS versao_1,
       count(*) FILTER (WHERE c.version = 2 AND c.is_current IS TRUE) AS versao_2_vigente,
       count(*) FILTER (WHERE c.version = 1 AND coalesce(c.is_current, false) = false AND length(coalesce(c.generated_html, '')) > 0) AS versao_1_com_html
FROM public.contracts c
JOIN sale s ON s.sale_id = c.sale_id;

WITH sale AS (
  SELECT DISTINCT sale_id
  FROM public.contracts
  WHERE contract_number = '000000048/2026'
)
SELECT s.lot_price, s.total_value, s.agreed_price, s.down_payment,
       s.signal_contract_value, s.signal_paid_at_sale, s.signal_remaining_value,
       s.installments_count
FROM public.sales s
JOIN sale x ON x.sale_id = s.id;

WITH sale AS (
  SELECT DISTINCT sale_id
  FROM public.contracts
  WHERE contract_number = '000000048/2026'
)
SELECT count(*) FILTER (WHERE fr.schedule_group = 'SIGNAL' AND fr.installment_number = 0 AND fr.amount = 1500 AND lower(fr.status) IN ('pago', 'paid', 'paga')) AS sinal_inicial_pago,
       count(*) FILTER (WHERE fr.schedule_group = 'SIGNAL' AND fr.installment_number > 0 AND lower(fr.status) = 'pendente') AS sinal_pendente,
       round(sum(fr.amount) FILTER (WHERE fr.schedule_group = 'SIGNAL' AND fr.installment_number > 0 AND lower(fr.status) = 'pendente'), 2) AS saldo_sinal,
       count(*) FILTER (WHERE fr.schedule_group = 'LOT') AS lote_qtd,
       round(sum(fr.amount) FILTER (WHERE fr.schedule_group = 'SIGNAL'), 2) AS sinal_total,
       round(sum(fr.amount) FILTER (WHERE fr.schedule_group = 'LOT'), 2) AS lote_total,
       round(sum(fr.amount) FILTER (WHERE fr.schedule_group IN ('SIGNAL', 'LOT')), 2) AS total_sinal_lote,
       min(fr.due_date) FILTER (WHERE fr.schedule_group = 'LOT') AS primeiro_lote
FROM public.finance_receipts fr
JOIN sale s ON s.sale_id = fr.sale_id
WHERE lower(coalesce(fr.status, '')) NOT IN ('cancelado', 'canceled', 'cancelled');

WITH sale AS (
  SELECT DISTINCT sale_id
  FROM public.contracts
  WHERE contract_number = '000000048/2026'
), signal_receipt AS (
  SELECT fr.id
  FROM public.finance_receipts fr
  JOIN sale s ON s.sale_id = fr.sale_id
  WHERE fr.schedule_group = 'SIGNAL'
    AND fr.installment_number = 0
    AND fr.amount = 1500
)
SELECT cm.status, cm.type, cm.amount, count(DISTINCT cm.id) AS quantidade
FROM public.cash_movements cm
JOIN signal_receipt r
  ON cm.metadata->>'installment_id' = r.id::text
  OR cm.metadata->>'receipt_id' = r.id::text
  OR cm.metadata->>'finance_receipt_id' = r.id::text
GROUP BY cm.status, cm.type, cm.amount
ORDER BY cm.status;
