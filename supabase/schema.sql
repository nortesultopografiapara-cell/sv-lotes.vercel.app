-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- USERS
create table public.users (
  id uuid references auth.users not null primary key,
  email text unique not null,
  full_name text,
  role text check (role in ('SUPER_ADMIN', 'ADMIN', 'OPERADOR', 'CONSULTOR')) default 'CONSULTOR',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PROJECTS
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
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
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null, -- Quadra A, Quadra B...
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- LOTS
create table public.lots (
  id uuid default uuid_generate_v4() primary key,
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
  full_name text not null,
  email text,
  phone text,
  cpf_cnpj text unique,
  address text,
  obs text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RESERVATIONS
create table public.reservations (
  id uuid default uuid_generate_v4() primary key,
  lot_id uuid references public.lots(id) on delete restrict not null,
  client_id uuid references public.clients(id) on delete restrict not null,
  user_id uuid references public.users(id) not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SALES & CONTRACTS
create table public.sales (
  id uuid default uuid_generate_v4() primary key,
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
  user_id uuid references public.users(id),
  action text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up RLS
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.blocks enable row level security;
alter table public.lots enable row level security;
alter table public.clients enable row level security;
alter table public.reservations enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.logs enable row level security;

-- Create policies (Simplification for this prototype: logged in users can read, admin edits)
create policy "Allow logged-in users to read users" on public.users for select using (auth.role() = 'authenticated');
create policy "Allow logged-in read projects" on public.projects for select using (auth.role() = 'authenticated');
create policy "Allow logged-in read blocks" on public.blocks for select using (auth.role() = 'authenticated');
create policy "Allow logged-in read lots" on public.lots for select using (auth.role() = 'authenticated');
create policy "Allow update lots" on public.lots for update using (auth.role() = 'authenticated');

-- REALTIME CONFIG
-- Enable realtime for the tables that need it
alter publication supabase_realtime add table public.lots;
alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.sales;

-- MOCK DEFAULT DATA FOR SUPER ADMIN
-- Assuming severino's auth ID is inserted, but this is handled via trigger normally.
