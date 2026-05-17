create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.notifications enable row level security;

create policy "tenant_isolation_notifications" on public.notifications
  for all using (public.is_super_admin() OR tenant_id = public.current_tenant_id());
