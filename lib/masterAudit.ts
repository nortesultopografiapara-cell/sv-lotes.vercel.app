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

export type RawAuditLogRow = {
  id: string;
  created_at?: string | null;
  action?: string | null;
  module?: string | null;
  description?: string | null;
  details?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  old_data?: unknown;
  new_data?: unknown;
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
  SAAS_INVOICE_GENERATED: 'Cobrança SaaS gerada',
  SAAS_CHARGE_CREATED: 'Cobrança SaaS criada',
  SAAS_CHARGE_PAID: 'Cobrança SaaS paga',
  SAAS_CHARGE_DELETED: 'Cobrança cancelada excluída',
  CONTRACT_ARCHIVED: 'Contrato SaaS arquivado',
  CONTRACT_SIGNED_ELECTRONICALLY: 'Contrato assinado eletronicamente',
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
  TOPOGRAPHY_PROJECT_CREATED: 'Projeto Topografia criado',
  TOPOGRAPHY_PROJECT_UPDATED: 'Projeto Topografia editado',
  TOPOGRAPHY_PROJECT_STATUS_CHANGED: 'Status de projeto Topografia alterado',
  TOPOGRAPHY_PROJECT_MANAGER_CHANGED: 'Responsável de projeto Topografia alterado',
  TOPOGRAPHY_PROJECT_VALUE_CHANGED: 'Valor contratado Topografia alterado',
  TOPOGRAPHY_PROJECT_PROGRESS_CHANGED: 'Progresso de projeto Topografia alterado',
  TOPOGRAPHY_PROJECT_ARCHIVED: 'Projeto Topografia arquivado',
  TOPOGRAPHY_PROJECT_RESTORED: 'Projeto Topografia restaurado',
  TOPOGRAPHY_QUOTE_CREATED: 'Orçamento Topografia criado',
  TOPOGRAPHY_QUOTE_UPDATED: 'Orçamento Topografia editado',
  TOPOGRAPHY_QUOTE_STATUS_CHANGED: 'Status de orçamento Topografia alterado',
  TOPOGRAPHY_QUOTE_ARCHIVED: 'Orçamento Topografia arquivado',
  TOPOGRAPHY_QUOTE_RESTORED: 'Orçamento Topografia restaurado',
  TOPOGRAPHY_QUOTE_DUPLICATED: 'Orçamento Topografia duplicado',
  TOPOGRAPHY_QUOTE_CONVERTED: 'Orçamento convertido em projeto',
  TOPOGRAPHY_QUOTE_STRUCTURE_SAVED: 'Estrutura de orçamento Topografia salva',
  TOPOGRAPHY_CUSTOM_ITEM_CREATED: 'Item próprio Topografia criado',
  TOPOGRAPHY_PRICE_IMPORT: 'Importação de banco de preços Topografia',
};

/** Módulos operacionais de tenant — fora do escopo da Auditoria Master. */
const OPERATIONAL_MODULES = new Set(['GIS', 'FINANCE', 'BROKERS', 'SALES']);

const MASTER_MODULES = new Set([
  'MASTER',
  'COMPANIES',
  'SAAS',
  'USERS',
  'PLANS',
  'SUBSCRIPTIONS',
  'AUTH',
  'IMPERSONATION',
  'COMPANY_ADMINS',
  'SAAS_BILLING',
  'CONTRACTS',
  'WHATSAPP',
  'TOPOGRAPHY',
]);

/** Módulos usados nas escritas Master SaaS no código (referência). */
export const MASTER_AUDIT_WRITTEN_MODULES = [
  'SUBSCRIPTIONS',
  'SAAS_BILLING',
  'SAAS',
  'COMPANY_ADMINS',
  'CONTRACTS',
] as const;

/** Módulos consultados diretamente no SQL (schema real confirmado). */
export const MASTER_AUDIT_SQL_MODULES = [
  'SAAS_BILLING',
  'SAAS',
  'SUBSCRIPTIONS',
  'COMPANY_ADMINS',
  'CONTRACTS',
  'WHATSAPP',
  'MASTER',
  'COMPANIES',
] as const;

/** Módulos aceitos pelo filtro em memória (referência / diagnóstico). */
export const MASTER_AUDIT_MODULES = [...MASTER_AUDIT_SQL_MODULES] as const;

const MASTER_ACTION_PREFIXES = [
  'COMPANY_',
  'USER_',
  'PLAN_',
  'SUBSCRIPTION_',
  'SAAS_',
  'CONTRACT_',
  'RESOURCES_',
  'COMPANY_ADMIN_',
  'IMPERSONATION_',
  'WHATSAPP_',
  'MASTER_',
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
  const module = String(row.module || '').trim().toUpperCase();
  const action = String(row.action || '').trim().toUpperCase();
  if (module && OPERATIONAL_MODULES.has(module)) return false;
  if (module && MASTER_MODULES.has(module)) return true;
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

export function normalizeAuditLogRow(row: RawAuditLogRow): RawAuditLogRow {
  const module =
    row.module ||
    (row.entity_type && row.entity_type !== 'unknown' ? String(row.entity_type).toUpperCase() : null);
  const description =
    row.description ||
    row.details ||
    (row.new_data && typeof row.new_data === 'object'
      ? JSON.stringify(row.new_data)
      : null);

  return {
    ...row,
    module,
    description,
    tenant_id: row.tenant_id || row.company_id || null,
    company_id: row.company_id || row.tenant_id || null,
  };
}

export function resolveAuditCompanyId(row: {
  tenant_id?: string | null;
  company_id?: string | null;
}): string | null {
  return row.tenant_id || row.company_id || null;
}

export function mapAuditLogRow(
  row: RawAuditLogRow,
  companyNames: Record<string, string>,
  userNames: Record<string, string>,
): MasterAuditRow {
  const normalized = normalizeAuditLogRow(row);
  const tenantId = resolveAuditCompanyId(normalized);
  const details =
    normalized.description || parseAuditDetails(normalized.details);

  return {
    id: normalized.id,
    created_at: normalized.created_at || '',
    user_name: (normalized.user_id && userNames[normalized.user_id]) || 'Sistema',
    action: formatMasterAuditAction(normalized.action),
    company_name: (tenantId && companyNames[tenantId]) || '—',
    details,
    module: normalized.module,
    tenant_id: tenantId,
    user_id: normalized.user_id,
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
