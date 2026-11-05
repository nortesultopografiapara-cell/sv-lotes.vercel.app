/**
 * Modelo local da RLS de finance_receipts e da decisão de tenant no service role.
 * Não abre conexão e não altera o banco. A proposta SQL correspondente está em
 * supabase/proposals/20261105170000_finance_receipts_rls_lockdown.sql.
 */

export const DEVELOP_PROJECT_REF = 'hoynysmynxncdlptuzub';
export const PRODUCTION_PROJECT_REF = 'aezktedncttwpqeunjej';

export const BROAD_FINANCE_RECEIPT_POLICIES = [
  'Allow select finance_receipts',
  'Allow insert finance_receipts',
  'Allow update finance_receipts',
  'Allow delete finance_receipts for authenticated users',
] as const;

export const FINANCE_RECEIPT_RLS_PROPOSAL =
  'supabase/proposals/20261105170000_finance_receipts_rls_lockdown.sql';

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN'] as const;

export type FinanceCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
export type FinanceRole = 'anon' | 'authenticated' | 'service_role';

export type FinancePolicyModel = {
  name: string;
  permissive: boolean;
  command: FinanceCommand | 'ALL';
  roles: Array<'anon' | 'authenticated' | 'public'>;
  expression: 'true' | 'tenant';
};

export type FinanceActor = {
  role: FinanceRole;
  isSuperAdmin: boolean;
  ownerReadonly: boolean;
  currentTenantId: string | null;
};

export type FinanceRowScope = {
  tenantId: string | null;
  companyId: string | null;
};

export type ServiceRoleTenantDecision = {
  allow: boolean;
  reason:
    | 'platform_admin'
    | 'same_tenant'
    | 'foreign_tenant'
    | 'missing_caller_tenant'
    | 'missing_requested_tenant';
};

function commandMatches(policyCommand: FinancePolicyModel['command'], command: FinanceCommand): boolean {
  return policyCommand === 'ALL' || policyCommand === command;
}

function roleMatches(roles: FinancePolicyModel['roles'], role: FinanceRole): boolean {
  if (role === 'service_role') return false;
  return roles.includes('public') || roles.includes(role);
}

function sameTenant(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left === right);
}

/** Leitura: a empresa casa com tenant_id ou company_id, como em sales. */
export function financeReceiptVisibleToTenant(
  actor: FinanceActor,
  row: FinanceRowScope,
): boolean {
  if (actor.isSuperAdmin) return true;
  return (
    sameTenant(row.tenantId, actor.currentTenantId) ||
    sameTenant(row.companyId, actor.currentTenantId)
  );
}

/**
 * Escrita: os dois campos, quando preenchidos, precisam ser a empresa da sessão.
 * Impede gravar tenant_id de outra empresa mesmo que company_id seja o próprio.
 */
export function financeReceiptWritableByTenant(
  actor: FinanceActor,
  row: FinanceRowScope,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (!actor.currentTenantId) return false;
  const tenantOk = row.tenantId == null || row.tenantId === actor.currentTenantId;
  const companyOk = row.companyId == null || row.companyId === actor.currentTenantId;
  const anchored =
    row.tenantId === actor.currentTenantId || row.companyId === actor.currentTenantId;
  return tenantOk && companyOk && anchored;
}

function expressionAllows(
  policy: FinancePolicyModel,
  actor: FinanceActor,
  row: FinanceRowScope | null | undefined,
  write: boolean,
): boolean {
  if (!row) return false;
  if (policy.expression === 'true') return true;
  return write
    ? financeReceiptWritableByTenant(actor, row)
    : financeReceiptVisibleToTenant(actor, row);
}

export function financeReceiptOperationAllowed(input: {
  policies: FinancePolicyModel[];
  privileges: FinanceCommand[];
  actor: FinanceActor;
  command: FinanceCommand;
  existing?: FinanceRowScope | null;
  next?: FinanceRowScope | null;
}): boolean {
  const { actor, command, policies, privileges } = input;
  if (actor.role === 'service_role') return true;
  if (!privileges.includes(command)) return false;
  if (actor.ownerReadonly && command !== 'SELECT') return false;

  const applicable = policies.filter(
    (policy) => commandMatches(policy.command, command) && roleMatches(policy.roles, actor.role),
  );
  const permissive = applicable.filter((policy) => policy.permissive);
  if (permissive.length === 0) return false;

  const allowedByPolicy = permissive.some((policy) => {
    if (command === 'SELECT' || command === 'DELETE') {
      return expressionAllows(policy, actor, input.existing, false);
    }
    if (command === 'INSERT') {
      return expressionAllows(policy, actor, input.next, true);
    }
    return (
      expressionAllows(policy, actor, input.existing, false) &&
      expressionAllows(policy, actor, input.next, true)
    );
  });
  if (!allowedByPolicy) return false;

  const restrictive = applicable.filter((policy) => !policy.permissive);
  return restrictive.every((policy) => {
    const row = command === 'INSERT' ? input.next : input.existing;
    return expressionAllows(policy, actor, row, command !== 'SELECT');
  });
}

/** Porta ainda não ligada nas rotas. service_role ignora RLS, então a API precisa desta decisão. */
export function decideServiceRoleFinanceTenantWrite(input: {
  callerRole: string | null | undefined;
  callerTenantId: string | null | undefined;
  requestedTenantId: string | null | undefined;
}): ServiceRoleTenantDecision {
  const requested = String(input.requestedTenantId || '').trim();
  if (!requested) return { allow: false, reason: 'missing_requested_tenant' };

  const role = String(input.callerRole || '').trim().toUpperCase();
  if (PLATFORM_ADMIN_ROLES.includes(role as (typeof PLATFORM_ADMIN_ROLES)[number])) {
    return { allow: true, reason: 'platform_admin' };
  }

  const caller = String(input.callerTenantId || '').trim();
  if (!caller) return { allow: false, reason: 'missing_caller_tenant' };
  if (caller !== requested) return { allow: false, reason: 'foreign_tenant' };
  return { allow: true, reason: 'same_tenant' };
}

export function observedDevelopFinanceReceiptPolicies(): FinancePolicyModel[] {
  return [
    {
      name: 'Allow select finance_receipts',
      permissive: true,
      command: 'SELECT',
      roles: ['authenticated'],
      expression: 'true',
    },
    {
      name: 'Allow insert finance_receipts',
      permissive: true,
      command: 'INSERT',
      roles: ['authenticated'],
      expression: 'true',
    },
    {
      name: 'Allow update finance_receipts',
      permissive: true,
      command: 'UPDATE',
      roles: ['authenticated'],
      expression: 'true',
    },
    {
      name: 'Allow delete finance_receipts for authenticated users',
      permissive: true,
      command: 'DELETE',
      roles: ['authenticated'],
      expression: 'true',
    },
    {
      name: 'tenant_isolation_finance_receipts',
      permissive: true,
      command: 'ALL',
      roles: ['public'],
      expression: 'tenant',
    },
  ];
}

export function proposedFinanceReceiptPolicies(): FinancePolicyModel[] {
  return [
    {
      name: 'tenant_isolation_finance_receipts',
      permissive: true,
      command: 'ALL',
      roles: ['authenticated'],
      expression: 'tenant',
    },
  ];
}

export const OBSERVED_DEVELOP_PRIVILEGES: FinanceCommand[] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
];

export const PROPOSED_AUTHENTICATED_PRIVILEGES: FinanceCommand[] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
];

export const PROPOSED_ANON_PRIVILEGES: FinanceCommand[] = [];
