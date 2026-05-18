-- Create customers table
create table if not exists public.customers (
    id uuid default gen_random_uuid() primary key,
    tenant_id uuid references public.companies(id) on delete cascade,
    name text not null,
    cpf_cnpj text unique, -- CPF/CNPJ
    phone text,
    email text,
    address text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.customers enable row level security;

-- Policies for customers
create policy "tenant_isolation_customers_all" on public.customers for all using (public.is_super_admin() or tenant_id = public.current_tenant_id());

-- Add customer_id to blocks if not exists
alter table public.blocks add column if not exists customer_id uuid references public.customers(id) on delete set null;
