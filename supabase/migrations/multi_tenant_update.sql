alter table public.companies add column if not exists razao_social text;
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists default_password text;

-- Função para criar usuário na tabela auth.users pelo Super Admin
CREATE OR REPLACE FUNCTION public.handle_create_tenant_user(user_email text, user_password text, tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Requires SUPER_ADMIN access
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  new_user_id := gen_random_uuid();

  -- Tenta inserir o usuário na auth.users, que requer role 'supabase_admin' ou bypass.
  -- Observação: Devido à segurança do Supabase, auth.users geralmente não permite inserção direta assim.
  -- Para fins deste MVP, criaremos um registro fake ou usaremos uma approach customizada.
  -- No Supabase em self-hosted é possível com SECURITY DEFINER. No Cloud, muitas vezes requer a API Admin.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    new_user_id, 
    user_email, 
    crypt(user_password, gen_salt('bf')),
    now(),
    json_build_object('tenant_id', tenant_id, 'role', 'ADMIN')
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$;
