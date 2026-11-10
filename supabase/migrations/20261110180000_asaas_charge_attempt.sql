-- Reserva da cobrança Asaas antes do POST.
-- Não aplicar em Production sem aprovação explícita.
-- Não apaga, cancela nem reescreve cobranças existentes.
--
-- Consulta somente leitura, obrigatória antes de aplicar:
-- select installment_id, count(*)
-- from public.company_asaas_charges
-- where status in ('PENDING', 'REGISTERED', 'OVERDUE', 'PAID')
-- group by installment_id
-- having count(*) > 1;
-- Se houver linhas, interrompa. Não use este arquivo para removê-las.
-- A unicidade nova fica na tabela vazia de tentativas, não num índice tardio das cobranças já gravadas.

alter table public.company_asaas_charges
  add column if not exists schedule_group text;

alter table public.company_asaas_charges
  drop constraint if exists company_asaas_charges_schedule_group_check;

alter table public.company_asaas_charges
  add constraint company_asaas_charges_schedule_group_check
  check (schedule_group is null or schedule_group in ('SIGNAL', 'LOT'))
  not valid;

alter table public.company_asaas_charges
  validate constraint company_asaas_charges_schedule_group_check;

create table if not exists public.company_asaas_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  installment_id uuid not null references public.finance_receipts(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  schedule_group text,
  idempotency_key text not null,
  status text not null check (status in ('reserved', 'unknown', 'completed', 'failed')),
  owner_token uuid not null,
  lease_until timestamptz not null,
  asaas_payment_id text,
  last_error text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint company_asaas_charge_attempts_installment_uidx unique (company_id, installment_id),
  constraint company_asaas_charge_attempts_key_uidx unique (idempotency_key),
  constraint company_asaas_charge_attempts_group_check
    check (schedule_group is null or schedule_group in ('SIGNAL', 'LOT'))
);

create index if not exists idx_company_asaas_charge_attempts_lease
  on public.company_asaas_charge_attempts (lease_until)
  where status in ('reserved', 'unknown');

alter table public.company_asaas_charge_attempts enable row level security;

drop policy if exists company_asaas_charge_attempts_tenant on public.company_asaas_charge_attempts;
create policy company_asaas_charge_attempts_tenant on public.company_asaas_charge_attempts
  for all
  using (public.is_super_admin() or company_id = public.current_tenant_id())
  with check (public.is_super_admin() or company_id = public.current_tenant_id());

comment on table public.company_asaas_charge_attempts is
  'Reserva anterior ao POST /payments. Uma parcela da empresa tem uma tentativa por vez. Status unknown não autoriza outro POST.';

revoke all on table public.company_asaas_charge_attempts from public, anon, authenticated;
grant all on table public.company_asaas_charge_attempts to service_role;

notify pgrst, 'reload schema';

-- Reversão, somente após aprovação e sem apagar company_asaas_charges:
-- drop table if exists public.company_asaas_charge_attempts;
-- alter table public.company_asaas_charges drop constraint if exists company_asaas_charges_schedule_group_check;
-- alter table public.company_asaas_charges drop column if exists schedule_group;
