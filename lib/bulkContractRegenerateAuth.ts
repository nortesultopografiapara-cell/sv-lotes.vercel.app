/**
 * Autorização da regeneração em massa (`/api/regenerate`).
 * Não altera templates de contrato. SUPER_ADMIN apenas (helper assertSuperAdmin).
 */

export const BULK_REGENERATE_PATH = '/api/regenerate';

export type BulkRegenerateDenied = {
  allow: false;
  status: 401 | 403 | 503;
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE';
  error: string;
};

export type BulkRegenerateAllowed = {
  allow: true;
  userId: string;
};

export type BulkRegenerateDecision = BulkRegenerateAllowed | BulkRegenerateDenied;

export function isBulkRegeneratePath(pathname: string): boolean {
  return pathname === BULK_REGENERATE_PATH || pathname.startsWith(`${BULK_REGENERATE_PATH}/`);
}

export function isBulkRegenerateRoleAllowed(role?: string | null): boolean {
  return String(role || '') === 'SUPER_ADMIN';
}

export function decideBulkRegenerateAccess(input: {
  userId?: string | null;
  role?: string | null;
  serviceUnavailable?: boolean;
}): BulkRegenerateDecision {
  if (input.serviceUnavailable) {
    return {
      allow: false,
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Serviço indisponível.',
    };
  }
  if (!input.userId) {
    return {
      allow: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Não autenticado.',
    };
  }
  if (!isBulkRegenerateRoleAllowed(input.role)) {
    return {
      allow: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Permissão negada.',
    };
  }
  return { allow: true, userId: input.userId };
}

export function bulkRegenerateUnauthorizedJson() {
  return { error: 'Não autenticado.', code: 'UNAUTHORIZED' as const };
}

export function bulkRegenerateForbiddenJson() {
  return { error: 'Permissão negada.', code: 'FORBIDDEN' as const };
}

export function bulkRegenerateUnavailableJson() {
  return { error: 'Serviço indisponível.', code: 'SERVICE_UNAVAILABLE' as const };
}
