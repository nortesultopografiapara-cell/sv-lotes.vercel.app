export type UserCompanyLink = {
  tenant_id?: string | null;
  company_id?: string | null;
  role?: string | null;
};

/** Campo real de vínculo: `tenant_id` (primário); `company_id` como fallback legado. */
export function resolveUserCompanyId(user: UserCompanyLink): string | null {
  const tenantId = user.tenant_id ? String(user.tenant_id).trim() : '';
  const companyId = user.company_id ? String(user.company_id).trim() : '';
  return tenantId || companyId || null;
}

export function isSuperAdminRole(role?: string | null): boolean {
  return String(role || '').toUpperCase() === 'SUPER_ADMIN';
}

export function buildCompanyUserCounts(users: UserCompanyLink[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const user of users) {
    if (isSuperAdminRole(user.role)) continue;
    const companyId = resolveUserCompanyId(user);
    if (!companyId) continue;
    counts[companyId] = (counts[companyId] || 0) + 1;
  }
  return counts;
}

export function buildCompanyProjectCounts(
  projects: Array<{ tenant_id?: string | null; company_id?: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const project of projects) {
    const companyId = project.tenant_id || project.company_id;
    if (!companyId) continue;
    counts[companyId] = (counts[companyId] || 0) + 1;
  }
  return counts;
}

export function userBelongsToCompany(user: UserCompanyLink, companyId: string): boolean {
  return resolveUserCompanyId(user) === companyId;
}
