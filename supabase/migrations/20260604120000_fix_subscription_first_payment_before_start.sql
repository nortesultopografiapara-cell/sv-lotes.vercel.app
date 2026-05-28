-- Corrige assinaturas com primeira cobrança anterior à data de início
UPDATE public.company_subscriptions
SET
  first_payment_date = start_date,
  updated_at = timezone('utc'::text, now())
WHERE first_payment_date IS NOT NULL
  AND start_date IS NOT NULL
  AND first_payment_date < start_date;

-- Recalcula próximo vencimento a partir do início (+1 mês), não +30 dias
UPDATE public.company_subscriptions cs
SET
  next_due_date = (cs.start_date + INTERVAL '1 month')::date,
  updated_at = timezone('utc'::text, now())
WHERE cs.start_date IS NOT NULL
  AND (
    cs.next_due_date IS NULL
    OR cs.next_due_date < cs.start_date
    OR cs.next_due_date = cs.first_payment_date
  );

UPDATE public.companies c
SET
  subscription_start_date = cs.start_date,
  next_payment_date = cs.next_due_date,
  vencimento_plano = cs.next_due_date,
  subscription_due_day = EXTRACT(DAY FROM cs.start_date)::integer,
  updated_at = timezone('utc'::text, now())
FROM public.company_subscriptions cs
WHERE cs.company_id = c.id
  AND cs.start_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
