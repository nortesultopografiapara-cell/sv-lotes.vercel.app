-- Primeira cobrança separada do próximo vencimento
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS first_payment_date date;

COMMENT ON COLUMN public.company_subscriptions.first_payment_date IS
  'Data da primeira cobrança (= data de início da assinatura)';

UPDATE public.company_subscriptions cs
SET
  start_date = COALESCE(
    cs.start_date,
    c.subscription_start_date,
    (c.created_at AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  ),
  first_payment_date = COALESCE(
    cs.first_payment_date,
    cs.start_date,
    c.subscription_start_date,
    (c.created_at AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  ),
  next_due_date = (
    COALESCE(
      cs.first_payment_date,
      cs.start_date,
      c.subscription_start_date,
      (c.created_at AT TIME ZONE 'UTC')::date,
      CURRENT_DATE
    ) + INTERVAL '1 month'
  )::date
FROM public.companies c
WHERE c.id = cs.company_id;

UPDATE public.companies c
SET
  subscription_start_date = COALESCE(c.subscription_start_date, cs.start_date),
  subscription_due_day = COALESCE(
    c.subscription_due_day,
    EXTRACT(DAY FROM COALESCE(cs.start_date, CURRENT_DATE))::integer
  ),
  next_payment_date = cs.next_due_date
FROM public.company_subscriptions cs
WHERE cs.company_id = c.id;

NOTIFY pgrst, 'reload schema';
