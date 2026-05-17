alter table public.customers add column if not exists rg text;
alter table public.customers add column if not exists nacionalidade text;
alter table public.customers add column if not exists estado_civil text;
alter table public.customers add column if not exists profissao text;
alter table public.customers add column if not exists document text; -- to avoid conflicts

alter table public.blocks add column if not exists down_payment numeric;
alter table public.blocks add column if not exists installments integer;
alter table public.blocks add column if not exists installment_value numeric;
alter table public.blocks add column if not exists first_due_date date;
