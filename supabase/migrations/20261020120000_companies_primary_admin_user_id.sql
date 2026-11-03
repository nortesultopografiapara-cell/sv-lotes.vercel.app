-- SV LOTES — Fase 0: identidade canônica do Administrador Principal.
-- companies.primary_admin_user_id é a autoridade crítica da empresa.
-- Não cria role PRIMARY_ADMIN. Sem backfill. Coluna nullable.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS primary_admin_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_primary_admin_user_id_fkey'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_primary_admin_user_id_fkey
      FOREIGN KEY (primary_admin_user_id)
      REFERENCES public.users(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS companies_primary_admin_user_id_idx
  ON public.companies (primary_admin_user_id);

COMMENT ON COLUMN public.companies.primary_admin_user_id IS
  'Administrador Principal da empresa (autoridade crítica). Não é uma nova role de navegação.';

CREATE OR REPLACE FUNCTION public.enforce_companies_primary_admin_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  admin_tenant uuid;
  admin_role text;
  admin_status text;
BEGIN
  IF NEW.primary_admin_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT u.tenant_id, upper(coalesce(u.role, '')), upper(coalesce(u.status, 'ACTIVE'))
    INTO admin_tenant, admin_role, admin_status
  FROM public.users u
  WHERE u.id = NEW.primary_admin_user_id;

  IF admin_tenant IS NULL THEN
    RAISE EXCEPTION 'primary_admin_user_id must reference an existing user';
  END IF;

  IF admin_tenant IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'primary_admin_user_id must belong to the same company';
  END IF;

  IF admin_role IN ('SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN') THEN
    RAISE EXCEPTION 'SUPER_ADMIN cannot be company primary admin';
  END IF;

  IF admin_role NOT IN ('ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN') THEN
    RAISE EXCEPTION 'primary_admin_user_id must have a company administrative role';
  END IF;

  IF admin_status = 'INACTIVE' THEN
    RAISE EXCEPTION 'primary_admin_user_id must be an active user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_primary_admin_identity ON public.companies;
CREATE TRIGGER trg_companies_primary_admin_identity
  BEFORE INSERT OR UPDATE OF primary_admin_user_id
  ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_companies_primary_admin_identity();

NOTIFY pgrst, 'reload schema';
