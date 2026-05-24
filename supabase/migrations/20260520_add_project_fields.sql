alter table public.projects
add column if not exists city text,
add column if not exists uf text,
add column if not exists neighborhood text,
add column if not exists address text,
add column if not exists forum_city text;

NOTIFY pgrst, 'reload schema';
