/**
 * Reautenticação do Administrador Principal.
 * Fonte de verdade: companies.primary_admin_user_id.
 * Não gera challenge/token reutilizável. Não troca a sessão do operador.
 */

import {
  evaluatePrimaryAdminCandidate,
  type PrimaryAdminCandidateInput,
} from '@/lib/companyPrimaryAdmin';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  peekMemoryRateLimit,
  recordMemoryRateLimitHit,
  type MemoryRateLimitStore,
} from '@/lib/security/memoryRateLimit';

export const PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE = 'Autorização não concedida.';
export const PRIMARY_ADMIN_VERIFY_SUCCESS_MESSAGE = 'Autorização confirmada.';

export const PRIMARY_ADMIN_VERIFY_SUCCESS_ACTION = 'PRIMARY_ADMIN_VERIFY_SUCCESS';
export const PRIMARY_ADMIN_VERIFY_FAILURE_ACTION = 'PRIMARY_ADMIN_VERIFY_FAILURE';
export const PRIMARY_ADMIN_VERIFY_AUDIT_MODULE = 'SECURITY';

export const PRIMARY_ADMIN_VERIFY_WINDOW_MS = 10 * 60 * 1000;
export const PRIMARY_ADMIN_VERIFY_MAX_PER_USER = 5;
export const PRIMARY_ADMIN_VERIFY_MAX_PER_TENANT = 20;
export const PRIMARY_ADMIN_VERIFY_PASSWORD_MAX_LENGTH = 256;

export type PrimaryAdminVerifyPublicFailure = {
  ok: false;
};

export type PrimaryAdminAuthorizedBy = {
  userId: string;
  displayName: string;
  maskedEmail: string;
};

export type PrimaryAdminVerifyPublicSuccess = {
  ok: true;
  authorizedBy: PrimaryAdminAuthorizedBy;
};

export type PrimaryAdminVerifyPublicResult =
  | PrimaryAdminVerifyPublicSuccess
  | PrimaryAdminVerifyPublicFailure;

export type PrimaryAdminVerifyReason =
  | 'ok'
  | 'unauthenticated'
  | 'operator_invalid'
  | 'rate_limited'
  | 'missing_primary'
  | 'primary_invalid'
  | 'password_rejected'
  | 'ephemeral_mismatch';

export type PrimaryAdminVerifyResult = PrimaryAdminVerifyPublicResult & {
  reason: PrimaryAdminVerifyReason;
  tenantId?: string;
  requestedBy?: string;
  authorizedByUserId?: string;
};

export type PrimaryAdminIdentityPreview = {
  ok: true;
  principal: {
    displayName: string;
    maskedEmail: string;
  };
};

export type PrimaryAdminOperatorRow = {
  id: string;
  tenant_id?: string | null;
  role?: string | null;
  status?: string | null;
};

export type PrimaryAdminUserRow = PrimaryAdminCandidateInput & {
  email?: string | null;
  full_name?: string | null;
};

export type PrimaryAdminPasswordVerifyInput = {
  email: string;
  password: string;
};

export type PrimaryAdminPasswordVerifyOutput = {
  userId: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  session?: unknown;
};

export type PrimaryAdminReauthDeps = {
  loadOperator: (userId: string) => Promise<PrimaryAdminOperatorRow | null>;
  loadCompanyPrimaryAdminUserId: (companyId: string) => Promise<string | null>;
  loadUser: (userId: string) => Promise<PrimaryAdminUserRow | null>;
  verifyPassword: (
    input: PrimaryAdminPasswordVerifyInput,
  ) => Promise<PrimaryAdminPasswordVerifyOutput>;
  revokeEphemeralSession?: (accessToken: string) => Promise<void>;
  rateLimitStore?: MemoryRateLimitStore;
  countRecentFailures?: (input: {
    tenantId: string;
    userId?: string;
    sinceIso: string;
  }) => Promise<number>;
  now?: () => number;
};

export type PrimaryAdminVerifyAuditEvent = {
  action: typeof PRIMARY_ADMIN_VERIFY_SUCCESS_ACTION | typeof PRIMARY_ADMIN_VERIFY_FAILURE_ACTION;
  tenantId: string;
  requestedBy: string;
  authorizedBy?: string;
  timestamp: string;
};

export function maskPrimaryAdminEmail(email: string | null | undefined): string {
  const value = String(email || '').trim();
  if (!value || !value.includes('@')) return '—';
  const [local, domain] = value.split('@');
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}*****@${domain}`;
}

export function primaryAdminDisplayName(user: {
  full_name?: string | null;
  email?: string | null;
}): string {
  return String(user.full_name || '').trim() || String(user.email || '').trim() || 'Administrador Principal';
}

export function readPrimaryAdminVerifyRequest(body: unknown): { password: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { password: '' };
  }
  const password = (body as Record<string, unknown>).password;
  return { password: typeof password === 'string' ? password : '' };
}

export function toPublicPrimaryAdminVerifyResult(
  result: PrimaryAdminVerifyResult,
): PrimaryAdminVerifyPublicResult {
  if (result.ok) {
    return { ok: true, authorizedBy: result.authorizedBy };
  }
  return { ok: false };
}

export function sanitizeEphemeralPasswordVerifyOutput(
  output: PrimaryAdminPasswordVerifyOutput | null | undefined,
): { userId: string | null } {
  const userId = output?.userId ? String(output.userId) : null;
  return { userId };
}

export function denyPrimaryAdminVerify(
  reason: Exclude<PrimaryAdminVerifyReason, 'ok'>,
  extra?: { tenantId?: string; requestedBy?: string },
): PrimaryAdminVerifyResult {
  return { ok: false, reason, ...extra };
}

function isActiveStatus(status?: string | null): boolean {
  return String(status || 'ACTIVE').trim().toUpperCase() !== 'INACTIVE';
}

export function evaluateOperatorForPrimaryAdminVerify(
  operator: PrimaryAdminOperatorRow | null | undefined,
): { ok: true; tenantId: string } | { ok: false; reason: 'operator_invalid' } {
  if (!operator?.id || !operator.tenant_id) {
    return { ok: false, reason: 'operator_invalid' };
  }
  if (!isActiveStatus(operator.status) || !isTenantEnterpriseAdminRole(operator.role)) {
    return { ok: false, reason: 'operator_invalid' };
  }
  return { ok: true, tenantId: String(operator.tenant_id) };
}

export function rateLimitKeys(tenantId: string, operatorId: string) {
  return {
    user: `primary-admin-verify:user:${operatorId}`,
    tenant: `primary-admin-verify:tenant:${tenantId}`,
  };
}

export async function isPrimaryAdminVerifyRateLimited(
  deps: Pick<PrimaryAdminReauthDeps, 'rateLimitStore' | 'countRecentFailures' | 'now'>,
  tenantId: string,
  operatorId: string,
): Promise<boolean> {
  const now = deps.now ? deps.now() : Date.now();
  const keys = rateLimitKeys(tenantId, operatorId);
  const store = deps.rateLimitStore;

  if (store) {
    const userPeek = peekMemoryRateLimit(store, keys.user, {
      windowMs: PRIMARY_ADMIN_VERIFY_WINDOW_MS,
      max: PRIMARY_ADMIN_VERIFY_MAX_PER_USER,
    }, now);
    const tenantPeek = peekMemoryRateLimit(store, keys.tenant, {
      windowMs: PRIMARY_ADMIN_VERIFY_WINDOW_MS,
      max: PRIMARY_ADMIN_VERIFY_MAX_PER_TENANT,
    }, now);
    if (!userPeek.allowed || !tenantPeek.allowed) return true;
  }

  if (deps.countRecentFailures) {
    const sinceIso = new Date(now - PRIMARY_ADMIN_VERIFY_WINDOW_MS).toISOString();
    const [userCount, tenantCount] = await Promise.all([
      deps.countRecentFailures({ tenantId, userId: operatorId, sinceIso }),
      deps.countRecentFailures({ tenantId, sinceIso }),
    ]);
    if (userCount >= PRIMARY_ADMIN_VERIFY_MAX_PER_USER) return true;
    if (tenantCount >= PRIMARY_ADMIN_VERIFY_MAX_PER_TENANT) return true;
  }

  return false;
}

export function recordPrimaryAdminVerifyFailureHit(
  store: MemoryRateLimitStore | undefined,
  tenantId: string,
  operatorId: string,
  now = Date.now(),
) {
  if (!store) return;
  const keys = rateLimitKeys(tenantId, operatorId);
  recordMemoryRateLimitHit(store, keys.user, {
    windowMs: PRIMARY_ADMIN_VERIFY_WINDOW_MS,
    max: PRIMARY_ADMIN_VERIFY_MAX_PER_USER,
  }, now);
  recordMemoryRateLimitHit(store, keys.tenant, {
    windowMs: PRIMARY_ADMIN_VERIFY_WINDOW_MS,
    max: PRIMARY_ADMIN_VERIFY_MAX_PER_TENANT,
  }, now);
}

export type ResolvePrimaryAdminOptions = {
  /** Empresa do recurso (contrato/parcela). Nunca vem do client como identidade. */
  companyId?: string | null;
};

export async function resolvePrimaryAdminForOperator(
  deps: Pick<PrimaryAdminReauthDeps, 'loadOperator' | 'loadCompanyPrimaryAdminUserId' | 'loadUser'>,
  operatorUserId: string | null | undefined,
  options?: ResolvePrimaryAdminOptions,
): Promise<
  | {
      ok: true;
      operator: PrimaryAdminOperatorRow;
      tenantId: string;
      primary: PrimaryAdminUserRow & { id: string; email: string };
    }
  | { ok: false; reason: Exclude<PrimaryAdminVerifyReason, 'ok' | 'password_rejected' | 'ephemeral_mismatch' | 'rate_limited'>; tenantId?: string; requestedBy?: string }
> {
  if (!operatorUserId) {
    return { ok: false, reason: 'unauthenticated' };
  }

  const operator = await deps.loadOperator(operatorUserId);
  const scopedCompanyId = String(options?.companyId || '').trim();
  let tenantId = '';

  if (
    scopedCompanyId &&
    operator?.id &&
    isPlatformAdmin(operator.role) &&
    isActiveStatus(operator.status)
  ) {
    tenantId = scopedCompanyId;
  } else {
    const operatorGate = evaluateOperatorForPrimaryAdminVerify(operator);
    if (!operatorGate.ok || !operator) {
      return { ok: false, reason: 'operator_invalid', requestedBy: operatorUserId };
    }
    if (scopedCompanyId && operatorGate.tenantId !== scopedCompanyId) {
      return {
        ok: false,
        reason: 'operator_invalid',
        tenantId: scopedCompanyId,
        requestedBy: operator.id,
      };
    }
    tenantId = scopedCompanyId || operatorGate.tenantId;
  }

  if (!operator) {
    return { ok: false, reason: 'operator_invalid', requestedBy: operatorUserId };
  }

  const primaryAdminUserId = await deps.loadCompanyPrimaryAdminUserId(tenantId);
  if (!primaryAdminUserId) {
    return {
      ok: false,
      reason: 'missing_primary',
      tenantId,
      requestedBy: operator.id,
    };
  }

  const primary = await deps.loadUser(primaryAdminUserId);
  const candidate = evaluatePrimaryAdminCandidate(primary, tenantId);
  const email = String(primary?.email || '').trim();
  if (!candidate.ok || !primary?.id || !email) {
    return {
      ok: false,
      reason: 'primary_invalid',
      tenantId,
      requestedBy: operator.id,
    };
  }

  return {
    ok: true,
    operator,
    tenantId,
    primary: {
      ...primary,
      id: primary.id,
      email,
    },
  };
}

export async function previewPrimaryAdminIdentity(
  deps: Pick<PrimaryAdminReauthDeps, 'loadOperator' | 'loadCompanyPrimaryAdminUserId' | 'loadUser'>,
  operatorUserId: string | null | undefined,
  options?: ResolvePrimaryAdminOptions,
): Promise<PrimaryAdminIdentityPreview | PrimaryAdminVerifyPublicFailure> {
  const resolved = await resolvePrimaryAdminForOperator(deps, operatorUserId, options);
  if (!resolved.ok) return { ok: false };
  return {
    ok: true,
    principal: {
      displayName: primaryAdminDisplayName(resolved.primary),
      maskedEmail: maskPrimaryAdminEmail(resolved.primary.email),
    },
  };
}

export async function verifyPrimaryAdminPassword(
  deps: PrimaryAdminReauthDeps,
  input: {
    operatorUserId: string | null | undefined;
    password: string;
    companyId?: string | null;
  },
): Promise<PrimaryAdminVerifyResult> {
  const resolved = await resolvePrimaryAdminForOperator(deps, input.operatorUserId, {
    companyId: input.companyId,
  });
  if (!resolved.ok) {
    return denyPrimaryAdminVerify(resolved.reason, {
      tenantId: resolved.tenantId,
      requestedBy: resolved.requestedBy || input.operatorUserId || undefined,
    });
  }

  const now = deps.now ? deps.now() : Date.now();
  const limited = await isPrimaryAdminVerifyRateLimited(deps, resolved.tenantId, resolved.operator.id);
  if (limited) {
    return denyPrimaryAdminVerify('rate_limited', {
      tenantId: resolved.tenantId,
      requestedBy: resolved.operator.id,
    });
  }

  const password = String(input.password || '');
  if (
    !password ||
    password.length > PRIMARY_ADMIN_VERIFY_PASSWORD_MAX_LENGTH
  ) {
    recordPrimaryAdminVerifyFailureHit(deps.rateLimitStore, resolved.tenantId, resolved.operator.id, now);
    return denyPrimaryAdminVerify('password_rejected', {
      tenantId: resolved.tenantId,
      requestedBy: resolved.operator.id,
    });
  }

  let rawOutput: PrimaryAdminPasswordVerifyOutput;
  try {
    rawOutput = await deps.verifyPassword({
      email: resolved.primary.email,
      password,
    });
  } catch {
    recordPrimaryAdminVerifyFailureHit(deps.rateLimitStore, resolved.tenantId, resolved.operator.id, now);
    return denyPrimaryAdminVerify('password_rejected', {
      tenantId: resolved.tenantId,
      requestedBy: resolved.operator.id,
    });
  }

  const ephemeral = sanitizeEphemeralPasswordVerifyOutput(rawOutput);
  const accessToken = rawOutput.accessToken ? String(rawOutput.accessToken) : '';
  if (accessToken && deps.revokeEphemeralSession) {
    try {
      await deps.revokeEphemeralSession(accessToken);
    } catch {
      /* revogação é best-effort; token nunca segue para o browser */
    }
  }

  if (!ephemeral.userId || ephemeral.userId !== resolved.primary.id) {
    recordPrimaryAdminVerifyFailureHit(deps.rateLimitStore, resolved.tenantId, resolved.operator.id, now);
    return denyPrimaryAdminVerify(
      rawOutput.userId && rawOutput.userId !== resolved.primary.id
        ? 'ephemeral_mismatch'
        : 'password_rejected',
      {
        tenantId: resolved.tenantId,
        requestedBy: resolved.operator.id,
      },
    );
  }

  return {
    ok: true,
    reason: 'ok',
    tenantId: resolved.tenantId,
    requestedBy: resolved.operator.id,
    authorizedByUserId: resolved.primary.id,
    authorizedBy: {
      userId: resolved.primary.id,
      displayName: primaryAdminDisplayName(resolved.primary),
      maskedEmail: maskPrimaryAdminEmail(resolved.primary.email),
    },
  };
}

export function buildPrimaryAdminVerifyAuditEvent(
  result: PrimaryAdminVerifyResult,
  timestamp = new Date().toISOString(),
): PrimaryAdminVerifyAuditEvent | null {
  if (!result.tenantId || !result.requestedBy) return null;
  if (result.ok) {
    return {
      action: PRIMARY_ADMIN_VERIFY_SUCCESS_ACTION,
      tenantId: result.tenantId,
      requestedBy: result.requestedBy,
      authorizedBy: result.authorizedByUserId,
      timestamp,
    };
  }
  return {
    action: PRIMARY_ADMIN_VERIFY_FAILURE_ACTION,
    tenantId: result.tenantId,
    requestedBy: result.requestedBy,
    timestamp,
  };
}
