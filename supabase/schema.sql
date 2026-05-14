-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- COMPANIES (TENANTS)
create table public.companies (
  id uuid default uuid_generate_v4() primary key, -- acts as tenant_id
  name text not null,
  slug text unique not null,
  cnpj text,
  plan text default 'BASIC',
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- USERS
create table public.users (
  id uuid references auth.users not null primary key,
  tenant_id uuid references public.companies(id) on delete cascade, -- null for SUPER_ADMIN
  full_name text,
  email text unique not null,
  role text check (role in ('SUPER_ADMIN', 'ADMIN', 'CORRETOR')) default 'CORRETOR',
  status text default 'ACTIVE',
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PROJECTS
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  name text not null,
  description text,
  location text,
  total_area decimal,
  status text check (status in ('ACTIVE', 'PLANNING', 'COMPLETED', 'ARCHIVED')) default 'ACTIVE',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- BLOCKS
create table public.blocks (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null, -- Quadra A, Quadra B...
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- LOTS
create table public.lots (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  block_id uuid references public.blocks(id) on delete cascade not null,
  number text not null, -- Lote 01, Lote 02...
  area decimal not null,
  price decimal not null,
  status text check (status in ('AVAILABLE', 'RESERVED', 'SOLD')) default 'AVAILABLE',
  geom jsonb, -- GeoJSON representation for the map
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CLIENTS
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  cpf_cnpj text,
  address text,
  obs text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(tenant_id, cpf_cnpj)
);

-- RESERVATIONS
create table public.reservations (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  lot_id uuid references public.lots(id) on delete restrict not null,
  client_id uuid references public.clients(id) on delete restrict not null,
  user_id uuid references public.users(id) not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SALES & CONTRACTS
create table public.sales (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  lot_id uuid references public.lots(id) on delete restrict not null,
  client_id uuid references public.clients(id) on delete restrict not null,
  user_id uuid references public.users(id) not null,
  agreed_price decimal not null,
  down_payment decimal default 0,
  installments_count integer default 1,
  status text check (status in ('ACTIVE', 'CANCELLED', 'PAID_OFF')) default 'ACTIVE',
  contract_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PAYMENTS
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade not null,
  sale_id uuid references public.sales(id) on delete cascade not null,
  amount decimal not null,
  due_date date not null,
  paid_date date,
  status text check (status in ('PENDING', 'PAID', 'OVERDUE')) default 'PENDING',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- LOGS
create table public.logs (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.users(id),
  action text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up RLS
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.blocks enable row level security;
alter table public.lots enable row level security;
alter table public.clients enable row level security;
alter table public.reservations enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.logs enable row level security;

-- CREATE RLS POLICIES FOR MULTI-TENANCY

-- Helper function to check if user is SUPER_ADMIN
create or replace function public.is_super_admin() returns boolean as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'SUPER_ADMIN'
  );
$$ language sql security definer;

-- Helper function to get current user tenant
create or replace function public.current_tenant_id() returns uuid as $$
  select tenant_id from public.users where id = auth.uid();
$$ language sql security definer;

-- Companies: SUPER_ADMIN sees all. Others see their own.
create policy "tenant_isolation_companies" on public.companies
  for all using (
    public.is_super_admin() OR id = public.current_tenant_id()
  );

-- Utility macro for standard tables
create policy "tenant_isolation_projects" on public.projects
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_blocks" on public.blocks
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_lots" on public.lots
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_clients" on public.clients
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_reservations" on public.reservations
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_sales" on public.sales
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_payments" on public.payments
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_logs" on public.logs
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

create policy "tenant_isolation_users" on public.users
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());

-- REALTIME CONFIG
alter publication supabase_realtime add table public.lots;
alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.sales;

