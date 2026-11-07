import { NextResponse } from 'next/server';
import { resolveSupabaseProjectRef } from '@/lib/homolog/env';
import {
  isRecantoSeparateSignalAllowed,
  isRecantoSeparateSignalFormEnabled,
} from '@/lib/recantoSeparateSignalRuntime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const params = new URL(request.url).searchParams;
  const allowed = isRecantoSeparateSignalAllowed(
    params.get('companyId'),
    params.get('projectId'),
  );
  return NextResponse.json({
    projectRef: resolveSupabaseProjectRef(url),
    writeEnabled: allowed,
    formEnabled: allowed && isRecantoSeparateSignalFormEnabled(),
  });
}
