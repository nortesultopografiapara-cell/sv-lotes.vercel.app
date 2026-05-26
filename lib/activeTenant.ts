import { supabase } from '@/lib/supabase';

export type TenantUser = {
  id: string;
  tenant_id?: string | null;
  company_id?: string | null;
  role: string;
};

/** Resolve o tenant/empresa ativo: perfil → company_id → DB → impersonação (super admin). */
export async function resolveActiveTenantId(user: TenantUser | null): Promise<string | null> {
  if (!user) return null;

  const profileTenant = user.tenant_id || user.company_id;
  if (profileTenant) return profileTenant;

  if (typeof window !== 'undefined') {
    const impersonating = localStorage.getItem('impersonating_tenant_id');
    if (impersonating && user.role === 'SUPER_ADMIN') return impersonating;
  }

  if (user.id && !['dev-preview-user', 'demo-user-id'].includes(user.id)) {
    const { data } = await supabase
      .from('users')
      .select('tenant_id, company_id')
      .eq('id', user.id)
      .maybeSingle();
    const fromDb = data?.tenant_id || data?.company_id;
    if (fromDb) return fromDb;
  }

  return null;
}
