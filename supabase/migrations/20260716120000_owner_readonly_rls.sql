-- OWNER: acesso somente leitura (bloqueio de INSERT/UPDATE/DELETE via RLS restritiva)

CREATE OR REPLACE FUNCTION public.is_owner_readonly_user() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND upper(trim(coalesce(role, ''))) = 'OWNER'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'blocks',
    'sales',
    'finance_receipts',
    'cash_movements',
    'contracts',
    'customers',
    'projects',
    'broker_commissions',
    'reservations',
    'reservation_logs'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_insert ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_owner_readonly_user())',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_update ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_owner_readonly_user()) WITH CHECK (NOT public.is_owner_readonly_user())',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS owner_readonly_no_delete ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY owner_readonly_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_owner_readonly_user())',
      tbl
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
