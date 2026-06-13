import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidOwnerProfileType,
  normalizeOwnerProfileType,
  normalizeOwnerStatus,
} from '@/lib/ownerProfiles';
import { isBrokerRole, isOwnerRole } from '@/lib/rolePermissions';
import { isTenantAdminRole, type OwnerProjectAccessInput } from '@/lib/ownerProjectAccess';
import { isPlatformAdmin } from '@/lib/rls';
import { getRequestAuthUser } from '@/lib/supabase/server';

export const OWNERS_SESSION_EXPIRED_MESSAGE =
  'Sua sessão expirou. Faça login novamente.';

export const OWNERS_SESSION_CONFIRM_MESSAGE =
  'Não foi possível confirmar sua sessão. Saia e entre novamente.';

/** Colunas reais de public.users em produção (sem company_id). */
export const USERS_CALLER_SELECT =
  'id, role, tenant_id, email, full_name, status';
export const USERS_OWNER_SELECT =
  'id, role, tenant_id, email, full_name, phone, status, owner_profile_type, owner_document';

export type OwnersAdminContext = {
  ok: boolean;
  error?: string;
  status?: number;
  callerId?: string;
  callerRole?: string;
  tenantId?: string;
};

export type OwnersRequestAuthInput = {
  callerUserId?: string | null;
  tenantId?: string | null;
  impersonatingTenantId?: string | null;
};

export function resolveUsersTenantId(
  row?: { tenant_id?: string | null } | null,
): string | null {
  const tenantId = row?.tenant_id;
  return tenantId ? String(tenantId).trim() : null;
}

export function logOwnersAuthDebug(
  step: string,
  details: Record<string, unknown>,
): void {
  console.log(`[owners-auth] ${step}`, details);
}

export function logOwnersCreate(
  step: string,
  details: Record<string, unknown>,
): void {
  console.log(`[owners-create] ${step}`, details);
}

export function logOwnersCreateError(
  step: string,
  err: unknown,
  details: Record<string, unknown> = {},
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[owners-create] ERROR ${step}`, { ...details, message, stack });
}

const DEFAULT_AUTH_HOOK_ROLES = new Set([
  '',
  'CORRETOR',
  'BROKER',
  'USER',
  'MANAGER',
]);

export function isOwnerAuthHookResidue(
  row: {
    id?: string;
    role?: string | null;
    email?: string | null;
    owner_profile_type?: string | null;
  },
  params: { authUserId: string; email: string },
): boolean {
  if (String(row.id || '') !== params.authUserId) {
    return false;
  }

  const role = String(row.role || '').toUpperCase();
  if (role === 'OWNER' || role === 'BROKER' || row.owner_profile_type) {
    return false;
  }

  if (!DEFAULT_AUTH_HOOK_ROLES.has(role)) {
    return false;
  }

  const rowEmail = String(row.email || '').trim().toLowerCase();
  return rowEmail === params.email.trim().toLowerCase();
}

export type TenantOwnerEmailState =
  | { kind: 'none' }
  | { kind: 'complete_owner'; user: Record<string, unknown> }
  | { kind: 'conflicting_profile'; user: Record<string, unknown> }
  | { kind: 'recoverable_orphan'; user: Record<string, unknown> };

export function isRecoverableOwnerOrphan(
  row: Record<string, unknown>,
  tenantId: string,
): boolean {
  const existingTenant = resolveUsersTenantId(row);
  const role = String(row.role || '').toUpperCase();

  if (existingTenant && existingTenant !== tenantId) {
    return false;
  }

  if (existingTenant === tenantId && role && role !== 'OWNER') {
    return false;
  }

  if (role === 'OWNER') {
    return true;
  }

  if (row.owner_profile_type) {
    return true;
  }

  return DEFAULT_AUTH_HOOK_ROLES.has(role);
}

export function isConflictingTenantProfile(
  row: Record<string, unknown>,
  tenantId: string,
): boolean {
  const existingTenant = resolveUsersTenantId(row);
  const role = String(row.role || '').toUpperCase();
  return existingTenant === tenantId && Boolean(role) && role !== 'OWNER';
}

export async function resolveTenantOwnerEmailState(
  admin: SupabaseClient,
  tenantId: string,
  email: string,
): Promise<TenantOwnerEmailState> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await admin
    .from('users')
    .select('id, role, tenant_id, email, full_name, status, owner_profile_type')
    .ilike('email', normalizedEmail);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data || [];
  const tenantMatch = rows.find((row) => resolveUsersTenantId(row) === tenantId);

  if (tenantMatch) {
    const role = String(tenantMatch.role || '').toUpperCase();
    if (role === 'OWNER') {
      return { kind: 'complete_owner', user: tenantMatch };
    }
    if (
      isOwnerAuthHookResidue(tenantMatch, {
        authUserId: String(tenantMatch.id),
        email: normalizedEmail,
      })
    ) {
      return { kind: 'recoverable_orphan', user: tenantMatch };
    }
    if (isConflictingTenantProfile(tenantMatch, tenantId)) {
      return { kind: 'conflicting_profile', user: tenantMatch };
    }
    return { kind: 'recoverable_orphan', user: tenantMatch };
  }

  const orphan = rows.find((row) => isRecoverableOwnerOrphan(row, tenantId));
  if (orphan) {
    return { kind: 'recoverable_orphan', user: orphan };
  }

  return { kind: 'none' };
}

export type OwnerCreateRollbackState = {
  authUserId?: string;
  createdAuthUser?: boolean;
  wroteUsersRow?: boolean;
  wroteProjectAccess?: boolean;
  tenantId?: string;
};

export async function rollbackOwnerCreation(
  admin: SupabaseClient,
  state: OwnerCreateRollbackState,
  reason: string,
): Promise<void> {
  const authUserId = state.authUserId;
  const tenantId = state.tenantId;

  logOwnersCreate('rollback_start', {
    reason,
    authUserId: authUserId || null,
    tenantId: tenantId || null,
    createdAuthUser: Boolean(state.createdAuthUser),
    wroteUsersRow: Boolean(state.wroteUsersRow),
    wroteProjectAccess: Boolean(state.wroteProjectAccess),
  });

  if (!authUserId) {
    logOwnersCreate('rollback_skip', { reason: 'missing_auth_user_id' });
    return;
  }

  if (state.wroteProjectAccess && tenantId) {
    const { error } = await admin
      .from('owner_project_access')
      .delete()
      .eq('user_id', authUserId)
      .eq('tenant_id', tenantId);
    logOwnersCreate('rollback_owner_project_access', {
      authUserId,
      tenantId,
      error: error?.message || null,
    });
  }

  if (state.wroteUsersRow) {
    const { error } = await admin.from('users').delete().eq('id', authUserId);
    logOwnersCreate('rollback_users', {
      authUserId,
      error: error?.message || null,
    });
  }

  if (state.createdAuthUser) {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    logOwnersCreate('rollback_auth', {
      authUserId,
      error: error?.message || null,
    });
  }

  logOwnersCreate('rollback_complete', { authUserId, reason });
}

export async function resolveOwnersRequestCaller(
  request: Request,
  admin: SupabaseClient,
  input?: OwnersRequestAuthInput,
): Promise<{ ok: boolean; error?: string; status?: number; authUserId?: string }> {
  const hasBearer = Boolean(request.headers.get('Authorization')?.startsWith('Bearer '));
  const { user, configError } = await getRequestAuthUser(request);
  const callerUserIdFromClient = input?.callerUserId?.trim() || null;
  const tenantIdFromClient = input?.tenantId?.trim() || null;

  logOwnersAuthDebug('request', {
    hasBearer,
    hasSessionUser: Boolean(user?.id),
    callerUserIdFromClient,
    tenantIdFromClient,
    impersonatingTenantId: input?.impersonatingTenantId || null,
    authConfigError: configError || null,
  });

  let authUserId = user?.id || callerUserIdFromClient;

  if (!authUserId) {
    logOwnersAuthDebug('reject', { reason: 'missing_auth_user_and_callerUserId' });
    return {
      ok: false,
      error: OWNERS_SESSION_EXPIRED_MESSAGE,
      status: 401,
    };
  }

  if (user?.id && callerUserIdFromClient && user.id !== callerUserIdFromClient) {
    logOwnersAuthDebug('reject', {
      reason: 'session_caller_mismatch',
      sessionUserId: user.id,
      callerUserIdFromClient,
    });
    return {
      ok: false,
      error: OWNERS_SESSION_CONFIRM_MESSAGE,
      status: 403,
    };
  }

  const { data: caller, error } = await admin
    .from('users')
    .select(USERS_CALLER_SELECT)
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    logOwnersAuthDebug('reject', {
      reason: 'users_query_failed',
      authUserId,
      message: error.message,
      code: (error as { code?: string }).code || null,
    });
    return {
      ok: false,
      error: OWNERS_SESSION_CONFIRM_MESSAGE,
      status: 500,
    };
  }

  if (!caller) {
    logOwnersAuthDebug('reject', {
      reason: 'caller_not_found',
      authUserId,
      hadSessionUser: Boolean(user?.id),
    });
    return {
      ok: false,
      error: user ? OWNERS_SESSION_CONFIRM_MESSAGE : OWNERS_SESSION_EXPIRED_MESSAGE,
      status: user ? 403 : 401,
    };
  }

  const callerRole = String(caller.role || '').toUpperCase();
  const callerTenantId = resolveUsersTenantId(caller);

  logOwnersAuthDebug('caller_loaded', {
    authUserId: caller.id,
    role: callerRole,
    tenantId: callerTenantId,
    status: caller.status || 'ACTIVE',
  });

  if (isBrokerRole(callerRole) || isOwnerRole(callerRole)) {
    logOwnersAuthDebug('reject', { reason: 'broker_or_owner', role: callerRole });
    return {
      ok: false,
      error: 'Permissão negada.',
      status: 403,
    };
  }

  if (!isPlatformAdmin(callerRole) && !isTenantAdminRole(callerRole)) {
    logOwnersAuthDebug('reject', { reason: 'not_tenant_admin', role: callerRole });
    return {
      ok: false,
      error: 'Permissão negada. Apenas administradores da empresa.',
      status: 403,
    };
  }

  if ((caller.status || 'ACTIVE').toUpperCase() === 'INACTIVE') {
    return { ok: false, error: 'Usuário administrador inativo.', status: 403 };
  }

  if (
    tenantIdFromClient &&
    callerTenantId &&
    !isPlatformAdmin(callerRole) &&
    tenantIdFromClient !== callerTenantId
  ) {
    logOwnersAuthDebug('reject', {
      reason: 'tenant_mismatch',
      callerTenantId,
      tenantIdFromClient,
    });
    return {
      ok: false,
      error: 'Empresa informada não confere com o administrador logado.',
      status: 403,
    };
  }

  return { ok: true, authUserId: caller.id };
}

export async function resolveOwnersAdminContext(
  admin: SupabaseClient,
  authUserId: string,
  impersonatingTenantId?: string | null,
  tenantIdOverride?: string | null,
): Promise<OwnersAdminContext> {
  const { data: caller, error } = await admin
    .from('users')
    .select(USERS_CALLER_SELECT)
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    logOwnersAuthDebug('admin_context_query_failed', {
      authUserId,
      message: error.message,
    });
    return {
      ok: false,
      error: OWNERS_SESSION_CONFIRM_MESSAGE,
      status: 500,
    };
  }

  if (!caller) {
    return {
      ok: false,
      error: 'Perfil do administrador não encontrado.',
      status: 403,
    };
  }

  const callerRole = String(caller.role || '').toUpperCase();
  if (isBrokerRole(callerRole) || isOwnerRole(callerRole)) {
    return {
      ok: false,
      error: 'Permissão negada.',
      status: 403,
    };
  }

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

  const callerTenantId = resolveUsersTenantId(caller);
  let tenantId = tenantIdOverride || callerTenantId;

  if (impersonatingTenantId && isPlatformAdmin(callerRole)) {
    tenantId = impersonatingTenantId;
  }

  if (
    tenantIdOverride &&
    callerTenantId &&
    !isPlatformAdmin(callerRole) &&
    tenantIdOverride !== callerTenantId
  ) {
    return {
      ok: false,
      error: 'Empresa informada não confere com o administrador logado.',
      status: 403,
    };
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

export async function resolveOwnersAdminContextFromRequest(
  request: Request,
  admin: SupabaseClient,
  input?: OwnersRequestAuthInput,
): Promise<OwnersAdminContext> {
  const auth = await resolveOwnersRequestCaller(request, admin, input);
  if (!auth.ok || !auth.authUserId) {
    return {
      ok: false,
      error: auth.error,
      status: auth.status,
    };
  }

  return resolveOwnersAdminContext(
    admin,
    auth.authUserId,
    input?.impersonatingTenantId,
    input?.tenantId,
  );
}

export async function assertOwnerBelongsToTenant(
  admin: SupabaseClient,
  ownerId: string,
  tenantId: string,
): Promise<{ ok: boolean; error?: string; status?: number; owner?: Record<string, unknown> }> {
  const { data: owner, error } = await admin
    .from('users')
    .select(USERS_OWNER_SELECT)
    .eq('id', ownerId)
    .maybeSingle();

  if (error || !owner) {
    return { ok: false, error: 'Sócio/proprietário não encontrado.', status: 404 };
  }

  const ownerTenant = resolveUsersTenantId(owner);
  if (ownerTenant !== tenantId) {
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
  const state = await resolveTenantOwnerEmailState(admin, tenantId, email);
  if (state.kind === 'complete_owner' || state.kind === 'recoverable_orphan') {
    return state.user;
  }
  return null;
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
  logOwnersCreate('auth_create_start', {
    email,
    tenantId: params.tenantId,
    fullName: params.fullName,
  });

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
    logOwnersCreate('auth_create_success', {
      email,
      authUserId: authUser.user.id,
      isExisting: false,
    });
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
    logOwnersCreateError('auth_create_failed', authError || new Error('unknown auth error'), {
      email,
    });
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
    logOwnersCreateError(
      'auth_link_failed',
      new Error('E-mail já registrado, mas não foi possível localizar o usuário.'),
      { email },
    );
    throw new Error('E-mail já registrado, mas não foi possível localizar o usuário.');
  }

  logOwnersCreate('auth_link_success', {
    email,
    authUserId,
    isExisting: true,
  });

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

  logOwnersCreate('users_upsert_start', {
    authUserId: params.authUserId,
    tenantId: params.tenantId,
    email: payload.email,
    role: payload.role,
  });

  const { data: existing } = await admin
    .from('users')
    .select('id, tenant_id, role, owner_profile_type, email')
    .eq('id', params.authUserId)
    .maybeSingle();

  if (existing) {
    const existingTenant = resolveUsersTenantId(existing);
    if (existingTenant && existingTenant !== params.tenantId) {
      throw new Error('Este e-mail já está vinculado a outra empresa.');
    }
    const existingRole = String(existing.role || '').toUpperCase();
    const canRecoverOrphan = isRecoverableOwnerOrphan(existing, params.tenantId);
    const authHookResidue = isOwnerAuthHookResidue(existing, params);
    if (existingRole && existingRole !== 'OWNER' && !canRecoverOrphan && !authHookResidue) {
      logOwnersCreate('users_upsert_profile_conflict', {
        authUserId: params.authUserId,
        existingRole,
        existingTenant,
        existingEmail: existing.email || null,
        targetEmail: params.email,
        canRecoverOrphan,
        authHookResidue,
      });
      throw new Error('Este e-mail já pertence a outro perfil na empresa.');
    }

    if (authHookResidue) {
      logOwnersCreate('users_upsert_upgrade_auth_hook_residue', {
        authUserId: params.authUserId,
        previousRole: existingRole || null,
        email: params.email,
      });
    }

    const { error } = await admin.from('users').update(payload).eq('id', params.authUserId);
    if (error) {
      logOwnersCreateError('users_upsert_update_failed', error, {
        authUserId: params.authUserId,
        code: (error as { code?: string }).code || null,
      });
      throw new Error(error.message);
    }
    logOwnersCreate('users_upsert_update_success', { authUserId: params.authUserId });
    return;
  }

  const { error } = await admin.from('users').insert({
    id: params.authUserId,
    ...payload,
  });
  if (error) {
    logOwnersCreateError('users_upsert_insert_failed', error, {
      authUserId: params.authUserId,
      code: (error as { code?: string }).code || null,
    });
    throw new Error(error.message);
  }
  logOwnersCreate('users_upsert_insert_success', { authUserId: params.authUserId });
}

export async function saveOwnerProjectAccessEntries(
  admin: SupabaseClient,
  params: { userId: string; tenantId: string; entries: OwnerProjectAccessInput[] },
): Promise<void> {
  logOwnersCreate('owner_project_access_start', {
    userId: params.userId,
    tenantId: params.tenantId,
    entriesCount: params.entries.length,
    projectIds: params.entries.map((entry) => entry.project_id),
  });

  const projectIds = params.entries.map((entry) => entry.project_id).filter(Boolean);

  if (projectIds.length > 0) {
    const { data: projects, error: projectsErr } = await admin
      .from('projects')
      .select('id, tenant_id, company_id')
      .in('id', projectIds);

    if (projectsErr) {
      logOwnersCreateError('owner_project_access_projects_query_failed', projectsErr, {
        projectIds,
      });
      throw new Error(projectsErr.message);
    }

    const invalid = (projects || []).some((project) => {
      const projectTenant = project.tenant_id || project.company_id;
      return String(projectTenant) !== params.tenantId;
    });

    if (invalid || (projects || []).length !== projectIds.length) {
      logOwnersCreate('owner_project_access_projects_invalid', {
        tenantId: params.tenantId,
        projectIds,
        resolvedProjects: (projects || []).map((project) => ({
          id: project.id,
          tenant_id: project.tenant_id,
          company_id: project.company_id,
        })),
      });
      throw new Error('Um ou mais empreendimentos não pertencem à empresa.');
    }
  }

  const { error: deleteErr } = await admin
    .from('owner_project_access')
    .delete()
    .eq('user_id', params.userId)
    .eq('tenant_id', params.tenantId);

  if (deleteErr) {
    logOwnersCreateError('owner_project_access_delete_failed', deleteErr, {
      userId: params.userId,
      tenantId: params.tenantId,
    });
    throw new Error(deleteErr.message);
  }

  if (!params.entries.length) {
    logOwnersCreate('owner_project_access_cleared', {
      userId: params.userId,
      tenantId: params.tenantId,
    });
    return;
  }

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
  if (insertErr) {
    logOwnersCreateError('owner_project_access_insert_failed', insertErr, {
      userId: params.userId,
      tenantId: params.tenantId,
      code: (insertErr as { code?: string }).code || null,
    });
    throw new Error(insertErr.message);
  }

  logOwnersCreate('owner_project_access_success', {
    userId: params.userId,
    tenantId: params.tenantId,
    entriesCount: payload.length,
  });
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

export type CreateOwnerAccountInput = {
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  ownerDocument?: string | null;
  ownerProfileType: string;
  status?: string | null;
  password?: string | null;
  entries: OwnerProjectAccessInput[];
};

export type CreateOwnerAccountResult = {
  authUserId: string;
  isExisting: boolean;
  temporaryPassword: string | null;
  recoveredOrphan: boolean;
};

export async function createOwnerAccount(
  admin: SupabaseClient,
  input: CreateOwnerAccountInput,
): Promise<CreateOwnerAccountResult> {
  const tenantId = input.tenantId;
  const email = input.email.trim().toLowerCase();
  const rollback: OwnerCreateRollbackState = { tenantId };

  logOwnersCreate('REQUEST', {
    tenantId,
    email,
    fullName: input.fullName,
    entriesCount: input.entries.length,
  });

  const emailState = await resolveTenantOwnerEmailState(admin, tenantId, email);
  logOwnersCreate('EMAIL_CHECK', {
    email,
    tenantId,
    kind: emailState.kind,
    userId:
      emailState.kind === 'none' ? null : String((emailState.user as { id?: string }).id || ''),
    matchedRole:
      emailState.kind === 'none' ? null : (emailState.user as { role?: string }).role || null,
  });

  if (emailState.kind === 'conflicting_profile') {
    throw new Error('Este e-mail já pertence a outro perfil nesta empresa.');
  }

  let authUserId = '';
  let isExisting = false;
  let temporaryPassword: string | null = null;
  let recoveredOrphan = false;
  let forcePasswordChange = false;
  const isUpdateExistingOwner = emailState.kind === 'complete_owner';

  try {
    if (emailState.kind === 'complete_owner' || emailState.kind === 'recoverable_orphan') {
      authUserId = String(emailState.user.id);
      isExisting = true;
      recoveredOrphan = emailState.kind === 'recoverable_orphan';
      forcePasswordChange = false;
      rollback.authUserId = authUserId;
      if (recoveredOrphan) {
        rollback.createdAuthUser = true;
      }
      logOwnersCreate('reuse_existing_profile', {
        authUserId,
        recoveredOrphan,
        previousRole: emailState.user.role || null,
      });
    } else {
      const password = String(input.password || '').trim() || generateTempPassword(10);
      const authResult = await createOrLinkAuthUser(admin, {
        email,
        password,
        fullName: input.fullName,
        tenantId,
      });
      authUserId = authResult.authUserId;
      isExisting = authResult.isExisting;
      temporaryPassword = authResult.temporaryPassword;
      forcePasswordChange = !authResult.isExisting;
      rollback.authUserId = authUserId;
      rollback.createdAuthUser = !authResult.isExisting;
      logOwnersCreate('AUTH_USER_CREATED', {
        authUserId,
        isExisting: authResult.isExisting,
        email,
      });
    }

    await upsertOwnerUserRecord(admin, {
      authUserId,
      tenantId,
      fullName: input.fullName,
      email,
      phone: input.phone,
      ownerProfileType: input.ownerProfileType,
      ownerDocument: input.ownerDocument,
      status: input.status,
      forcePasswordChange,
    });
    rollback.authUserId = authUserId;
    rollback.wroteUsersRow = true;
    logOwnersCreate('USERS_RECORD_CREATED', { authUserId, tenantId, email });

    await saveOwnerProjectAccessEntries(admin, {
      userId: authUserId,
      tenantId,
      entries: input.entries,
    });
    rollback.wroteProjectAccess = true;
    logOwnersCreate('ACCESS_CREATED', {
      authUserId,
      tenantId,
      entriesCount: input.entries.length,
    });

    logOwnersCreate('RESPONSE', {
      authUserId,
      tenantId,
      email,
      isExisting,
      recoveredOrphan,
      hasTemporaryPassword: Boolean(temporaryPassword),
    });

    return {
      authUserId,
      isExisting,
      temporaryPassword,
      recoveredOrphan,
    };
  } catch (err) {
    logOwnersCreateError('failed', err, {
      tenantId,
      email,
      authUserId: rollback.authUserId || authUserId || null,
      rollback,
      isUpdateExistingOwner,
    });
    if (!isUpdateExistingOwner) {
      await rollbackOwnerCreation(admin, rollback, err instanceof Error ? err.message : 'unknown');
    } else {
      logOwnersCreate('rollback_skipped_existing_owner', {
        authUserId: rollback.authUserId || authUserId || null,
        tenantId,
      });
    }
    throw err;
  }
}
