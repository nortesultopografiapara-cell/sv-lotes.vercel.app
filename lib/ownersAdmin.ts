import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidOwnerProfileType,
  normalizeOwnerProfileType,
  normalizeOwnerStatus,
} from '@/lib/ownerProfiles';
import { isTenantAdminRole, type OwnerProjectAccessInput } from '@/lib/ownerProjectAccess';
import { isPlatformAdmin } from '@/lib/rls';

export type OwnersAdminContext = {
  ok: boolean;
  error?: string;
  status?: number;
  callerId?: string;
  callerRole?: string;
  tenantId?: string;
};

export async function resolveOwnersAdminContext(
  admin: SupabaseClient,
  authUserId: string,
  impersonatingTenantId?: string | null,
): Promise<OwnersAdminContext> {
  const { data: caller, error } = await admin
    .from('users')
    .select('id, role, tenant_id, company_id, status')
    .eq('id', authUserId)
    .single();

  if (error || !caller) {
    return { ok: false, error: 'Usuário autenticador não encontrado.', status: 403 };
  }

  const callerRole = String(caller.role || '').toUpperCase();
  if (!isPlatformAdmin(callerRole) && !isTenantAdminRole(callerRole)) {
    return {
      ok: false,
      error: 'Permissão negada. Apenas administradores da empresa.',
      status: 403,
    };
  }

  if ((caller.status || 'ACTIVE').toUpperCase() === 'INACTIVE') {
    return { ok: false, error: 'Usuário administrador inativo.', status: 403 };
  }

  let tenantId = caller.tenant_id || caller.company_id || null;
  if (impersonatingTenantId && isPlatformAdmin(callerRole)) {
    tenantId = impersonatingTenantId;
  }

  if (!tenantId) {
    return {
      ok: false,
      error: 'Empresa não vinculada. Use "Entrar como Empresa" se for Super Admin.',
      status: 400,
    };
  }

  return {
    ok: true,
    callerId: caller.id,
    callerRole,
    tenantId: String(tenantId),
  };
}

export async function assertOwnerBelongsToTenant(
  admin: SupabaseClient,
  ownerId: string,
  tenantId: string,
): Promise<{ ok: boolean; error?: string; status?: number; owner?: Record<string, unknown> }> {
  const { data: owner, error } = await admin
    .from('users')
    .select('id, role, tenant_id, company_id, email, full_name, phone, status, owner_profile_type, owner_document')
    .eq('id', ownerId)
    .single();

  if (error || !owner) {
    return { ok: false, error: 'Sócio/proprietário não encontrado.', status: 404 };
  }

  const ownerTenant = owner.tenant_id || owner.company_id;
  if (String(ownerTenant) !== tenantId) {
    return { ok: false, error: 'Usuário pertence a outra empresa.', status: 403 };
  }

  if (String(owner.role || '').toUpperCase() !== 'OWNER') {
    return { ok: false, error: 'Usuário não é do tipo OWNER.', status: 400 };
  }

  return { ok: true, owner };
}

export async function findTenantUserByEmail(
  admin: SupabaseClient,
  tenantId: string,
  email: string,
): Promise<Record<string, unknown> | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data } = await admin
    .from('users')
    .select('id, role, tenant_id, company_id, email, full_name, status')
    .ilike('email', normalizedEmail);

  const match = (data || []).find((row) => {
    const rowTenant = row.tenant_id || row.company_id;
    return rowTenant && String(rowTenant) === tenantId;
  });

  return match || null;
}

export function generateTempPassword(length = 10): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return value;
}

export async function createOrLinkAuthUser(
  admin: SupabaseClient,
  params: { email: string; password: string; fullName: string; tenantId: string },
): Promise<{ authUserId: string; isExisting: boolean; temporaryPassword: string | null }> {
  const email = params.email.trim().toLowerCase();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      full_name: params.fullName,
      role: 'OWNER',
      tenant_id: params.tenantId,
    },
  });

  if (!authError && authUser?.user?.id) {
    return {
      authUserId: authUser.user.id,
      isExisting: false,
      temporaryPassword: params.password,
    };
  }

  if (
    !authError?.message.includes('already been registered') &&
    (authError as { status?: number } | null)?.status !== 422
  ) {
    throw new Error(authError?.message || 'Erro ao criar conta de autenticação.');
  }

  let authUserId: string | null = null;
  let page = 1;
  while (true) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data?.users?.length) break;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found?.id) {
      authUserId = found.id;
      break;
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  if (!authUserId) {
    throw new Error('E-mail já registrado, mas não foi possível localizar o usuário.');
  }

  return { authUserId, isExisting: true, temporaryPassword: null };
}

export async function upsertOwnerUserRecord(
  admin: SupabaseClient,
  params: {
    authUserId: string;
    tenantId: string;
    fullName: string;
    email: string;
    phone?: string | null;
    ownerProfileType: string;
    ownerDocument?: string | null;
    status?: string | null;
    forcePasswordChange?: boolean;
  },
): Promise<void> {
  const ownerProfileType = normalizeOwnerProfileType(params.ownerProfileType);
  if (!ownerProfileType) {
    throw new Error('Tipo de sócio/proprietário inválido.');
  }

  const payload = {
    tenant_id: params.tenantId,
    full_name: params.fullName.trim(),
    email: params.email.trim().toLowerCase(),
    phone: params.phone?.trim() || null,
    role: 'OWNER',
    status: normalizeOwnerStatus(params.status),
    owner_profile_type: ownerProfileType,
    owner_document: params.ownerDocument?.trim() || null,
    force_password_change: params.forcePasswordChange ?? false,
  };

  const { data: existing } = await admin
    .from('users')
    .select('id, tenant_id, company_id, role')
    .eq('id', params.authUserId)
    .maybeSingle();

  if (existing) {
    const existingTenant = existing.tenant_id || existing.company_id;
    if (existingTenant && String(existingTenant) !== params.tenantId) {
      throw new Error('Este e-mail já está vinculado a outra empresa.');
    }
    const existingRole = String(existing.role || '').toUpperCase();
    if (existingRole && existingRole !== 'OWNER') {
      throw new Error('Este e-mail já pertence a outro perfil na empresa.');
    }

    const { error } = await admin.from('users').update(payload).eq('id', params.authUserId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from('users').insert({
    id: params.authUserId,
    ...payload,
  });
  if (error) throw new Error(error.message);
}

export async function saveOwnerProjectAccessEntries(
  admin: SupabaseClient,
  params: { userId: string; tenantId: string; entries: OwnerProjectAccessInput[] },
): Promise<void> {
  const projectIds = params.entries.map((entry) => entry.project_id).filter(Boolean);

  if (projectIds.length > 0) {
    const { data: projects, error: projectsErr } = await admin
      .from('projects')
      .select('id, tenant_id, company_id')
      .in('id', projectIds);

    if (projectsErr) throw new Error(projectsErr.message);

    const invalid = (projects || []).some((project) => {
      const projectTenant = project.tenant_id || project.company_id;
      return String(projectTenant) !== params.tenantId;
    });

    if (invalid || (projects || []).length !== projectIds.length) {
      throw new Error('Um ou mais empreendimentos não pertencem à empresa.');
    }
  }

  const { error: deleteErr } = await admin
    .from('owner_project_access')
    .delete()
    .eq('user_id', params.userId)
    .eq('tenant_id', params.tenantId);

  if (deleteErr) throw new Error(deleteErr.message);

  if (!params.entries.length) return;

  const payload = params.entries.map((entry) => ({
    tenant_id: params.tenantId,
    user_id: params.userId,
    project_id: entry.project_id,
    can_view_dashboard: entry.can_view_dashboard !== false,
    can_view_map: entry.can_view_map !== false,
    can_view_finance: entry.can_view_finance !== false,
    can_view_contracts: entry.can_view_contracts !== false,
  }));

  const { error: insertErr } = await admin.from('owner_project_access').insert(payload);
  if (insertErr) throw new Error(insertErr.message);
}

export function validateOwnerCreatePayload(body: Record<string, unknown>) {
  const fullName = String(body.fullName || body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const ownerProfileType = String(body.ownerProfileType || body.owner_profile_type || '').trim();

  if (!fullName) return 'Nome é obrigatório.';
  if (!email || !email.includes('@')) return 'E-mail válido é obrigatório.';
  if (!isValidOwnerProfileType(ownerProfileType)) return 'Tipo de sócio/proprietário inválido.';

  return null;
}
