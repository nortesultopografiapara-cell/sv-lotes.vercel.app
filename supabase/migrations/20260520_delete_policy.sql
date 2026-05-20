create policy "Allow tenant users to delete own non-signed contracts"
on public.contracts
for delete
using (
  tenant_id in (
    select company_id
    from public.users
    where auth_id = auth.uid()
  )
  and lower(status) not in ('assinado', 'signed', 'ativo', 'active')
);
