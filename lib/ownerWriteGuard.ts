import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOwnerRole, OWNER_READ_ONLY_DENIED_MESSAGE } from '@/lib/rolePermissions';

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
