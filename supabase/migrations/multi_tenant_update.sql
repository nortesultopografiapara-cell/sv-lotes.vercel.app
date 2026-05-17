alter table public.companies add column if not exists razao_social text;
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists default_password text;
alter table public.companies add column if not exists plan_type text default 'basic';

-- Novos campos de endereço e financeiros / foro
alter table public.companies add column if not exists end_logradouro text;
alter table public.companies add column if not exists end_numero text;
alter table public.companies add column if not exists end_bairro text;
alter table public.companies add column if not exists end_cidade text;
alter table public.companies add column if not exists end_uf text;
alter table public.companies add column if not exists end_cep text;

alter table public.companies add column if not exists default_down_payment numeric;
alter table public.companies add column if not exists default_installments integer;
alter table public.companies add column if not exists default_installment_value numeric;
alter table public.companies add column if not exists default_first_due_date text; -- "Data de Vencimento da 1ª Parcela"
alter table public.companies add column if not exists foro_cidade text;

-- Função para criar usuário na tabela auth.users pelo Super Admin
CREATE OR REPLACE FUNCTION public.handle_create_tenant_user(user_email text, user_password text, tenant_id uuid, user_role text DEFAULT 'ADMIN')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
  current_role text;
BEGIN
  -- Requires SUPER_ADMIN or ADMIN access
  SELECT role INTO current_role FROM public.users WHERE id = auth.uid();
  IF current_role != 'SUPER_ADMIN' AND current_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  new_user_id := gen_random_uuid();

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    new_user_id, 
    user_email, 
    crypt(user_password, gen_salt('bf')),
    now(),
    json_build_object('tenant_id', tenant_id, 'role', user_role)
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$;
