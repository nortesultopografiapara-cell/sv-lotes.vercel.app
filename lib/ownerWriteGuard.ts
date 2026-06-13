import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canManageGisProject,
  isOwnerRole,
  OWNER_READ_ONLY_DENIED_MESSAGE,
} from '@/lib/rolePermissions';

export { OWNER_READ_ONLY_DENIED_MESSAGE };

export function isWriteHttpMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function ownerWriteForbiddenResponse() {
  return NextResponse.json(
    {
      error: OWNER_READ_ONLY_DENIED_MESSAGE,
      code: 'OWNER_READ_ONLY',
    },
    { status: 403 },
  );
}

export function guardOwnerWriteRole(role?: string | null): boolean {
  return !isOwnerRole(role);
}

export function blockOwnerWriteOnClient(role?: string | null): boolean {
  if (guardOwnerWriteRole(role)) return false;
  if (typeof window !== 'undefined') {
    window.alert(OWNER_READ_ONLY_DENIED_MESSAGE);
  }
  return true;
}

/** OWNER não pode usar ferramentas de escrita no mapa GIS (confrontação, memorial, etc.). */
export function ownerMapWriteBlocked(role?: string | null): boolean {
  return isOwnerRole(role);
}

export function ownerMapPopupWriteActionsEnabled(role?: string | null): boolean {
  return !ownerMapWriteBlocked(role) && canManageGisProject(role);
}

const OWNER_MAP_WRITE_ROUTE_PREFIXES = [
  '/api/projects',
  '/api/regenerate',
  '/api/contracts',
] as const;

export function isOwnerBlockedMapWriteRoute(pathname: string, method: string): boolean {
  if (!isWriteHttpMethod(method)) return false;
  return OWNER_MAP_WRITE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function rejectOwnerWriteByUserId(
  admin: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (isOwnerRole(data?.role)) {
    return ownerWriteForbiddenResponse();
  }
  return null;
}
