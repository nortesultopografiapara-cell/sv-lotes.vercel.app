export const IMPERSONATION_KEYS = {
  tenantId: 'impersonating_tenant_id',
  companyName: 'impersonating_company_name',
  masterId: 'impersonating_master_id',
  masterName: 'impersonating_master_name',
  startedAt: 'impersonating_started_at',
} as const;

export type ImpersonationState = {
  tenantId: string;
  companyName: string;
  masterId: string;
  masterName: string;
  startedAt: string;
};

export function readImpersonationState(): ImpersonationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const tenantId = localStorage.getItem(IMPERSONATION_KEYS.tenantId);
    if (!tenantId) return null;
    return {
      tenantId,
      companyName: localStorage.getItem(IMPERSONATION_KEYS.companyName) || 'Empresa',
      masterId: localStorage.getItem(IMPERSONATION_KEYS.masterId) || '',
      masterName: localStorage.getItem(IMPERSONATION_KEYS.masterName) || 'Super Admin',
      startedAt: localStorage.getItem(IMPERSONATION_KEYS.startedAt) || '',
    };
  } catch {
    return null;
  }
}

export function writeImpersonationState(params: {
  tenantId: string;
  companyName: string;
  masterId: string;
  masterName: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(IMPERSONATION_KEYS.tenantId, params.tenantId);
    localStorage.setItem(IMPERSONATION_KEYS.companyName, params.companyName);
    localStorage.setItem(IMPERSONATION_KEYS.masterId, params.masterId);
    localStorage.setItem(IMPERSONATION_KEYS.masterName, params.masterName);
    localStorage.setItem(IMPERSONATION_KEYS.startedAt, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function clearImpersonationState(): void {
  if (typeof window === 'undefined') return;
  try {
    Object.values(IMPERSONATION_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function formatImpersonationDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}
