-- 1. CRIAR TABELA DE EMPRESAS
create table if not exists public.companies (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text unique not null,
  cnpj text,
  plan text default 'BASIC',
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. ADICIONAR COLUNAS NA TABELA DE USUÁRIOS
alter table public.users 
add column if not exists tenant_id uuid references public.companies(id) on delete cascade,
add column if not exists phone text;

-- Modificar os allowed roles caso ainda existam as constraints antigas (opcional)
-- alter table public.users drop constraint if exists users_role_check;
-- alter table public.users add constraint users_role_check check (role in ('SUPER_ADMIN', 'ADMIN', 'CORRETOR'));

-- 3. ADICIONAR TENANT_ID NAS DEMAIS TABELAS
alter table public.projects add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.blocks add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.lots add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.clients add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.reservations add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.sales add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.payments add column if not exists tenant_id uuid references public.companies(id) on delete cascade;
alter table public.logs add column if not exists tenant_id uuid references public.companies(id) on delete cascade;

-- 4. ATUALIZAR FUNÇÕES DE SEGURANÇA E RLS
create or replace function public.is_super_admin() returns boolean as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'SUPER_ADMIN'
  );
$$ language sql security definer;

create or replace function public.current_tenant_id() returns uuid as $$
  select tenant_id from public.users where id = auth.uid();
$$ language sql security definer;

-- (Opcional) Você pode querer rodar as policies do schema.sql completo para grant/RLS
