/**
 * Identidade canônica do Administrador Principal da empresa.
 * Autoridade crítica = companies.primary_admin_user_id.
 * Não cria role PRIMARY_ADMIN.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlatformAdmin } from '@/lib/rls';
import { normalizeUserRole } from '@/lib/rolePermissions';

const PRIMARY_ADMIN_ALLOWED_ROLES = ['ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN'] as const;

function isAllowedPrimaryAdminRole(role?: string | null): boolean {
  return (PRIMARY_ADMIN_ALLOWED_ROLES as readonly string[]).includes(normalizeUserRole(role));
}

function isActiveAdminStatus(status?: string | null): boolean {
  return String(status || 'ACTIVE').trim().toUpperCase() !== 'INACTIVE';
}

export const PRIMARY_ADMIN_LOCKED_MESSAGE =
  'O Administrador Principal não pode ser removido ou desativado. Transfira a titularidade administrativa antes.';

export function companyAdminWriteHttpStatus(message: string): number {
  if (message.includes('Limite') || message.includes(PRIMARY_ADMIN_LOCKED_MESSAGE) || message.includes('Administrador Principal')) {
    return 409;
  }
  return 500;
}

export const PRIMARY_ADMIN_LABEL = 'Administrador principal';
export const SECONDARY_ADMIN_LABEL = 'Administrador';

export type PrimaryAdminCandidateInput = {
  id: string;
  tenant_id?: string | null;
  role?: string | null;
  status?: string | null;
};

export type PrimaryAdminCandidateResult = {
  ok: boolean;
  error?: string;
};

export type PrimaryAdminSuggestion = {
  companyId: string;
  primaryAdminUserId: string | null;
  suggestedUserId: string | null;
  suggestedEmail: string | null;
  suggestedName: string | null;
  reason: string;
  confidence: 'confirmed' | 'high' | 'medium' | 'low' | 'none';
};

export function isPrimaryAdminUser(
  userId?: string | null,
  primaryAdminUserId?: string | null,
): boolean {
  if (!userId || !primaryAdminUserId) return false;
  return userId === primaryAdminUserId;
}

export function companyAdminAuthorityLabel(
  userId?: string | null,
  primaryAdminUserId?: string | null,
): typeof PRIMARY_ADMIN_LABEL | typeof SECONDARY_ADMIN_LABEL {
  return isPrimaryAdminUser(userId, primaryAdminUserId)
    ? PRIMARY_ADMIN_LABEL
    : SECONDARY_ADMIN_LABEL;
}

export function evaluatePrimaryAdminCandidate(
  user: PrimaryAdminCandidateInput | null | undefined,
  companyId: string,
): PrimaryAdminCandidateResult {
  if (!user?.id) {
    return { ok: false, error: 'Usuário administrador inválido.' };
  }
  if (!companyId) {
    return { ok: false, error: 'Empresa inválida.' };
  }
  if (!user.tenant_id || user.tenant_id !== companyId) {
    return { ok: false, error: 'O Administrador Principal deve pertencer à mesma empresa.' };
  }
  if (isPlatformAdmin(user.role)) {
    return {
      ok: false,
      error: 'SUPER_ADMIN do SaaS não pode ser Administrador Principal da empresa.',
    };
  }
  if (!isAllowedPrimaryAdminRole(user.role)) {
    return {
      ok: false,
      error: 'O Administrador Principal precisa de papel administrativo da empresa.',
    };
  }
  if (!isActiveAdminStatus(user.status)) {
    return { ok: false, error: 'O Administrador Principal precisa estar ativo.' };
  }
  return { ok: true };
}

export function assertPrimaryAdminNotLocked(
  userId: string,
  primaryAdminUserId: string | null,
  action: 'deactivate' | 'delete' = 'deactivate',
): PrimaryAdminCandidateResult {
  if (!isPrimaryAdminUser(userId, primaryAdminUserId)) {
    return { ok: true };
  }
  void action;
  return { ok: false, error: PRIMARY_ADMIN_LOCKED_MESSAGE };
}

export function canReplacePrimaryAdmin(
  currentPrimaryAdminUserId: string | null,
  nextUserId: string,
  allowReplace: boolean,
): PrimaryAdminCandidateResult {
  if (!currentPrimaryAdminUserId || currentPrimaryAdminUserId === nextUserId) {
    return { ok: true };
  }
  if (!allowReplace) {
    return {
      ok: false,
      error: 'A empresa já possui Administrador Principal. Transferência ainda não está liberada.',
    };
  }
  return { ok: true };
}

export function suggestPrimaryAdminCandidate(input: {
  companyId: string;
  primaryAdminUserId: string | null;
  admins: Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    status: string;
    created_at: string;
  }>;
}): PrimaryAdminSuggestion {
  const { companyId, primaryAdminUserId, admins } = input;
  const confirmed = admins.find((row) => isPrimaryAdminUser(row.id, primaryAdminUserId));
  if (confirmed) {
    return {
      companyId,
      primaryAdminUserId,
      suggestedUserId: confirmed.id,
      suggestedEmail: confirmed.email,
      suggestedName: confirmed.full_name,
      reason: 'Já atribuído em companies.primary_admin_user_id',
      confidence: 'confirmed',
    };
  }

  const activeAdmins = admins
    .filter(
      (row) =>
        isActiveAdminStatus(row.status) && isAllowedPrimaryAdminRole(row.role),
    )
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  if (!activeAdmins.length) {
    return {
      companyId,
      primaryAdminUserId: null,
      suggestedUserId: null,
      suggestedEmail: null,
      suggestedName: null,
      reason: 'Nenhum administrador ativo na empresa',
      confidence: 'none',
    };
  }

  const roleAdmin = activeAdmins.filter((row) => normalizeUserRole(row.role) === 'ADMIN');
  const pick = roleAdmin[0] || activeAdmins[0];
  const uniqueRoleAdmin = roleAdmin.length === 1;
  const confidence: PrimaryAdminSuggestion['confidence'] = uniqueRoleAdmin
    ? 'high'
    : roleAdmin.length > 1 || activeAdmins.length > 1
      ? 'medium'
      : 'high';

  return {
    companyId,
    primaryAdminUserId: null,
    suggestedUserId: pick.id,
    suggestedEmail: pick.email,
    suggestedName: pick.full_name,
    reason: uniqueRoleAdmin
      ? 'Único ADMIN ativo — candidato provável (heurística, sem backfill)'
      : roleAdmin.length > 1
        ? 'Vários ADMIN ativos — mais antigo por created_at (heurística, sem backfill)'
        : 'Nenhum role ADMIN; mais antigo administrador ativo (heurística, sem backfill)',
    confidence,
  };
}

function isMissingPrimaryAdminColumn(error: { message?: string } | null | undefined): boolean {
  return /primary_admin_user_id/i.test(String(error?.message || ''));
}

export async function loadCompanyPrimaryAdminUserId(
  admin: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('companies')
    .select('primary_admin_user_id')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingPrimaryAdminColumn(error)) return null;
    throw new Error(error.message);
  }
  const value = (data as { primary_admin_user_id?: string | null } | null)?.primary_admin_user_id;
  return value ? String(value) : null;
}

export async function assignCompanyPrimaryAdmin(
  admin: SupabaseClient,
  params: {
    companyId: string;
    userId: string;
    allowReplace?: boolean;
  },
): Promise<{ primaryAdminUserId: string; unchanged: boolean }> {
  const current = await loadCompanyPrimaryAdminUserId(admin, params.companyId);
  const replaceGate = canReplacePrimaryAdmin(
    current,
    params.userId,
    params.allowReplace === true,
  );
  if (!replaceGate.ok) {
    throw new Error(replaceGate.error);
  }
  if (current === params.userId) {
    return { primaryAdminUserId: params.userId, unchanged: true };
  }

  const { data: user, error: userError } = await admin
    .from('users')
    .select('id, tenant_id, role, status')
    .eq('id', params.userId)
    .maybeSingle();

  if (userError) throw new Error(userError.message);
  const candidate = evaluatePrimaryAdminCandidate(
    user as PrimaryAdminCandidateInput | null,
    params.companyId,
  );
  if (!candidate.ok) {
    throw new Error(candidate.error);
  }

  const { error } = await admin
    .from('companies')
    .update({ primary_admin_user_id: params.userId })
    .eq('id', params.companyId);

  if (error) {
    if (isMissingPrimaryAdminColumn(error)) {
      throw new Error(
        'Coluna companies.primary_admin_user_id ausente. Aplique a migration no DEVELOP.',
      );
    }
    throw new Error(error.message);
  }
  return { primaryAdminUserId: params.userId, unchanged: false };
}

export async function assignFirstCompanyPrimaryAdmin(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<void> {
  await assignCompanyPrimaryAdmin(admin, {
    companyId,
    userId,
    allowReplace: false,
  });
}

export async function clearPrimaryAdminForCompanyTeardown(
  admin: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { error } = await admin
    .from('companies')
    .update({ primary_admin_user_id: null })
    .eq('id', companyId);
  if (error && !isMissingPrimaryAdminColumn(error)) {
    throw new Error(error.message);
  }
}

export function allowedOperationalAdminRoles(): readonly string[] {
  return PRIMARY_ADMIN_ALLOWED_ROLES;
}
