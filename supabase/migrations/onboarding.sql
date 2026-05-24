-- Add force_password_change flag
alter table public.users add column if not exists force_password_change boolean default false;
alter table public.companies add column if not exists email text;
alter table public.companies add column if not exists phone text;
alter table public.companies add column if not exists logo_url text;
