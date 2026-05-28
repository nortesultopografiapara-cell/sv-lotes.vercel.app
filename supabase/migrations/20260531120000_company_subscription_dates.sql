-- Datas de assinatura SaaS na empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_start_date date,
  ADD COLUMN IF NOT EXISTS subscription_due_day integer,
  ADD COLUMN IF NOT EXISTS next_payment_date date;

COMMENT ON COLUMN public.companies.subscription_start_date IS 'Data de início da assinatura SaaS';
COMMENT ON COLUMN public.companies.subscription_due_day IS 'Dia do mês para vencimento (1-31)';
COMMENT ON COLUMN public.companies.next_payment_date IS 'Próxima data de cobrança/vencimento';

-- Backfill empresas reais existentes
UPDATE public.companies
SET
  subscription_start_date = COALESCE(
    subscription_start_date,
    (created_at AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  ),
  subscription_due_day = COALESCE(
    subscription_due_day,
    EXTRACT(DAY FROM COALESCE(subscription_start_date, (created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE))::integer
  ),
  next_payment_date = COALESCE(
    next_payment_date,
    vencimento_plano,
    (COALESCE(subscription_start_date, (created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE) + INTERVAL '30 days')::date
  )
WHERE is_test_company IS NOT TRUE OR is_test_company IS NULL;

UPDATE public.company_subscriptions cs
SET
  start_date = COALESCE(cs.start_date, c.subscription_start_date, (c.created_at AT TIME ZONE 'UTC')::date),
  next_due_date = COALESCE(cs.next_due_date, c.next_payment_date, c.vencimento_plano, cs.start_date + 30)
FROM public.companies c
WHERE c.id = cs.company_id
  AND (cs.start_date IS NULL OR cs.next_due_date IS NULL);
