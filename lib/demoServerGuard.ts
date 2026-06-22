import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  DEMO_PASSWORD_BLOCKED_MESSAGE,
  DEMO_SENSITIVE_SETTINGS_MESSAGE,
} from '@/lib/demoRestrictions';

export async function fetchCallerIsDemo(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_demo')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    console.warn('[demoServerGuard] is_demo lookup failed:', error.message);
    return false;
  }

  return data?.is_demo === true;
}

export function demoSensitiveJsonResponse(
  message: string = DEMO_SENSITIVE_SETTINGS_MESSAGE,
  status = 403,
) {
  return NextResponse.json(
    {
      error: message,
      code: 'DEMO_SENSITIVE_BLOCKED',
    },
    { status },
  );
}

export async function rejectIfDemoCaller(
  supabase: SupabaseClient,
  authUserId: string,
  message: string = DEMO_SENSITIVE_SETTINGS_MESSAGE,
) {
  const isDemo = await fetchCallerIsDemo(supabase, authUserId);
  if (!isDemo) return null;
  return demoSensitiveJsonResponse(message);
}

export { DEMO_PASSWORD_BLOCKED_MESSAGE };
