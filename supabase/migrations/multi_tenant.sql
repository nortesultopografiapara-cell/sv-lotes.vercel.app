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

-- 5. RLS POLICIES E ISOLAMENTO DE DADOS

-- Ativar RLS nas tabelas
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.lots enable row level security;
alter table public.sales enable row level security;
alter table public.reservations enable row level security;
alter table public.clients enable row level security;

-- COMPANIES: SUPER_ADMIN vê e pode editar todas, ADMIN vê só a sua, CORRETOR não vê nenhuma (ou vê só a sua se o ADMIN permitir)
create policy "Todas as empresas para SUPER_ADMIN"
  on public.companies for all
  using (public.is_super_admin());

create policy "Empresa visível para seu ADMIN"
  on public.companies for select
  using (id = public.current_tenant_id());

-- USERS: SUPER_ADMIN vê/edita todos, ADMIN vê/edita apenas os usuários da sua empresa, CORRETOR só vê seus próprios dados
create policy "Todos os usuários para SUPER_ADMIN"
  on public.users for all
  using (public.is_super_admin());

create policy "Tenant admin gerencia usuários locais"
  on public.users for all
  using (tenant_id = public.current_tenant_id() and (select role from public.users where id = auth.uid()) = 'ADMIN');

create policy "Usuário vê a si próprio"
  on public.users for select
  using (id = auth.uid());

-- RLS Default (Por Empresa) = Isolar pelo tenant_id
-- O uso de SECURITY DEFINER functions auxilia em evitar loops de policy se o Supabase avisar.
-- Para projects, clients, reservations, sales, e etc:
-- Todos podem listar as que tem on tenant_id=current_tenant_id, com controle interno no front.

create policy "Tenant isolation para projetos" on public.projects for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "Tenant isolation para lots" on public.lots for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "Tenant isolation para clients" on public.clients for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "Tenant isolation para sales" on public.sales for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "Tenant isolation para reservations" on public.reservations for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "Tenant isolation para logs" on public.logs for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());
