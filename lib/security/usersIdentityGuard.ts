/**
 * Regras de identidade de public.users. Não abre conexão.
 * O SQL correspondente está em supabase/proposals, fora de migrations.
 */

export const DEVELOP_PROJECT_REF = 'hoynysmynxncdlptuzub';
export const PRODUCTION_PROJECT_REF = 'aezktedncttwpqeunjej';

export const OPEN_USERS_POLICIES = [
  'Enable insert for authenticated users only',
  'Enable read access for all users',
] as const;

export const USERS_RLS_PROPOSAL = 'supabase/proposals/20261105180000_users_identity_lockdown.sql';

const PLATFORM_ROLES = ['SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER'] as const;
const RESERVED_ROLES = [...PLATFORM_ROLES, 'OWNER'] as const;

export type UsersActorKind = 'authenticated' | 'anon' | 'service_role';

export type UsersIdentityRow = {
  id: string;
  role: string | null;
  tenantId: string | null;
  companyId: string | null;
};

export type UsersIdentityDecision = {
  allow: boolean;
  reason:
    | 'service_role'
    | 'super_admin'
    | 'profile_edit'
    | 'tenant_admin_update'
    | 'tenant_admin_insert'
    | 'self_role'
    | 'self_tenant'
    | 'role_reserved'
    | 'other_user'
    | 'insert_denied'
    | 'tenant_denied'
    | 'anon_denied';
};

function roleOf(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function reserved(role: string): boolean {
  return (RESERVED_ROLES as readonly string[]).includes(role);
}

function same(left: string | null, right: string | null): boolean {
  return (left || null) === (right || null);
}

export function decideUsersIdentityChange(input: {
  actorKind: UsersActorKind;
  actorIsSuperAdmin: boolean;
  actorIsTenantAdmin: boolean;
  actorId: string | null;
  actorTenantId: string | null;
  operation: 'INSERT' | 'UPDATE';
  oldRow?: UsersIdentityRow | null;
  newRow: UsersIdentityRow;
}): UsersIdentityDecision {
  if (input.actorKind === 'service_role') return { allow: true, reason: 'service_role' };
  if (input.actorKind === 'anon') return { allow: false, reason: 'anon_denied' };
  if (input.actorIsSuperAdmin) return { allow: true, reason: 'super_admin' };

  const nextRole = roleOf(input.newRow.role);
  if (input.operation === 'INSERT') {
    if (!input.actorIsTenantAdmin) return { allow: false, reason: 'insert_denied' };
    if (reserved(nextRole)) return { allow: false, reason: 'role_reserved' };
    if (!input.actorTenantId || input.newRow.tenantId !== input.actorTenantId) {
      return { allow: false, reason: 'tenant_denied' };
    }
    if (input.newRow.companyId && input.newRow.companyId !== input.actorTenantId) {
      return { allow: false, reason: 'tenant_denied' };
    }
    return { allow: true, reason: 'tenant_admin_insert' };
  }

  const previous = input.oldRow;
  if (!previous) return { allow: false, reason: 'other_user' };
  const self = Boolean(input.actorId && previous.id === input.actorId);
  if (!self && !input.actorIsTenantAdmin) return { allow: false, reason: 'other_user' };

  if (!same(previous.role, input.newRow.role)) {
    if (self) return { allow: false, reason: 'self_role' };
    if (reserved(nextRole)) return { allow: false, reason: 'role_reserved' };
  }

  if (!same(previous.tenantId, input.newRow.tenantId)) {
    if (self || !input.actorIsTenantAdmin) return { allow: false, reason: 'self_tenant' };
    if (input.newRow.tenantId !== input.actorTenantId) return { allow: false, reason: 'tenant_denied' };
  }

  if (!same(previous.companyId, input.newRow.companyId)) {
    if (self || !input.actorIsTenantAdmin) return { allow: false, reason: 'self_tenant' };
    if (input.newRow.companyId && input.newRow.companyId !== input.actorTenantId) {
      return { allow: false, reason: 'tenant_denied' };
    }
  }

  return { allow: true, reason: self ? 'profile_edit' : 'tenant_admin_update' };
}

export function sessionCallerDecision(input: {
  sessionUserId: string | null | undefined;
  claimedCallerId: string | null | undefined;
}): { allow: boolean; reason: 'session' | 'missing_session' | 'caller_mismatch' } {
  const sessionUserId = String(input.sessionUserId || '').trim();
  const claimedCallerId = String(input.claimedCallerId || '').trim();
  if (!sessionUserId) return { allow: false, reason: 'missing_session' };
  if (claimedCallerId && claimedCallerId !== sessionUserId) {
    return { allow: false, reason: 'caller_mismatch' };
  }
  return { allow: true, reason: 'session' };
}

export function brokerCreateTenantDecision(input: {
  callerRole: string | null | undefined;
  callerTenantId: string | null | undefined;
  requestedTenantId: string | null | undefined;
}): { allow: boolean; reason: 'platform_admin' | 'same_tenant' | 'foreign_tenant' | 'missing_tenant' } {
  const requested = String(input.requestedTenantId || '').trim();
  if (!requested) return { allow: false, reason: 'missing_tenant' };
  const role = roleOf(input.callerRole);
  if ((PLATFORM_ROLES as readonly string[]).includes(role)) {
    return { allow: true, reason: 'platform_admin' };
  }
  const callerTenant = String(input.callerTenantId || '').trim();
  if (!callerTenant || callerTenant !== requested) return { allow: false, reason: 'foreign_tenant' };
  return { allow: true, reason: 'same_tenant' };
}
