import { NextResponse } from 'next/server';
import {
  isProductionSupabaseRuntime,
  resolveSupabaseProjectRef,
} from '@/lib/homolog/env';
import {
  isRecantoSeparateSignalAllowed,
  isRecantoSeparateSignalFormEnabled,
} from '@/lib/recantoSeparateSignalRuntime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (isProductionSupabaseRuntime(url)) {
    return NextResponse.json({
      projectRef: null,
      writeEnabled: false,
      formEnabled: false,
    });
  }
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
