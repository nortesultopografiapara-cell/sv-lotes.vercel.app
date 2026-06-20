export type MasterAuditRow = {
  id: string;
  created_at: string;
  user_name: string;
  action: string;
  company_name: string;
  details: string;
  module?: string | null;
  tenant_id?: string | null;
  user_id?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  COMPANY_CREATED: 'Criação de empresa',
  COMPANY_UPDATED: 'Edição de empresa',
  COMPANY_STATUS_CHANGED: 'Alteração de status da empresa',
  COMPANY_SUSPENDED: 'Suspensão de empresa',
  COMPANY_REACTIVATED: 'Reativação de empresa',
  USER_CREATED: 'Criação de usuário',
  PLAN_CHANGED: 'Alteração de plano',
  RESOURCES_CHANGED: 'Alteração de recursos',
  SUBSCRIPTION_SUSPENDED: 'Suspensão de assinatura',
  SUBSCRIPTION_REACTIVATED: 'Reativação de assinatura',
  SUBSCRIPTION_RENEWED: 'Renovação de assinatura',
  SAAS_PLAN_UPDATE: 'Alteração de plano',
  SAAS_PAYMENT_REGISTERED: 'Pagamento de assinatura registrado',
  SAAS_PAYMENT_STATUS_CHANGED: 'Alteração de status de pagamento',
  SAAS_CHARGE_DELETED: 'Cobrança cancelada excluída',
  CONTRACT_ARCHIVED: 'Contrato SaaS arquivado',
  COMPANY_ADMIN_CREATED: 'Administrador da empresa cadastrado',
  COMPANY_ADMIN_UPDATED: 'Administrador da empresa atualizado',
  COMPANY_ADMIN_DISABLED: 'Administrador da empresa desativado',
  COMPANY_ADMIN_ENABLED: 'Administrador da empresa reativado',
  COMPANY_ADMIN_PASSWORD_RESET: 'Senha de administrador redefinida',
  COMPANY_ADMIN_LIMIT_CHANGED: 'Limite de administradores alterado',
  SUBSCRIPTION_UPDATED: 'Edição de assinatura',
  LOGIN: 'Login',
  LOGIN_SUCCESS: 'Login realizado',
  IMPERSONATION: 'Acesso como empresa',
  IMPERSONATION_STARTED: 'Modo empresa iniciado',
  IMPERSONATION_ENDED: 'Modo empresa encerrado',
};

const MASTER_MODULES = new Set([
  'MASTER',
  'COMPANIES',
  'SAAS',
  'USERS',
  'PLANS',
  'SUBSCRIPTIONS',
  'SALES',
  'AUTH',
  'IMPERSONATION',
  'COMPANY_ADMINS',
  'SAAS_BILLING',
]);

const MASTER_ACTION_PREFIXES = [
  'COMPANY_',
  'USER_',
  'PLAN_',
  'SUBSCRIPTION_',
  'SAAS_',
  'RESOURCES_',
  'COMPANY_ADMIN_',
  'IMPERSONATION_',
  'LOGIN',
];

export function formatMasterAuditAction(action?: string | null): string {
  const key = String(action || '').trim().toUpperCase();
  if (!key) return '—';
  return ACTION_LABELS[key] || key.replace(/_/g, ' ').toLowerCase();
}

export function isMasterAuditEntry(row: {
  module?: string | null;
  action?: string | null;
}): boolean {
  const module = String(row.module || '').toUpperCase();
  const action = String(row.action || '').toUpperCase();
  if (MASTER_MODULES.has(module)) return true;
  return MASTER_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

export function parseAuditDetails(raw?: string | null): string {
  if (!raw) return '—';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(' · ');
    }
  } catch {
    /* plain text */
  }
  return raw;
}

export function mapAuditLogRow(
  row: {
    id: string;
    created_at?: string | null;
    action?: string | null;
    module?: string | null;
    description?: string | null;
    details?: string | null;
    tenant_id?: string | null;
    user_id?: string | null;
  },
  companyNames: Record<string, string>,
  userNames: Record<string, string>,
): MasterAuditRow {
  const tenantId = row.tenant_id || null;
  const details = row.description || parseAuditDetails(row.details);

  return {
    id: row.id,
    created_at: row.created_at || '',
    user_name: (row.user_id && userNames[row.user_id]) || 'Sistema',
    action: formatMasterAuditAction(row.action),
    company_name: (tenantId && companyNames[tenantId]) || '—',
    details,
    module: row.module,
    tenant_id: tenantId,
    user_id: row.user_id,
  };
}

export function masterAuditToCsv(rows: MasterAuditRow[]): string {
  const header = ['Data', 'Usuário', 'Ação', 'Empresa', 'Detalhes'].join(';');
  const lines = rows.map((row) =>
    [
      row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '—',
      row.user_name,
      row.action,
      row.company_name,
      row.details,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(';'),
  );
  return [header, ...lines].join('\n');
}
