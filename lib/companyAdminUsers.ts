/**
 * Administradores internos por empresa (ADMIN_EMPRESA e equivalentes).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findBrokerForUserInTenant,
  resolveBrokerAdminEmailConflict,
  brokerAdminEmailConflictMessage,
} from '@/lib/brokerDelete';
import {
  generateTempPassword,
  resolveOwnersAdminContextFromRequest,
  resolveUsersTenantId,
  type OwnersRequestAuthInput,
} from '@/lib/ownersAdmin';
import { normalizeUserRole } from '@/lib/rolePermissions';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { MENESES_COMPANY_ID } from '@/lib/saasContractContent';

export const COMPANY_ADMIN_ROLE_VALUES = [
  'ADMIN',
  'ADMIN_EMPRESA',
  'COMPANY_ADMIN',
] as const;

export const DEFAULT_COMPANY_ADMIN_USERS_LIMIT = 1;
export const MENESES_COMPANY_ADMIN_USERS_LIMIT = 5;

export type CompanyAdminUserRow = {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  job_title: string | null;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  created_by: string | null;
};

export type CompanyAdminListMeta = {
  tenantId: string;
  limit: number;
  activeCount: number;
  canCreate: boolean;
};

export function isCompanyAdminUserRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (COMPANY_ADMIN_ROLE_VALUES as readonly string[]).includes(normalized);
}

export function resolveCompanyAdminUsersLimit(
  company?: { admin_users_limit?: number | null } | null,
): number {
  const raw = company?.admin_users_limit;
  if (raw == null || !Number.isFinite(Number(raw))) {
    return DEFAULT_COMPANY_ADMIN_USERS_LIMIT;
  }
  const n = Math.trunc(Number(raw));
  return n < 1 ? DEFAULT_COMPANY_ADMIN_USERS_LIMIT : n;
}

export function countActiveCompanyAdmins(rows: Pick<CompanyAdminUserRow, 'status'>[]): number {
  return rows.filter((row) => normalizeAdminStatus(row.status) === 'ACTIVE').length;
}

export function canCreateCompanyAdmin(
  activeCount: number,
  limit: number,
): { ok: boolean; error?: string } {
  if (activeCount >= limit) {
    return {
      ok: false,
      error: `Limite de administradores atingido (${limit}). Solicite aumento ao suporte SV LOTES.`,
    };
  }
  return { ok: true };
}

export function normalizeAdminStatus(value?: string | null): 'ACTIVE' | 'INACTIVE' {
  return String(value || 'ACTIVE').trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function formatCompanyAdminAuditDescription(
  actorName: string,
  action: string,
  targetName: string,
  extra?: string,
): string {
  const base = `${actorName} — ${targetName}`;
  return extra ? `${base}: ${extra}` : base;
}

export function assertTenantAccess(
  callerTenantId: string | null | undefined,
  targetTenantId: string,
  callerRole?: string | null,
): { ok: boolean; error?: string } {
  if (isPlatformAdmin(normalizeUserRole(callerRole))) {
    return { ok: true };
  }
  if (!callerTenantId || callerTenantId !== targetTenantId) {
    return { ok: false, error: 'Acesso negado: empresa diferente do tenant logado.' };
  }
  return { ok: true };
}

export function secondaryAdminCannotAccessMaster(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === 'ADMIN_EMPRESA' || normalized === 'COMPANY_ADMIN';
}

export function mapCompanyAdminRow(row: Record<string, unknown>): CompanyAdminUserRow {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    full_name: row.full_name ? String(row.full_name) : null,
    email: String(row.email || ''),
    phone: row.phone ? String(row.phone) : null,
    job_title: row.job_title ? String(row.job_title) : null,
    role: String(row.role || ''),
    status: String(row.status || 'ACTIVE'),
    created_at: String(row.created_at || ''),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
  };
}

const COMPANY_ADMIN_SELECT =
  'id, tenant_id, full_name, email, phone, job_title, role, status, created_at, last_login_at, created_by';

export async function resolveCompanyAdminContextFromRequest(
  request: Request,
  admin: SupabaseClient,
  input?: OwnersRequestAuthInput,
) {
  return resolveOwnersAdminContextFromRequest(request, admin, input);
}

export async function loadCompanyAdminLimit(
  admin: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { data } = await admin
    .from('companies')
    .select('admin_users_limit')
    .eq('id', tenantId)
    .maybeSingle();

  if (!data && tenantId === MENESES_COMPANY_ID) {
    return MENESES_COMPANY_ADMIN_USERS_LIMIT;
  }

  return resolveCompanyAdminUsersLimit(data);
}

export async function listCompanyAdminUsers(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ admins: CompanyAdminUserRow[]; meta: CompanyAdminListMeta }> {
  const { data, error } = await admin
    .from('users')
    .select(COMPANY_ADMIN_SELECT)
    .eq('tenant_id', tenantId)
    .in('role', [...COMPANY_ADMIN_ROLE_VALUES])
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const admins = (data || []).map((row) => mapCompanyAdminRow(row as Record<string, unknown>));
  const limit = await loadCompanyAdminLimit(admin, tenantId);
  const activeCount = countActiveCompanyAdmins(admins);
  const quota = canCreateCompanyAdmin(activeCount, limit);

  return {
    admins,
    meta: {
      tenantId,
      limit,
      activeCount,
      canCreate: quota.ok,
    },
  };
}

export async function findUserByEmailGlobal(
  admin: SupabaseClient,
  email: string,
): Promise<Record<string, unknown> | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .from('users')
    .select('id, email, tenant_id, role, status')
    .ilike('email', normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>) || null;
}

export async function createCompanyAdminUser(
  admin: SupabaseClient,
  params: {
    tenantId: string;
    createdBy: string;
    fullName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    password?: string;
    role?: string;
  },
): Promise<{ admin: CompanyAdminUserRow; temporaryPassword: string | null; isExisting: boolean }> {
  const tenantId = params.tenantId.trim();
  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();
  const role = normalizeUserRole(params.role || 'ADMIN_EMPRESA');

  if (!isCompanyAdminUserRole(role)) {
    throw new Error('Perfil inválido para administrador da empresa.');
  }

  const { admins, meta } = await listCompanyAdminUsers(admin, tenantId);
  const quota = canCreateCompanyAdmin(meta.activeCount, meta.limit);
  if (!quota.ok) {
    throw new Error(quota.error || 'Limite de administradores atingido.');
  }

  const temporaryPassword = params.password?.trim() || generateTempPassword(10);
  let authUserId: string | null = null;
  let isExisting = false;

  const existing = await findUserByEmailGlobal(admin, email);
  if (existing) {
    const brokerRecord = await findBrokerForUserInTenant(admin, String(existing.id), tenantId);
    const conflict = resolveBrokerAdminEmailConflict({
      existingUser: existing,
      brokerRecord,
      tenantId,
      isAdminRole: isCompanyAdminUserRole,
    });
    const conflictMessage = brokerAdminEmailConflictMessage(conflict);
    if (conflictMessage) {
      throw new Error(conflictMessage);
    }
    if (conflict === 'same_tenant_inactive_broker_promotable') {
      isExisting = true;
    }
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
      tenant_id: tenantId,
    },
  });

  if (authError) {
    if (
      authError.message.includes('already been registered') ||
      (authError as { status?: number }).status === 422
    ) {
      isExisting = true;
      let page = 1;
      while (true) {
        const { data: listed } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (!listed?.users?.length) break;
        const found = listed.users.find((u) => u.email?.toLowerCase() === email);
        if (found?.id) {
          authUserId = found.id;
          break;
        }
        if (listed.users.length < 1000) break;
        page += 1;
      }
      if (!authUserId) {
        throw new Error('E-mail já registrado, mas não foi possível localizar a conta.');
      }
      await admin.auth.admin.updateUserById(authUserId, {
        password: temporaryPassword,
        user_metadata: { full_name: fullName, role, tenant_id: tenantId },
      });
    } else {
      throw new Error(`Erro ao criar conta: ${authError.message}`);
    }
  } else {
    authUserId = authUser.user.id;
  }

  const profilePayload = {
    tenant_id: tenantId,
    full_name: fullName,
    email,
    phone: params.phone?.trim() || null,
    job_title: params.jobTitle?.trim() || null,
    role,
    status: 'ACTIVE',
    created_by: params.createdBy,
    force_password_change: !params.password,
  };

  const { data: profile, error: profileError } = await admin
    .from('users')
    .upsert({ id: authUserId, ...profilePayload }, { onConflict: 'id' })
    .select(COMPANY_ADMIN_SELECT)
    .single();

  if (profileError || !profile) {
    if (!isExisting && authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }
    throw new Error(profileError?.message || 'Erro ao salvar perfil do administrador.');
  }

  return {
    admin: mapCompanyAdminRow(profile as Record<string, unknown>),
    temporaryPassword: isExisting ? temporaryPassword : temporaryPassword,
    isExisting,
  };
}

export async function updateCompanyAdminUser(
  admin: SupabaseClient,
  params: {
    tenantId: string;
    adminId: string;
    fullName?: string;
    phone?: string;
    jobTitle?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  },
): Promise<CompanyAdminUserRow> {
  const { data: current, error: loadErr } = await admin
    .from('users')
    .select(COMPANY_ADMIN_SELECT)
    .eq('id', params.adminId)
    .maybeSingle();

  if (loadErr || !current) {
    throw new Error('Administrador não encontrado.');
  }

  const row = mapCompanyAdminRow(current as Record<string, unknown>);
  if (row.tenant_id !== params.tenantId) {
    throw new Error('Administrador pertence a outra empresa.');
  }
  if (!isCompanyAdminUserRole(row.role)) {
    throw new Error('Usuário não é administrador da empresa.');
  }

  if (params.status === 'ACTIVE') {
    const { meta } = await listCompanyAdminUsers(admin, params.tenantId);
    const currentlyInactive = normalizeAdminStatus(row.status) === 'INACTIVE';
    if (currentlyInactive) {
      const quota = canCreateCompanyAdmin(meta.activeCount, meta.limit);
      if (!quota.ok) {
        throw new Error(quota.error || 'Limite de administradores atingido.');
      }
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (params.fullName != null) updatePayload.full_name = params.fullName.trim();
  if (params.phone != null) updatePayload.phone = params.phone.trim() || null;
  if (params.jobTitle != null) updatePayload.job_title = params.jobTitle.trim() || null;
  if (params.status != null) updatePayload.status = params.status;

  const { data: updated, error } = await admin
    .from('users')
    .update(updatePayload)
    .eq('id', params.adminId)
    .eq('tenant_id', params.tenantId)
    .select(COMPANY_ADMIN_SELECT)
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Erro ao atualizar administrador.');
  }

  return mapCompanyAdminRow(updated as Record<string, unknown>);
}

export async function resetCompanyAdminPassword(
  admin: SupabaseClient,
  params: { tenantId: string; adminId: string; password?: string },
): Promise<{ temporaryPassword: string }> {
  const { data: current, error: loadErr } = await admin
    .from('users')
    .select('id, tenant_id, role, email')
    .eq('id', params.adminId)
    .maybeSingle();

  if (loadErr || !current) {
    throw new Error('Administrador não encontrado.');
  }

  if (String(current.tenant_id) !== params.tenantId) {
    throw new Error('Administrador pertence a outra empresa.');
  }
  if (!isCompanyAdminUserRole(String(current.role))) {
    throw new Error('Usuário não é administrador da empresa.');
  }

  const temporaryPassword = params.password?.trim() || generateTempPassword(10);
  const { error } = await admin.auth.admin.updateUserById(params.adminId, {
    password: temporaryPassword,
  });
  if (error) {
    throw new Error(`Erro ao redefinir senha: ${error.message}`);
  }

  await admin
    .from('users')
    .update({ force_password_change: true })
    .eq('id', params.adminId);

  return { temporaryPassword };
}

export async function updateCompanyAdminUsersLimit(
  admin: SupabaseClient,
  companyId: string,
  limit: number,
): Promise<number> {
  const normalized = Math.max(1, Math.trunc(limit));
  const { error } = await admin
    .from('companies')
    .update({ admin_users_limit: normalized })
    .eq('id', companyId);

  if (error) {
    throw new Error(error.message);
  }
  return normalized;
}

export async function insertCompanyAdminAuditLog(
  admin: SupabaseClient,
  params: {
    action: string;
    tenantId: string;
    actorUserId: string;
    actorName: string;
    targetAdminId?: string;
    targetName?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const description =
    params.description ||
    formatCompanyAdminAuditDescription(
      params.actorName,
      params.action,
      params.targetName || 'administrador',
    );

  await admin.from('audit_logs').insert({
    tenant_id: params.tenantId,
    company_id: params.tenantId,
    user_id: params.actorUserId,
    action: params.action,
    module: 'COMPANY_ADMINS',
    description,
    reference_id: params.targetAdminId || null,
  });
}

export async function resolveActorDisplayName(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from('users')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || 'Usuário');
}

export function assertCallerCanManageCompanyAdmins(role?: string | null): {
  ok: boolean;
  error?: string;
} {
  if (isPlatformAdmin(normalizeUserRole(role)) || isTenantAdminRole(role)) {
    return { ok: true };
  }
  return { ok: false, error: 'Permissão negada.' };
}
