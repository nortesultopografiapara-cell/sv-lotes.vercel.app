-- Correção imediata MENESES + supersede contratos antigos antes de regenerar PDF
UPDATE public.company_subscriptions
SET
  start_date = '2026-05-27',
  first_payment_date = '2026-05-27',
  next_due_date = '2026-06-27',
  updated_at = timezone('utc'::text, now())
WHERE company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

UPDATE public.companies
SET
  subscription_start_date = '2026-05-27',
  next_payment_date = '2026-06-27',
  subscription_due_day = 27,
  updated_at = timezone('utc'::text, now())
WHERE id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

UPDATE public.company_contracts
SET
  status = 'superseded',
  updated_at = timezone('utc'::text, now())
WHERE company_id = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c'
  AND status IS DISTINCT FROM 'superseded';

NOTIFY pgrst, 'reload schema';
